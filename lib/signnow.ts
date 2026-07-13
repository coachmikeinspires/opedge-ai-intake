// SignNow integration: copy a template, prefill sender text fields, and send
// a two-signer invite. Access tokens are obtained/refreshed automatically by
// lib/signnowAuth; SIGNNOW_TEMPLATE_ID comes from env.

import { SIGNNOW_BASE, getSignNowAccessToken, isSignNowAuthFailure } from './signnowAuth';

export type AgreementPricing = {
  setup_fee: number;
  monthly_fee: number;
  handover_fee?: number | null;
  usage_ceiling_text?: string | null;
};

export type AgreementSubmission = {
  legal_name: string | null;
  business_address: string | null;
  primary_contact_email: string | null;
  client_timezone: string | null;
  company_name: string | null;
};

function requireEnv(name: 'SIGNNOW_TEMPLATE_ID'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function snFetch(path: string, init: RequestInit, token: string) {
  const res = await fetch(`${SIGNNOW_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { ok: res.ok, status: res.status, body };
}

async function sn(path: string, init: RequestInit = {}) {
  let token = await getSignNowAccessToken();
  let res = await snFetch(path, init, token);

  // Expired/revoked access token: refresh once and retry the call.
  if (!res.ok && isSignNowAuthFailure(res.status, res.body)) {
    token = await getSignNowAccessToken(true);
    res = await snFetch(path, init, token);
  }

  if (!res.ok) {
    const detail = res.body?.errors?.[0]?.message || res.body?.error || res.body?.message || `HTTP ${res.status}`;
    throw new Error(`SignNow ${init.method || 'GET'} ${path} failed: ${detail}`);
  }
  return res.body;
}

export function formatMoney(value: number): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function effectiveDatePacific(now = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(now);
}

/**
 * Builds the exact prefill payload for the template's sender text fields.
 * Optional money fields render as "N/A" when not provided so the agreement
 * never ships with a blank price line.
 */
export function buildPrefillFields(submission: AgreementSubmission, pricing: AgreementPricing) {
  return [
    { field_name: 'client_legal_name', prefilled_text: submission.legal_name || '' },
    { field_name: 'business_address', prefilled_text: submission.business_address || '' },
    { field_name: 'client_email', prefilled_text: submission.primary_contact_email || '' },
    { field_name: 'effective_date', prefilled_text: effectiveDatePacific() },
    { field_name: 'client_timezone', prefilled_text: submission.client_timezone || '' },
    { field_name: 'setup_fee', prefilled_text: formatMoney(pricing.setup_fee) },
    { field_name: 'monthly_fee', prefilled_text: formatMoney(pricing.monthly_fee) },
    { field_name: 'handover_fee', prefilled_text: pricing.handover_fee != null ? formatMoney(pricing.handover_fee) : 'N/A' },
    { field_name: 'usage_ceiling', prefilled_text: pricing.usage_ceiling_text?.trim() || 'N/A' },
  ];
}

/**
 * Fetches a document from SignNow. Used by the webhook to verify that a
 * completion event is genuine before acting on it.
 */
export async function getDocument(documentId: string): Promise<any> {
  if (!/^[a-f0-9]{20,64}$/i.test(documentId)) throw new Error('Invalid document id format.');
  return sn(`/document/${documentId}`);
}

/** True when every signer invite on the document is fulfilled. */
export function isDocumentComplete(doc: any): boolean {
  const invites: Array<{ status?: string }> = doc?.field_invites || [];
  return invites.length > 0 && invites.every((i) => i.status === 'fulfilled');
}

/** All signer emails on the document, lowercased. */
export function documentSignerEmails(doc: any): string[] {
  const invites: Array<{ email?: string }> = doc?.field_invites || [];
  return invites.map((i) => (i.email || '').toLowerCase()).filter(Boolean);
}

/**
 * Copies the template, prefills the sender fields, and sends the invite with
 * the client as signer 1 and mike@opedge.ai as signer 2. Role ids and the
 * account sender email are read from SignNow so nothing is hardcoded to the
 * template's internals.
 */
export async function generateAndSendAgreement(
  submission: AgreementSubmission,
  pricing: AgreementPricing,
  secondSigner: string,
): Promise<{ documentId: string; documentName: string }> {
  const templateId = requireEnv('SIGNNOW_TEMPLATE_ID');
  const clientEmail = submission.primary_contact_email;
  if (!clientEmail) throw new Error('Submission has no primary contact email.');

  const documentName = `Op Edge AI Agreement — ${submission.legal_name || submission.company_name || clientEmail}`;

  // (a) create a document from the template
  const copy = await sn(`/template/${templateId}/copy`, {
    method: 'POST',
    body: JSON.stringify({ document_name: documentName }),
  });
  const documentId = copy.id;
  if (!documentId) throw new Error('SignNow template copy returned no document id.');

  // (b) prefill sender text fields
  await sn(`/v2/documents/${documentId}/prefill-texts`, {
    method: 'PUT',
    body: JSON.stringify({ fields: buildPrefillFields(submission, pricing) }),
  });

  // (c) send the invite — resolve roles and the account email dynamically
  const [doc, user] = await Promise.all([sn(`/document/${documentId}`), sn('/user')]);
  const roles: Array<{ unique_id: string; name: string; signing_order: string | number }> = doc.roles || [];
  if (roles.length !== 2) {
    throw new Error(`Template has ${roles.length} signer role(s); exactly 2 are required (client, Op Edge AI).`);
  }
  const ordered = [...roles].sort((a, b) => Number(a.signing_order) - Number(b.signing_order));
  const fromEmail = user.primary_email || user.emails?.[0];
  if (!fromEmail) throw new Error('Could not resolve SignNow account email for the invite sender.');

  const signerEmails = [clientEmail, secondSigner];
  await sn(`/document/${documentId}/invite`, {
    method: 'POST',
    body: JSON.stringify({
      document_id: documentId,
      from: fromEmail,
      to: ordered.map((role, i) => ({
        email: signerEmails[i],
        role_id: role.unique_id,
        role: role.name,
        order: Number(role.signing_order),
      })),
      subject: 'Your Op Edge AI service agreement is ready to sign',
      message: 'Please review and sign your Op Edge AI service agreement.',
    }),
  });

  return { documentId, documentName };
}
