import { NextRequest, NextResponse } from 'next/server';
import { verifyStripeSignature } from '@/lib/stripe';
import { handlePaid } from '@/lib/pipeline';
import { logError, logInfo } from '@/lib/logger';

// Stripe webhook: on checkout.session.completed carrying our submission_id
// metadata, run the paid-stage transitions (payment_pending → paid →
// onboarding_sent). Signature verification is mandatory — without
// STRIPE_WEBHOOK_SECRET configured, every delivery is rejected.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret) {
    logError('Stripe webhook received but STRIPE_WEBHOOK_SECRET is not set', {});
    return NextResponse.json({ error: 'webhook not configured' }, { status: 500 });
  }
  if (!verifyStripeSignature(rawBody, request.headers.get('stripe-signature'), secret)) {
    logError('Stripe webhook signature verification failed', {});
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: any = {};
  try { event = JSON.parse(rawBody); } catch { event = {}; }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ ok: true, ignored: `event ${event.type || 'unknown'}` });
  }

  const session = event.data?.object || {};
  const submissionId = session.metadata?.submission_id;
  if (!submissionId || !/^\d+$/.test(String(submissionId))) {
    return NextResponse.json({ ok: true, ignored: 'no submission_id metadata' });
  }
  if (session.payment_status && session.payment_status !== 'paid') {
    return NextResponse.json({ ok: true, ignored: `payment_status ${session.payment_status}` });
  }

  try {
    const result = await handlePaid(submissionId);
    logInfo('Stripe webhook processed', { submissionId, result });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    logError('Stripe webhook processing failed', { submissionId, error: (err as Error).message });
    // Non-2xx so Stripe retries the delivery.
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
