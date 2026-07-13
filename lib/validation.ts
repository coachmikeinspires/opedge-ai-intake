export type TeamContact = { name: string; email: string; role: string };
export type EmailAccount = { provider: string; email: string; imap_server: string; imap_port: string; smtp_server: string; smtp_port: string };
export type SocialLinks = { linkedin: string; twitter: string; facebook: string; instagram: string; tiktok: string };

export interface IntakeFormPayload {
  client_id: string;
  company_name: string;
  primary_contact_name: string;
  primary_contact_email: string;
  primary_contact_phone: string;
  team_contacts: TeamContact[];
  service_subscribed: string;
  other_service_details: string;
  autoleads_verticals: string[];
  autoleads_campaign_goals: string;
  frank_workflows: string;
  dakota_preferences: string;
  email_accounts: EmailAccount[];
  google_workspace_verified: boolean;
  google_workspace_domain: string;
  google_workspace_email: string;
  social_links: SocialLinks;
  landing_page_urls: string[];
  kickoff_date: string;
  launch_date: string;
  notes: string;
  legal_name: string;
  business_address: string;
  primary_google_account: string;
  client_timezone: string;
  assistant_name: string;
  onboarding_windows: string;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return uuidRegex.test(value);
}

export function isValidEmail(value: string): boolean {
  return emailRegex.test(value.trim());
}

export function isValidUrl(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  try {
    const parsed = new URL(value.trim());
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function isFutureDate(value: string): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed > today;
}

export function isValidPort(value: string): boolean {
  if (!value) return false;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function isValidIp(value: string): boolean {
  if (!value) return false;
  const ipv4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  const ipv6 = /^[0-9a-fA-F:]{2,45}$/;
  return ipv4.test(value) || (value.includes(':') && ipv6.test(value));
}

export function sanitizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim();
}

export function sanitizePayload<T>(payload: T): T {
  if (payload === null || payload === undefined) return payload;
  if (typeof payload === 'string') {
    return sanitizeText(payload) as unknown as T;
  }

  if (Array.isArray(payload)) {
    return payload.map((value) => sanitizePayload(value)) as unknown as T;
  }

  if (typeof payload === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const key of Object.keys(payload).sort()) {
      sanitized[key] = sanitizePayload((payload as Record<string, unknown>)[key]);
    }
    return sanitized as T;
  }

  return payload;
}

export function getFormValidationErrors(payload: IntakeFormPayload): string[] {
  const errors: string[] = [];
  if (!payload.company_name.trim()) errors.push('Company name is required.');
  if (!payload.primary_contact_name.trim()) errors.push('Primary contact name is required.');
  if (!payload.primary_contact_email.trim()) {
    errors.push('Primary contact email is required.');
  } else if (!isValidEmail(payload.primary_contact_email)) {
    errors.push('Primary contact email must be a valid email address.');
  }

  if (payload.team_contacts.some((member) => member.email.trim() && !isValidEmail(member.email))) {
    errors.push('Team contact emails must be valid email addresses.');
  }

  const socialUrls = Object.values(payload.social_links).filter(Boolean);
  if (socialUrls.some((value) => !isValidUrl(value))) {
    errors.push('Social media links must be valid URLs.');
  }

  const landingUrls = payload.landing_page_urls.filter(Boolean);
  if (landingUrls.some((url) => !isValidUrl(url))) {
    errors.push('Landing page URLs must be valid URLs.');
  }

  if (payload.kickoff_date && !isFutureDate(payload.kickoff_date)) {
    errors.push('Kickoff date must be in the future.');
  }
  if (payload.launch_date && !isFutureDate(payload.launch_date)) {
    errors.push('Launch date must be in the future.');
  }
  if (payload.kickoff_date && payload.launch_date && new Date(payload.launch_date) < new Date(payload.kickoff_date)) {
    errors.push('Launch date should be the same or after kickoff date.');
  }

  for (const [index, account] of payload.email_accounts.entries()) {
    if (!account.provider && !account.email && !account.imap_server && !account.smtp_server && !account.imap_port && !account.smtp_port) continue;
    if (!account.provider.trim()) errors.push(`Email account #${index + 1} requires a provider.`);
    if (!account.email.trim()) {
      errors.push(`Email account #${index + 1} requires an email address.`);
    } else if (!isValidEmail(account.email)) {
      errors.push(`Email account #${index + 1} must have a valid email address.`);
    }
    if (account.imap_port && !isValidPort(account.imap_port)) {
      errors.push(`Email account #${index + 1} IMAP port must be between 1 and 65535.`);
    }
    if (account.smtp_port && !isValidPort(account.smtp_port)) {
      errors.push(`Email account #${index + 1} SMTP port must be between 1 and 65535.`);
    }
    if ((account.imap_server.trim() && !account.imap_port.trim()) || (!account.imap_server.trim() && account.imap_port.trim())) {
      errors.push(`Email account #${index + 1} must specify both IMAP server and port or neither.`);
    }
    if ((account.smtp_server.trim() && !account.smtp_port.trim()) || (!account.smtp_server.trim() && account.smtp_port.trim())) {
      errors.push(`Email account #${index + 1} must specify both SMTP server and port or neither.`);
    }
  }

  if (!payload.service_subscribed.trim()) {
    errors.push('Please select a service.');
  }

  if (payload.service_subscribed === 'AutoLeads') {
    if (payload.autoleads_verticals.length === 0) {
      errors.push('AutoLeads requires at least one target vertical.');
    }
    if (!payload.autoleads_campaign_goals.trim()) {
      errors.push('AutoLeads campaign goals are required.');
    }
  }

  if (payload.service_subscribed === 'Frank' && !payload.frank_workflows.trim()) {
    errors.push('Frank workflow preferences are required.');
  }

  if (payload.service_subscribed === 'Other' && !payload.other_service_details.trim()) {
    errors.push('Please describe the other service you need.');
  }

  if (!payload.legal_name.trim()) errors.push('Legal name is required.');
  if (!payload.business_address.trim()) errors.push('Business address is required.');
  if (!payload.primary_google_account.trim()) {
    errors.push('Primary Google account is required.');
  } else if (!isValidEmail(payload.primary_google_account)) {
    errors.push('Primary Google account must be a valid email address.');
  }
  if (!payload.client_timezone.trim()) errors.push('Please select your time zone.');

  if (!payload.client_id.trim() || !isUuid(payload.client_id)) {
    errors.push('Invalid intake link.');
  }

  return errors;
}
