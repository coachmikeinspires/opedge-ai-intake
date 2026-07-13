import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { getResendClient } from '@/lib/resendClient';
import { clientConfirmationEmail, adminNotificationEmail } from '@/lib/emailTemplates';
import { getRequestIp, validateClientLink, normalizeFormPayload, querySubmissionByClientId } from '@/lib/intakeHelpers';
import { computeFormDataHash } from '@/lib/dataHash';
import { getFormValidationErrors, IntakeFormPayload, isUuid, isValidIp } from '@/lib/validation';
import { logError, logInfo } from '@/lib/logger';

const NOTIFY_WEBHOOK_URL = process.env.DAKOTA_NOTIFY_WEBHOOK || '';
const MAX_SUBMISSIONS_PER_HOUR = 5;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

async function notifyDakotaBot(data: any) {
  if (!NOTIFY_WEBHOOK_URL) return;
  try {
    await fetch(NOTIFY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'intake_submission', payload: data }),
    });
  } catch (error) {
    logError('Dakota notification failed', { error, webhook: NOTIFY_WEBHOOK_URL });
  }
}

async function retryWithBackoff<T>(fn: () => Promise<T>, maxAttempts = 3, initialDelay = 500): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt >= maxAttempts) break;
      const delay = initialDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('client_id');
  if (!clientId || !isUuid(clientId)) {
    return NextResponse.json({ error: 'Invalid client_id query parameter.' }, { status: 400 });
  }

  if (!(await validateClientLink(clientId))) {
    return NextResponse.json({ error: 'Invalid or expired intake link.' }, { status: 403 });
  }

  const submission = await querySubmissionByClientId(clientId);
  if (!submission) {
    return NextResponse.json({ error: 'No submission found for this client_id.' }, { status: 404 });
  }

  return NextResponse.json({ submission });
}

