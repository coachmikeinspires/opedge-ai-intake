import { sanitizeText } from './validation';

// CONTRACT: both email builders must be called with payload values that have
// already passed through sanitizePayload (see normalizeFormPayload) — strings
// are HTML-escaped there exactly once. Only non-payload values (client_id,
// ip_address, user_agent) are escaped at the template layer below.
type AssistantSetupDetails = {
  legal_name?: string;
  business_address?: string;
  primary_google_account?: string;
  client_timezone?: string;
  assistant_name?: string;
  onboarding_windows?: string;
};

function assistantSetupSummary(details?: AssistantSetupDetails) {
  if (!details?.legal_name && !details?.primary_google_account && !details?.client_timezone) return '';
  const line = (label: string, value?: string) => (value ? `<li style="margin:0 0 6px;">${label}: ${value}</li>` : '');
  return `<p style="margin:0 0 8px; color:#cbd5e1;">Your AI assistant setup details:</p><ul style="margin:0 0 16px; padding-left:20px; color:#cbd5e1;">${
    line('Legal name', details.legal_name)
  }${line('Business address', details.business_address)}${
    line('Primary Google account', details.primary_google_account)
  }${line('Time zone', details.client_timezone)}${
    line('Assistant name', details.assistant_name)
  }${line('Preferred setup session times', details.onboarding_windows)}</ul>`;
}

export function clientConfirmationEmail(name: string, details?: AssistantSetupDetails) {
  return {
    subject: 'Thanks for submitting your Op Edge AI intake form',
    html: `<html><body style="font-family: Inter, sans-serif; background:#020617; color:#e2e8f0; padding:24px;"><div style="max-width:600px; margin:0 auto; background:#0f172a; border:1px solid rgba(148,163,184,.16); border-radius:20px; padding:28px;"><h1 style="margin:0 0 16px;font-size:24px;color:#bfdbfe;">Thanks for submitting, ${name}</h1><p style="margin:0 0 16px; color:#cbd5e1;">We received your intake submission and our team will review it shortly.</p>${assistantSetupSummary(details)}<p style="margin:0 0 16px; color:#cbd5e1;">Next steps: validation, clarification, and campaign kickoff planning. If we need anything else, we’ll reach out to the address you provided.</p><p style="margin:0; color:#cbd5e1;">Warm regards,<br/>The Op Edge AI team</p></div></body></html>`,
  };
}

// ---------------------------------------------------------------------------
// Action links for internal notifications to mike@opedge.ai. The admin URL is
// built from ADMIN_TOKEN at send time — never hardcoded.
// ---------------------------------------------------------------------------

const INTAKE_BASE = process.env.INTAKE_PUBLIC_URL || 'https://intake.opedge.ai';

export function adminQueueUrl(): string {
  return `${INTAKE_BASE}/admin?token=${encodeURIComponent(process.env.ADMIN_TOKEN || '')}`;
}

export function signnowDocumentUrl(documentId: string): string {
  return `https://app.signnow.com/webapp/document/${encodeURIComponent(documentId)}`;
}

function actionLinksHtml(links: Array<{ label: string; url: string }>) {
  const buttons = links
    .map((l) => `<a href="${l.url.replace(/"/g, '&quot;')}" style="display:inline-block;margin:0 10px 8px 0;padding:10px 16px;border-radius:10px;background:#2563eb;color:#e0f2fe;text-decoration:none;font-weight:600;">${sanitizeText(l.label)}</a>`)
    .join('');
  return `<div style="margin:18px 0 4px;"><p style="margin:0 0 8px;font-weight:700;color:#f8fafc;">Actions</p>${buttons}</div>`;
}

function internalShell(title: string, bodyHtml: string) {
  return `<html><body style="font-family: Inter, sans-serif; background:#020617; color:#e2e8f0; padding:24px;"><div style="max-width:700px; margin:0 auto; background:#0f172a; border:1px solid rgba(148,163,184,.16); border-radius:20px; padding:28px;"><h1 style="margin:0 0 20px; font-size:24px; color:#bfdbfe;">${sanitizeText(title)}</h1>${bodyHtml}</div></body></html>`;
}

// ---------------------------------------------------------------------------
// Internal pipeline notifications (all to mike@opedge.ai)
// ---------------------------------------------------------------------------

