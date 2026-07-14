import { NextRequest, NextResponse } from 'next/server';
import { getResendClient } from '@/lib/resendClient';
import { isValidAdminToken } from '@/lib/adminAuth';
import {
  adminNotificationEmail,
  agreementSentEmail,
  agreementErrorEmail,
  paymentEmail,
  paymentLinkSentNotification,
  paidNotification,
  onboardingEmail,
} from '@/lib/emailTemplates';

const MIKE = 'mike@opedge.ai';

// Admin-gated QA helper: renders every internal pipeline notification with
// sample data and sends them to mike@opedge.ai with a [PREVIEW] subject
// prefix. No state is read or written.
export async function POST(request: NextRequest) {
  if (!isValidAdminToken(request.nextUrl.searchParams.get('token'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sample = {
    client_id: '00000000-0000-4000-8000-000000000000',
    company_name: 'Sample Co',
    primary_contact_name: 'Sam Sample',
    primary_contact_email: 'client@example.com',
    legal_name: 'Sample Ventures LLC',
    client_timezone: 'America/Los_Angeles',
    assistant_name: 'Aria',
    onboarding_windows: 'Weekday mornings 9-11am PT',
    submitted_at: new Date().toISOString(),
    ip_address: '203.0.113.7',
    user_agent: 'PreviewBot/1.0',
    setup_fee_cents: 250000,
    monthly_fee_cents: 75000,
  };

  const previews = [
    { name: 'new_intake', email: adminNotificationEmail(sample) },
    {
      name: 'agreement_sent',
      email: agreementSentEmail({
        legal_name: sample.legal_name,
        company_name: sample.company_name,
        primary_contact_email: sample.primary_contact_email,
        documentName: 'Op Edge AI Agreement — Sample Ventures LLC',
        documentId: 'a66aaa37462a41fa8a272c5d5ee50725066e9f5b',
        setupFeeText: '$2,500',
        monthlyFeeText: '$750',
        secondSigner: MIKE,
      }),
    },
    { name: 'signnow_error', email: agreementErrorEmail('SignNow POST /template/.../copy failed: invalid_token') },
    { name: 'payment_email_client', email: paymentEmail(sample, 'https://buy.stripe.com/test_preview_link') },
    { name: 'payment_link_sent_notification', email: paymentLinkSentNotification(sample) },
    { name: 'paid_notification', email: paidNotification(sample) },
    { name: 'onboarding_email_client', email: onboardingEmail(sample) },
  ];

  const resend = getResendClient();
  const sent: string[] = [];
  for (const p of previews) {
    await resend.emails.send({
      from: 'noreply@opedge.ai',
      to: MIKE,
      subject: `[PREVIEW] ${p.email.subject}`,
      html: p.email.html,
    });
    sent.push(p.name);
  }

  return NextResponse.json({ ok: true, sent });
}
