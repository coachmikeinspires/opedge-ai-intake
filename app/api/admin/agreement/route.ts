import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { getResendClient } from '@/lib/resendClient';
import { isValidAdminToken } from '@/lib/adminAuth';
import { buildPrefillFields, generateAndSendAgreement, formatMoney, AgreementPricing } from '@/lib/signnow';
import { agreementSentEmail, agreementErrorEmail } from '@/lib/emailTemplates';
import { logError, logInfo } from '@/lib/logger';

const ADMIN_NOTIFY = 'mike@opedge.ai';
const SECOND_SIGNER = 'mike@opedge.ai';

function redirectBack(request: NextRequest, token: string, params: Record<string, string>) {
  const url = new URL('/admin', request.nextUrl.origin);
  url.searchParams.set('token', token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

function parseFee(value: FormDataEntryValue | null, required: boolean): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) {
    if (required) throw new Error('Setup fee and monthly fee are required.');
    return null;
  }
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) throw new Error(`Invalid fee value: ${raw}`);
  return num;
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const token = String(form.get('token') ?? '');

  if (!isValidAdminToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const submissionId = String(form.get('submission_id') ?? '');
    if (!submissionId) throw new Error('Missing submission_id.');

    const pricing: AgreementPricing = {
      setup_fee: parseFee(form.get('setup_fee'), true)!,
      monthly_fee: parseFee(form.get('monthly_fee'), true)!,
      handover_fee: parseFee(form.get('handover_fee'), false),
      usage_ceiling_text: String(form.get('usage_ceiling_text') ?? '').trim() || null,
    };

    const supabase = getSupabaseAdmin();
    const { data: submission, error: fetchError } = await supabase
      .from('intake_submissions')
      .select('id, legal_name, business_address, primary_contact_email, primary_contact_name, company_name, client_timezone, status')
      .eq('id', submissionId)
      .single();

    if (fetchError || !submission) throw new Error('Submission not found.');
    if (submission.status !== 'intake_received') {
      throw new Error(`Submission status is "${submission.status}" — agreement can only be sent from "intake_received".`);
    }

    // Dry run: return the exact SignNow payloads without calling SignNow or
    // changing any state. Only reachable with a valid admin token.
    if (String(form.get('dry_run') ?? '') === '1') {
      return NextResponse.json({
        dry_run: true,
        template_id_env: 'SIGNNOW_TEMPLATE_ID (value not printed)',
        prefill_fields: buildPrefillFields(submission, pricing),
        invite: {
          signer_1: submission.primary_contact_email,
          signer_2: SECOND_SIGNER,
          subject: 'Your Op Edge AI service agreement is ready to sign',
        },
      });
    }

    const { documentId, documentName } = await generateAndSendAgreement(submission, pricing, SECOND_SIGNER);

    const { error: updateError } = await supabase
      .from('intake_submissions')
      .update({
        status: 'agreement_sent',
        signnow_document_id: documentId,
        setup_fee_cents: Math.round(pricing.setup_fee * 100),
        monthly_fee_cents: Math.round(pricing.monthly_fee * 100),
      })
      .eq('id', submissionId);
    if (updateError) logError('Status update to agreement_sent failed', { error: updateError, submissionId });

    logInfo('Agreement sent', { submissionId, documentId });
    try {
      const email = agreementSentEmail({
        legal_name: submission.legal_name,
        company_name: submission.company_name,
        primary_contact_email: submission.primary_contact_email,
        documentName,
        documentId,
        setupFeeText: formatMoney(pricing.setup_fee),
        monthlyFeeText: formatMoney(pricing.monthly_fee),
        secondSigner: SECOND_SIGNER,
      });
      await getResendClient().emails.send({
        from: 'noreply@opedge.ai',
        to: ADMIN_NOTIFY,
        subject: email.subject,
        html: email.html,
      });
    } catch (emailError) {
      logError('Agreement confirmation email failed', { error: emailError, submissionId });
    }

    return redirectBack(request, token, { sent: '1' });
  } catch (err) {
    const message = (err as Error).message || 'Agreement generation failed.';
    logError('Agreement generation failed', { error: message });
    try {
      const email = agreementErrorEmail(message);
      await getResendClient().emails.send({
        from: 'noreply@opedge.ai',
        to: ADMIN_NOTIFY,
        subject: email.subject,
        html: email.html,
      });
    } catch (emailError) {
      logError('Agreement failure email failed', { error: emailError });
    }
    return redirectBack(request, token, { error: encodeURIComponent(message) });
  }
}
