import { getSupabaseAdmin } from './supabaseClient';
import { getResendClient } from './resendClient';
import { createPaymentLink, centsToMoney } from './stripe';
import {
  onboardingEmail,
  paymentEmail,
  paymentLinkSentNotification,
  paidNotification,
} from './emailTemplates';
import { logError, logInfo } from './logger';

export const MIKE = 'mike@opedge.ai';

const SUBMISSION_FIELDS =
  'id, primary_contact_name, primary_contact_email, legal_name, company_name, assistant_name, onboarding_windows, setup_fee_cents, monthly_fee_cents, stripe_payment_link, status';

/**
 * Resend's SDK resolves with { data, error } and does NOT throw on API-level
 * failures — every send must check the response or a failed send gets logged
 * as success. Throws on failure; logs the Resend email id on success.
 */
async function sendEmail(label: string, payload: Parameters<ReturnType<typeof getResendClient>['emails']['send']>[0]): Promise<string> {
  const { data, error } = await getResendClient().emails.send(payload);
  if (error || !data?.id) {
    throw new Error(`Resend send failed (${label}): ${error?.message || 'no email id returned'}`);
  }
  logInfo(`Email accepted by Resend (${label})`, { resendId: data.id });
  return data.id;
}

async function sendPaymentEmail(submission: any, paymentUrl: string) {
  const email = paymentEmail(submission, paymentUrl);
  await sendEmail('payment email', {
    from: 'noreply@opedge.ai',
    to: submission.primary_contact_email,
    cc: MIKE,
    replyTo: MIKE,
    subject: email.subject,
    html: email.html,
  });
}

async function sendOnboardingEmail(submission: any) {
  const email = onboardingEmail(submission);
  await sendEmail('onboarding email', {
    from: 'noreply@opedge.ai',
    to: submission.primary_contact_email,
    cc: MIKE,
    replyTo: MIKE,
    subject: email.subject,
    html: email.html,
  });
}

async function notifyMike(email: { subject: string; html: string }) {
  try {
    await sendEmail('mike notification', { from: 'noreply@opedge.ai', to: MIKE, subject: email.subject, html: email.html });
  } catch (err) {
    logError('Mike notification failed', { error: (err as Error).message });
  }
}

/**
 * Signed stage: agreement_sent → signed → payment_pending.
 * Creates (or reuses) the Stripe payment link and emails it to the client.
 * Single-winner conditional transitions keep duplicate webhook deliveries
 * from double-sending; a failure after claiming releases the claim so the
 * delivery retry re-attempts.
 */
export async function handleSigned(submissionId: number | string): Promise<string> {
  const supabase = getSupabaseAdmin();

  await supabase
    .from('intake_submissions')
    .update({ status: 'signed' })
    .eq('id', submissionId)
    .eq('status', 'agreement_sent');

  const { data: claimed, error: claimError } = await supabase
    .from('intake_submissions')
    .update({ status: 'payment_pending' })
    .eq('id', submissionId)
    .eq('status', 'signed')
    .select(SUBMISSION_FIELDS)
    .maybeSingle();

  if (claimError) throw new Error(`Status claim failed: ${claimError.message}`);
  if (!claimed) return 'already_processed';

  try {
    let paymentUrl = claimed.stripe_payment_link;
    if (!paymentUrl) {
      const link = await createPaymentLink(claimed.id, claimed.setup_fee_cents, claimed.monthly_fee_cents);
      paymentUrl = link.url;
      await supabase.from('intake_submissions').update({ stripe_payment_link: paymentUrl }).eq('id', submissionId);
    }

    await sendPaymentEmail(claimed, paymentUrl);
    logInfo('Payment link sent', { submissionId });
    await notifyMike(paymentLinkSentNotification(claimed));
    return 'payment_pending';
  } catch (err) {
    await supabase
      .from('intake_submissions')
      .update({ status: 'signed' })
      .eq('id', submissionId)
      .eq('status', 'payment_pending');
    throw err;
  }
}

/**
 * Paid stage: payment_pending → paid → onboarding_sent.
 * Sends the onboarding/scheduling email and the PAID notification.
 */
export async function handlePaid(submissionId: number | string): Promise<string> {
  const supabase = getSupabaseAdmin();

  await supabase
    .from('intake_submissions')
    .update({ status: 'paid' })
    .eq('id', submissionId)
    .eq('status', 'payment_pending');

  const { data: claimed, error: claimError } = await supabase
    .from('intake_submissions')
    .update({ status: 'onboarding_sent' })
    .eq('id', submissionId)
    .eq('status', 'paid')
    .select(SUBMISSION_FIELDS)
    .maybeSingle();

  if (claimError) throw new Error(`Status claim failed: ${claimError.message}`);
  if (!claimed) return 'already_processed';

  try {
    await sendOnboardingEmail(claimed);
    logInfo('Onboarding email sent after payment', { submissionId });
    await notifyMike(paidNotification(claimed));
    return 'onboarding_sent';
  } catch (err) {
    await supabase
      .from('intake_submissions')
      .update({ status: 'paid' })
      .eq('id', submissionId)
      .eq('status', 'onboarding_sent');
    throw err;
  }
}

/**
 * Admin action: re-send the payment email for a payment_pending submission,
 * reusing the stored link (creating one only if it was never stored).
 */
export async function resendPaymentLink(submissionId: number | string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: submission, error } = await supabase
    .from('intake_submissions')
    .select(SUBMISSION_FIELDS)
    .eq('id', submissionId)
    .single();

  if (error || !submission) throw new Error('Submission not found.');
  if (submission.status !== 'payment_pending') {
    throw new Error(`Submission status is "${submission.status}" — resend only applies to payment_pending.`);
  }

  let paymentUrl = submission.stripe_payment_link;
  if (!paymentUrl) {
    const link = await createPaymentLink(submission.id, submission.setup_fee_cents, submission.monthly_fee_cents);
    paymentUrl = link.url;
    await supabase.from('intake_submissions').update({ stripe_payment_link: paymentUrl }).eq('id', submissionId);
  }
  await sendPaymentEmail(submission, paymentUrl);
}

export { centsToMoney };
