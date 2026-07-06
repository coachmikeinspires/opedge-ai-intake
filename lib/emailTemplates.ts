export function clientConfirmationEmail(name: string) {
  return {
    subject: 'Thanks for submitting your Opendge intake form',
    html: `<html><body style="font-family: Inter, sans-serif; background:#020617; color:#e2e8f0; padding:24px;"><div style="max-width:600px; margin:0 auto; background:#0f172a; border:1px solid rgba(148,163,184,.16); border-radius:20px; padding:28px;"><h1 style="margin:0 0 16px;font-size:24px;color:#bfdbfe;">Thanks for submitting, ${name}</h1><p style="margin:0 0 16px; color:#cbd5e1;">We received your intake submission and our team will review it shortly.</p><p style="margin:0 0 16px; color:#cbd5e1;">Next steps: validation, clarification, and campaign kickoff planning. If we need anything else, we’ll reach out to the address you provided.</p><p style="margin:0; color:#cbd5e1;">Warm regards,<br/>The Opendge team</p></div></body></html>`,
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

  const rows = [
    formatSection('Company & Contact Info', `Company: ${data.company_name || '—'}<br/>Primary contact: ${data.primary_contact_name || '—'}<br/>Email: ${data.primary_contact_email || '—'}<br/>Phone: ${data.primary_contact_phone || '—'}`),
    formatSection('Team Contacts', safeJson(data.team_contacts || [])),
    formatSection('Products Subscribed', `${productBadges || 'None'}`),
    formatSection('AutoLeads Details', `Verticals: ${((data.autoleads_verticals || []).join(', ') || '—')}<br/>Campaign goals:<br/>${data.autoleads_campaign_goals || '—'}`),
    formatSection('Frank Workflow Preferences', safeJson(data.frank_workflows || {})),
    formatSection('Dakota Preferences', safeJson(data.dakota_preferences || {})),
    formatSection('Email Accounts', safeJson(data.email_accounts || [])),
    formatSection('Google Workspace', `Verified: ${data.google_workspace_verified ? 'Yes' : 'No'}<br/>Domain: ${data.google_workspace_domain || '—'}<br/>Email: ${data.google_workspace_email || '—'}`),
    formatSection('Social Links', safeJson(data.social_links || {})),
    formatSection('Landing Pages', safeJson(data.landing_page_urls || [])),
    formatSection('Campaign Timeline', `Kickoff: ${data.kickoff_date || '—'}<br/>Launch: ${data.launch_date || '—'}`),
    formatSection('Additional Notes', data.notes || '—'),
    formatSection('Submission Details', `Client ID: ${data.client_id || '—'}<br/>Submitted at: ${data.submitted_at || '—'}<br/>IP address: ${data.ip_address || '—'}<br/>User agent: <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">${data.user_agent || '—'}</span>`),
  ].join('');

  return {
    subject: `New Opendge intake submission from ${data.company_name || data.primary_contact_name || 'client'}`,
    html: `<html><body style="font-family: Inter, sans-serif; background:#020617; color:#e2e8f0; padding:24px;"><div style="max-width:700px; margin:0 auto; background:#0f172a; border:1px solid rgba(148,163,184,.16); border-radius:20px; padding:28px;"><h1 style="margin:0 0 20px; font-size:24px; color:#bfdbfe;">New intake submission received</h1><table width="100%" cellpadding="0" cellspacing="0">${rows}</table></div></body></html>`,
  };
}
