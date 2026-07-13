#!/usr/bin/env node
// One-time SignNow webhook registration for the intake service.
//
// Usage (from intake/, after SIGNNOW_API_TOKEN is available):
//   SIGNNOW_API_TOKEN=... node scripts/register-signnow-webhook.mjs
// or, with the token already in .env.local:
//   node --env-file=.env.local scripts/register-signnow-webhook.mjs
//
// Subscribes the account to `user.document.complete` (fires when ALL signers
// have signed any document owned by this account) pointing at the production
// webhook. Safe to re-run: it skips registration if the callback already
// exists. Optionally set SIGNNOW_WEBHOOK_SECRET to have SignNow sign
// callbacks; set the same value on the Railway service.

const BASE = 'https://api.signnow.com';
const CALLBACK_URL = process.env.SIGNNOW_CALLBACK_URL || 'https://intake.opedge.ai/api/signnow-webhook';
const TOKEN = process.env.SIGNNOW_API_TOKEN;

if (!TOKEN) {
  console.error('SIGNNOW_API_TOKEN is required (env var or .env.local via --env-file).');
  process.exit(1);
}

async function sn(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${init.method || 'GET'} ${path} → HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

const user = await sn('/user');
const userId = user.id;
if (!userId) throw new Error('Could not resolve SignNow user id.');
console.log(`SignNow account: ${user.primary_email || '(email hidden)'}`);

const existing = await sn('/v2/event-subscriptions');
const events = existing.data || existing || [];
const already = (Array.isArray(events) ? events : []).find(
  (e) => e?.json_attributes?.callback_url === CALLBACK_URL || e?.attributes?.callback === CALLBACK_URL
);
if (already) {
  console.log(`Webhook already registered (event: ${already.event || 'unknown'}). Nothing to do.`);
  process.exit(0);
}

const attributes = { callback: CALLBACK_URL };
if (process.env.SIGNNOW_WEBHOOK_SECRET) attributes.secret_key = process.env.SIGNNOW_WEBHOOK_SECRET;

await sn('/v2/event-subscriptions', {
  method: 'POST',
  body: JSON.stringify({
    event: 'user.document.complete',
    entity_id: userId,
    action: 'callback',
    attributes,
  }),
});

console.log(`Registered user.document.complete → ${CALLBACK_URL}`);
if (!process.env.SIGNNOW_WEBHOOK_SECRET) {
  console.log('Note: no SIGNNOW_WEBHOOK_SECRET set — callbacks will be verified via the SignNow API only (still safe).');
}
