import crypto from 'crypto';

// Stripe integration via plain fetch (form-encoded API). Test/sandbox mode is
// determined entirely by which STRIPE_SECRET_KEY is set in the environment.
//
// TODO(recurring-billing): first month is a one-time line item for now.
// Subscriptions (monthly recurring price + customer portal) come later.

const STRIPE_BASE = 'https://api.stripe.com';

function requireKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is required.');
  return key;
}

async function stripeFetch(path: string, params: Record<string, string | number>) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.set(k, String(v));

  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Stripe ${path} failed: ${json?.error?.message || `HTTP ${res.status}`}`);
  }
  return json;
}

/**
 * Creates a Payment Link with the two one-time line items for a submission.
 * Metadata carries the submission id; Stripe copies payment-link metadata
 * onto the checkout sessions it creates, which is how the webhook correlates
 * payments back to our records.
 */
export async function createPaymentLink(submissionId: number | string, setupFeeCents: number, monthlyFeeCents: number) {
  if (!Number.isInteger(setupFeeCents) || setupFeeCents <= 0 || !Number.isInteger(monthlyFeeCents) || monthlyFeeCents <= 0) {
    throw new Error('Submission has no stored fees — cannot create a payment link.');
  }

  const setupPrice = await stripeFetch('/v1/prices', {
    unit_amount: setupFeeCents,
    currency: 'usd',
    'product_data[name]': 'Op Edge AI — Setup Fee',
  });
  const monthPrice = await stripeFetch('/v1/prices', {
    unit_amount: monthlyFeeCents,
    currency: 'usd',
    'product_data[name]': 'Op Edge AI — First Month Service',
  });

  const link = await stripeFetch('/v1/payment_links', {
    'line_items[0][price]': setupPrice.id,
    'line_items[0][quantity]': 1,
    'line_items[1][price]': monthPrice.id,
    'line_items[1][quantity]': 1,
    'metadata[submission_id]': String(submissionId),
  });

  if (!link.url) throw new Error('Stripe returned a payment link without a URL.');
  return { url: link.url as string, id: link.id as string };
}

export function centsToMoney(cents: number | null | undefined): string {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '—';
  const dollars = n / 100;
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Verifies a Stripe webhook signature (Stripe-Signature header:
 * `t=<ts>,v1=<hmac>` where hmac = HMAC-SHA256(secret, `${ts}.${rawBody}`)).
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, toleranceSec = 300): boolean {
  if (!header || !secret) return false;
  const ts = /(?:^|,)t=(\d+)/.exec(header)?.[1];
  const sigs = [...header.matchAll(/(?:^|,)v1=([0-9a-f]+)/g)].map((m) => m[1]);
  if (!ts || sigs.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSec) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  const expectedBuf = crypto.createHash('sha256').update(expected).digest();
  return sigs.some((sig) => {
    const sigBuf = crypto.createHash('sha256').update(sig).digest();
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}