export function agreementSentEmail(data: {
  legal_name?: string | null;
  company_name?: string | null;
  primary_contact_email?: string | null;
  documentName: string;
  documentId: string;
  setupFeeText: string;
  monthlyFeeText: string;
  secondSigner: string;
}) {
  const who = data.legal_name || data.company_name || data.primary_contact_email || 'client';
  const body = `<p style="margin:0 0 16px; color:#cbd5e1;">The service agreement was generated and sent for signing.</p><ul style="margin:0 0 8px; padding-left:20px; color:#cbd5e1;"><li style="margin:0 0 6px;">Document: ${sanitizeText(data.documentName)}</li><li style="margin:0 0 6px;">Signer 1 (client): ${sanitizeText(data.primary_contact_email || '—')}</li><li style="margin:0 0 6px;">Signer 2: ${sanitizeText(data.secondSigner)}</li><li style="margin:0 0 6px;">Setup fee: ${sanitizeText(data.setupFeeText)}</li><li style="margin:0 0 6px;">Monthly fee: ${sanitizeText(data.monthlyFeeText)}</li></ul>${actionLinksHtml([
    { label: 'View document in SignNow', url: signnowDocumentUrl(data.documentId) },
    { label: 'Open intake queue', url: adminQueueUrl() },
  ])}`;
  return {
    subject: `Agreement sent: ${String(who).replace(/[\r\n]+/g, ' ')}`,
    html: internalShell('Agreement sent for signing', body),
  };
}

export function agreementErrorEmail(message: string) {
  const body = `<p style="margin:0 0 16px; color:#cbd5e1;">Generating/sending an agreement failed. The submission status was not changed.</p><p style="margin:0 0 12px; color:#fca5a5;">Error: ${sanitizeText(message)}</p><p style="margin:0 0 12px; color:#cbd5e1;">If SignNow auth failed: token may be expired (password-grant tokens last ~30 days); regenerate and update SIGNNOW_API_TOKEN in Railway.</p>${actionLinksHtml([
    { label: 'Open intake queue', url: adminQueueUrl() },
  ])}`;
  return {
    subject: 'Agreement send FAILED',
    html: internalShell('Agreement send failed', body),
  };
}

export function signedNotificationEmail(data: { primary_contact_name?: string | null; onboarding_windows?: string | null }) {
  const name = sanitizeText(data.primary_contact_name || '') || 'Client';
  const windows = sanitizeText(data.onboarding_windows || '');
  const body = `<p style="margin:0 0 16px; color:#cbd5e1;">${name} completed signing. The onboarding email went out to them automatically (you were CC'd).</p>${
    windows ? `<p style="margin:0 0 16px; color:#cbd5e1;">Their stated availability: <strong style="color:#e2e8f0;">${windows}</strong></p>` : ''
  }<p style="margin:0 0 12px; color:#cbd5e1;"><strong style="color:#e2e8f0;">Next human step:</strong> reply to confirm their setup session time by email.</p>${actionLinksHtml([
    { label: 'Open intake queue', url: adminQueueUrl() },
  ])}`;
  return {
    subject: `${String(data.primary_contact_name || 'Client').replace(/[\r\n]+/g, ' ')} signed — onboarding email sent automatically`,
    html: internalShell(`${name} signed 🎉`, body),
  };
}

/**
 * Post-signature onboarding email. Values may come straight from the DB, so
 * everything user-derived is escaped here at render time.
 */
export function onboardingEmail(data: { primary_contact_name?: string | null; assistant_name?: string | null; onboarding_windows?: string | null }) {
  const name = sanitizeText(data.primary_contact_name || '') || 'there';
  const assistant = sanitizeText(data.assistant_name || '');
  const windows = sanitizeText(data.onboarding_windows || '');

  const availability = windows
    ? `<p style="margin:0 0 16px; color:#cbd5e1;">You mentioned these times work for you: <strong style="color:#e2e8f0;">${windows}</strong>. Reply to this email to confirm one, or suggest another — Mike will confirm the final time by email.</p>`
    : `<p style="margin:0 0 16px; color:#cbd5e1;">Reply to this email with a few days and times that work for you — Mike will confirm the final time by email.</p>`;

  const checklist = [
    'A laptop with Google Chrome installed',
    'Your Google password available',
    'Your phone in hand for two-factor authentication',
    'Telegram installed (phone and/or desktop)',
  ].map((item) => `<li style="margin:0 0 8px;">${item}</li>`).join('');

  return {
    subject: "Welcome to Op Edge AI — let's schedule your setup",
    html: `<html><body style="font-family: Inter, sans-serif; background:#020617; color:#e2e8f0; padding:24px;"><div style="max-width:600px; margin:0 auto; background:#0f172a; border:1px solid rgba(148,163,184,.16); border-radius:20px; padding:28px;"><h1 style="margin:0 0 16px;font-size:24px;color:#bfdbfe;">Welcome to Op Edge AI, ${name}!</h1><p style="margin:0 0 16px; color:#cbd5e1;">Your agreement is signed and we're ready to bring ${assistant ? `<strong style="color:#e2e8f0;">${assistant}</strong>, ` : ''}your managed AI assistant${assistant ? ',' : ''} online.</p><p style="margin:0 0 16px; color:#cbd5e1;"><strong style="color:#e2e8f0;">What happens next:</strong> we'll do a 30–45 minute supervised setup session together to connect your accounts and introduce you to your assistant.</p>${availability}<p style="margin:0 0 8px; color:#e2e8f0;"><strong>Before the session, please have ready:</strong></p><ul style="margin:0 0 16px; padding-left:20px; color:#cbd5e1;">${checklist}</ul><p style="margin:0; color:#cbd5e1;">Talk soon,<br/>The Op Edge AI team</p></div></body></html>`,
  };
}