export async function POST(request: NextRequest) {
  // Both headers are attacker-controlled: reject malformed IPs and cap the
  // user agent so neither can smuggle markup or oversized values downstream.
  const rawIp = getRequestIp(request);
  const ipAddress = rawIp && isValidIp(rawIp) ? rawIp : '0.0.0.0';
  const userAgent = (request.headers.get('user-agent') || 'unknown').slice(0, 400);

  try {
    const payload = (await request.json()) as IntakeFormPayload;
    if (!payload || !payload.client_id || !isUuid(payload.client_id)) {
      return NextResponse.json({ error: 'Invalid or missing client_id.' }, { status: 400 });
    }

    if (!(await validateClientLink(payload.client_id))) {
      return NextResponse.json({ error: 'Invalid or expired intake link.' }, { status: 403 });
    }

    const validationErrors = getFormValidationErrors(payload);
    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors.join(' ') }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const attemptTimestamp = new Date().toISOString();

    const { data: attemptData, error: attemptInsertError } = await supabaseAdmin
      .from('intake_submission_attempts')
      .insert({
        client_id: payload.client_id,
        ip_address: ipAddress,
        user_agent: userAgent,
        attempted_at: attemptTimestamp,
        status: 'pending',
        error_message: null,
      })
      .select('*')
      .single();

    if (attemptInsertError) {
      logError('Unable to record submission attempt', { error: attemptInsertError });
    }

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount, error: rateLimitError } = await supabaseAdmin
      .from('intake_submission_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ipAddress)
      .gte('attempted_at', hourAgo);

    if (rateLimitError) {
      logError('Rate limit lookup failed', { error: rateLimitError });
    }

    if ((recentCount ?? 0) >= MAX_SUBMISSIONS_PER_HOUR) {
      await supabaseAdmin
        .from('intake_submission_attempts')
        .update({ status: 'failed', error_message: 'rate_limit_exceeded' })
        .eq('id', attemptData?.id);
      return NextResponse.json({ error: 'Too many submissions from this IP address. Please try again later.' }, { status: 429 });
    }

    const duplicateWindow = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
    const { data: existingSubmission, error: existingError } = await supabaseAdmin
      .from('intake_submissions')
      .select('submitted_at')
      .eq('client_id', payload.client_id)
      .gte('submitted_at', duplicateWindow)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      logError('Duplicate submission lookup failed', { error: existingError });
    }

    if (existingSubmission) {
      await supabaseAdmin
        .from('intake_submission_attempts')
        .update({ status: 'failed', error_message: 'duplicate_submission' })
        .eq('id', attemptData?.id);
      return NextResponse.json({ error: 'This intake link has already been used recently. Please contact your Opendge representative.' }, { status: 409 });
    }

    const sanitizedPayload = normalizeFormPayload(payload);
    const formDataHash = computeFormDataHash(sanitizedPayload);
    const record = {
      client_id: sanitizedPayload.client_id,
      company_name: sanitizedPayload.company_name || null,
      primary_contact_name: sanitizedPayload.primary_contact_name || null,
      primary_contact_email: sanitizedPayload.primary_contact_email || null,
      primary_contact_phone: sanitizedPayload.primary_contact_phone || null,
      team_contacts: sanitizedPayload.team_contacts || [],
      email_accounts: sanitizedPayload.email_accounts || [],
      products_subscribed: sanitizedPayload.service_subscribed ? [sanitizedPayload.service_subscribed] : [],
      autoleads_verticals: sanitizedPayload.autoleads_verticals || [],
      autoleads_campaign_goals: sanitizedPayload.autoleads_campaign_goals || null,
      frank_workflows: sanitizedPayload.frank_workflows ? { workflow: sanitizedPayload.frank_workflows } : {},
      dakota_preferences: sanitizedPayload.dakota_preferences ? { preferences: sanitizedPayload.dakota_preferences } : {},
      google_workspace_verified: sanitizedPayload.google_workspace_verified || false,
      google_workspace_email: sanitizedPayload.google_workspace_email || null,
      google_workspace_domain: sanitizedPayload.google_workspace_domain || null,
      social_links: sanitizedPayload.social_links || {},
      landing_page_urls: sanitizedPayload.landing_page_urls || [],
      kickoff_date: sanitizedPayload.kickoff_date || null,
      launch_date: sanitizedPayload.launch_date || null,
      notes: sanitizedPayload.notes || null,
      legal_name: sanitizedPayload.legal_name || null,
      business_address: sanitizedPayload.business_address || null,
      primary_google_account: sanitizedPayload.primary_google_account || null,
      client_timezone: sanitizedPayload.client_timezone || null,
      assistant_name: sanitizedPayload.assistant_name || null,
      onboarding_windows: sanitizedPayload.onboarding_windows || null,
      form_data_hash: formDataHash,
      submitted_at: attemptTimestamp,
      ip_address: ipAddress,
      user_agent: userAgent,
      is_verified: false,
      mike_notified: false,
      dennis_notified: false,
    };

    const { data, error: insertError } = await supabaseAdmin
      .from('intake_submissions')
      .insert(record)
      .select('*')
      .single();

    if (insertError) {
      logError('Supabase insert failed', { error: insertError });
      await supabaseAdmin
        .from('intake_submission_attempts')
        .update({ status: 'failed', error_message: 'db_insert_failure' })
        .eq('id', attemptData?.id);
      return NextResponse.json({ error: 'Unable to save submission. Please try again.' }, { status: 500 });
    }

    const resendClient = getResendClient();

    try {
      if (sanitizedPayload.primary_contact_email) {
        const confirmation = clientConfirmationEmail(sanitizedPayload.primary_contact_name || 'there', sanitizedPayload);
        await retryWithBackoff(() => resendClient.emails.send({
          from: 'noreply@opedge.ai',
          to: sanitizedPayload.primary_contact_email,
          subject: confirmation.subject,
          html: confirmation.html,
        }));
      }

      const adminEmail = adminNotificationEmail({
        ...sanitizedPayload,
        submitted_at: attemptTimestamp,
        ip_address: ipAddress,
        user_agent: userAgent,
      });
      await retryWithBackoff(() => resendClient.emails.send({
        from: 'noreply@opedge.ai',
        to: ['mike@opedge.ai'],
        subject: adminEmail.subject,
        html: adminEmail.html,
      }));
    } catch (emailError) {
      logError('Email notification failed', { error: emailError, clientId: payload.client_id, ipAddress });
      await supabaseAdmin
        .from('intake_submissions')
        .delete()
        .eq('client_id', payload.client_id);
      await supabaseAdmin
        .from('intake_submission_attempts')
        .update({ status: 'failed', error_message: 'email_send_failure' })
        .eq('id', attemptData?.id);
      return NextResponse.json({ error: 'Unable to send notification emails. Please try again.' }, { status: 500 });
    }

    await notifyDakotaBot({ ...sanitizedPayload, submitted_at: attemptTimestamp, ip_address: ipAddress, user_agent: userAgent });
    await supabaseAdmin
      .from('intake_submissions')
      .update({ mike_notified: true })
      .eq('client_id', payload.client_id);
    await supabaseAdmin
      .from('intake_submission_attempts')
      .update({ status: 'completed', error_message: null })
      .eq('id', attemptData?.id);

    logInfo('Intake submitted successfully', { clientId: payload.client_id, ipAddress });
    return NextResponse.json({ success: true, submitted_at: attemptTimestamp });
  } catch (error) {
    logError('API error', { error, ipAddress });
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