function formatBadge(label: string) {
  return `<span style="display:inline-block;margin:0 4px 6px;padding:6px 10px;border-radius:999px;background:#2563eb;color:#e0f2fe;font-size:0.84rem;">${label}</span>`;
}

function formatSection(title: string, content: string) {
  return `<tr><td style="padding:12px 0 4px; font-weight:700; color:#f8fafc;">${title}</td></tr><tr><td style="padding-bottom:10px; color:#cbd5e1;">${content}</td></tr>`;
}

function safeJson(value: any) {
  return `<pre style="background:#020617;border:1px solid rgba(148,163,184,.16);border-radius:14px;padding:14px;color:#f8fafc;">${JSON.stringify(value, null, 2)}</pre>`;
}

export function adminNotificationEmail(data: any) {
  const productBadges = (data.products_subscribed || []).map((product: string) => formatBadge(product)).join('');
  const serviceLabel = data.products_subscribed?.length ? data.products_subscribed.join(', ') : 'None';
  const otherDetails = data.other_service_details ? `<br/>Details: ${sanitizeText(data.other_service_details)}` : '';

  const rows = [
    formatSection('Company & Contact Info', `Company: ${data.company_name || '—'}<br/>Primary contact: ${data.primary_contact_name || '—'}<br/>Email: ${data.primary_contact_email || '—'}<br/>Phone: ${data.primary_contact_phone || '—'}`),
    formatSection('Team Contacts', safeJson(data.team_contacts || [])),
    formatSection('Services Subscribed', `${productBadges || serviceLabel}`),
    formatSection('AutoLeads Details', `Verticals: ${((data.autoleads_verticals || []).join(', ') || '—')}<br/>Campaign goals:<br/>${data.autoleads_campaign_goals || '—'}`),
    formatSection('Frank Workflow Preferences', safeJson(data.frank_workflows || {})),
    formatSection('Email Accounts', safeJson(data.email_accounts || [])),
    formatSection('Google Workspace', `Verified: ${data.google_workspace_verified ? 'Yes' : 'No'}<br/>Domain: ${data.google_workspace_domain || '—'}<br/>Email: ${data.google_workspace_email || '—'}`),
    formatSection('Social Links', safeJson(data.social_links || {})),
    formatSection('Landing Pages', safeJson(data.landing_page_urls || [])),
    formatSection('Other Service Details', data.other_service_details || '—'),
    formatSection('Campaign Timeline', `Kickoff: ${data.kickoff_date || '—'}<br/>Launch: ${data.launch_date || '—'}`),
    formatSection('Additional Notes', data.notes || '—'),
    formatSection('AI Assistant Setup', `Legal name: ${data.legal_name || '—'}<br/>Business address: ${data.business_address || '—'}<br/>Primary Google account: ${data.primary_google_account || '—'}<br/>Time zone: ${data.client_timezone || '—'}<br/>Assistant name: ${data.assistant_name || '—'}<br/>Setup session availability: ${data.onboarding_windows || '—'}`),
    formatSection('Submission Details', `Client ID: ${sanitizeText(data.client_id) || '—'}<br/>Submitted at: ${sanitizeText(data.submitted_at) || '—'}<br/>IP address: ${sanitizeText(data.ip_address) || '—'}<br/>User agent: <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">${sanitizeText(data.user_agent) || '—'}</span>`),
    `<tr><td>${actionLinksHtml([{ label: 'Set pricing & send agreement', url: adminQueueUrl() }])}</td></tr>`,
  ].join('');

  return {
    subject: `New Op Edge AI intake submission from ${data.company_name || data.primary_contact_name || 'client'}`,
    html: `<html><body style="font-family: Inter, sans-serif; background:#020617; color:#e2e8f0; padding:24px;"><div style="max-width:700px; margin:0 auto; background:#0f172a; border:1px solid rgba(148,163,184,.16); border-radius:20px; padding:28px;"><h1 style="margin:0 0 20px; font-size:24px; color:#bfdbfe;">New intake submission received</h1><table width="100%" cellpadding="0" cellspacing="0">${rows}</table></div></body></html>`,
  };
}
