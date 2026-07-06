'use client';

import { useEffect, useMemo, useState } from 'react';
import { getFormValidationErrors, IntakeFormPayload } from '@/lib/validation';

type Props = {
  clientId: string;
};

const defaultForm: IntakeFormPayload = {
  client_id: '',
  company_name: '',
  primary_contact_name: '',
  primary_contact_email: '',
  primary_contact_phone: '',
  team_contacts: [{ name: '', email: '', role: '' }],
  products_subscribed: [],
  autoleads_verticals: [],
  autoleads_campaign_goals: '',
  frank_workflows: '',
  dakota_preferences: '',
  email_accounts: [{ provider: '', email: '', imap_server: '', imap_port: '', smtp_server: '', smtp_port: '' }],
  google_workspace_verified: false,
  google_workspace_domain: '',
  google_workspace_email: '',
  social_links: { linkedin: '', twitter: '', facebook: '', instagram: '', tiktok: '' },
  landing_page_urls: [''],
  kickoff_date: '',
  launch_date: '',
  notes: '',
};

const products = ['AutoLeads', 'Frank', 'Dakota'];
const verticals = ['B2B SaaS', 'E-commerce', 'Healthcare', 'Real Estate', 'Fintech', 'Professional Services', 'Other'];

function sanitizeBoolean(value: boolean) {
  return Boolean(value);
}

export default function IntakeForm({ clientId }: Props) {
  const [form, setForm] = useState<IntakeFormPayload>({ ...defaultForm, client_id: clientId });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    setForm((prev) => ({ ...prev, client_id: clientId }));
  }, [clientId]);

  const selectedProducts = useMemo(() => new Set(form.products_subscribed), [form.products_subscribed]);

  const updateField = (field: keyof IntakeFormPayload, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleProduct = (product: string) => {
    setForm((prev) => {
      const subscribed = new Set(prev.products_subscribed);
      subscribed.has(product) ? subscribed.delete(product) : subscribed.add(product);
      return { ...prev, products_subscribed: Array.from(subscribed) };
    });
  };

  const updateTeamMember = (index: number, field: keyof IntakeFormPayload['team_contacts'][number], value: string) => {
    const next = [...form.team_contacts];
    next[index] = { ...next[index], [field]: value };
    updateField('team_contacts', next);
  };

  const updateEmailAccount = (index: number, field: keyof IntakeFormPayload['email_accounts'][number], value: string) => {
    const next = [...form.email_accounts];
    next[index] = { ...next[index], [field]: value };
    updateField('email_accounts', next);
  };

  const updateSocialLink = (field: keyof IntakeFormPayload['social_links'], value: string) => {
    updateField('social_links', { ...form.social_links, [field]: value });
  };

  const updateLandingPage = (index: number, value: string) => {
    const next = [...form.landing_page_urls];
    next[index] = value;
    updateField('landing_page_urls', next);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('submitting');
    setMessage('');
    setErrors([]);

    const validationErrors = getFormValidationErrors(form);
    if (validationErrors.length > 0) {
      setStatus('error');
      setErrors(validationErrors);
      return;
    }

    try {
      const response = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatus('error');
        setErrors([result?.error || 'Submission failed.']);
        return;
      }
      setStatus('success');
      window.location.href = '/success';
    } catch (error) {
      setStatus('error');
      setErrors([(error as Error).message || 'Unexpected error submitting the form.']);
    }
  };

  return (
    <main className="container">
      <div className="header">
        <p className="badge">Private client intake</p>
        <h1 className="title">Opendge Client Intake</h1>
        <p className="subtitle">Complete the form below to help our team scope your onboarding and campaign setup.</p>
      </div>

      <div className="card">
        <form className="form-grid" onSubmit={submit}>
          <section className="section">
            <div className="section-header">
              <div>
                <h2 className="section-title">Company & Contact Info</h2>
                <p className="section-description">Tell us about the company and main point of contact.</p>
              </div>
            </div>
            <div className="input-row two-grid">
              <label>
                Company name
                <input value={form.company_name} onChange={(e) => updateField('company_name', e.target.value)} required />
              </label>
              <label>
                Primary contact name
                <input value={form.primary_contact_name} onChange={(e) => updateField('primary_contact_name', e.target.value)} required />
              </label>
              <label>
                Contact email
                <input type="email" value={form.primary_contact_email} onChange={(e) => updateField('primary_contact_email', e.target.value)} required />
              </label>
              <label>
                Contact phone
                <input value={form.primary_contact_phone} onChange={(e) => updateField('primary_contact_phone', e.target.value)} />
              </label>
            </div>
          </section>

          <section className="section">
            <div className="section-header">
              <div>
                <h2 className="section-title">Team Contacts</h2>
                <p className="section-description">Add additional team members we should include in planning.</p>
              </div>
            </div>
            <div className="field-list">
              {form.team_contacts.map((member, index) => (
                <div className="card" key={`team-${index}`} style={{ padding: '18px', background: 'rgba(15,23,42,.95)' }}>
                  <div className="two-grid">
                    <label>
                      Name
                      <input value={member.name} onChange={(e) => updateTeamMember(index, 'name', e.target.value)} />
                    </label>
                    <label>
                      Email
                      <input type="email" value={member.email} onChange={(e) => updateTeamMember(index, 'email', e.target.value)} />
                    </label>
                    <label>
                      Role
                      <input value={member.role} onChange={(e) => updateTeamMember(index, 'role', e.target.value)} />
                    </label>
                  </div>
                  <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <button type="button" className="secondary-button" onClick={() => updateField('team_contacts', form.team_contacts.filter((_, i) => i !== index))}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="secondary-button" onClick={() => updateField('team_contacts', [...form.team_contacts, { name: '', email: '', role: '' }])}>Add team member</button>
          </section>

          <section className="section">
            <div className="section-header">
              <div>
                <h2 className="section-title">Products Subscribed</h2>
                <p className="section-description">Select the products your company is signing up for.</p>
              </div>
            </div>
            <div className="input-row">
              {products.map((product) => (
                <label key={product} style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                  <input type="checkbox" checked={selectedProducts.has(product)} onChange={() => toggleProduct(product)} />
                  {product}
                </label>
              ))}
            </div>
          </section>

          {selectedProducts.has('AutoLeads') && (
            <section className="section">
              <div className="section-header">
                <div>
                  <h2 className="section-title">AutoLeads</h2>
                  <p className="section-description">Tell us the verticals and campaign goals for AutoLeads.</p>
                </div>
              </div>
              <div className="input-row">
                <label>
                  Target verticals
                  <select multiple value={form.autoleads_verticals} onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions).map((option) => option.value);
                    updateField('autoleads_verticals', values);
                  }} style={{ minHeight: 160 }}>
                    {verticals.map((vertical) => <option key={vertical} value={vertical}>{vertical}</option>)}
                  </select>
                </label>
                <label>
                  Campaign goals
                  <textarea value={form.autoleads_campaign_goals} onChange={(e) => updateField('autoleads_campaign_goals', e.target.value)} />
                </label>
              </div>
            </section>
          )}

          {selectedProducts.has('Frank') && (
            <section className="section">
              <div className="section-header">
                <div>
                  <h2 className="section-title">Frank</h2>
                  <p className="section-description">Share workflow preferences for Frank.</p>
                </div>
              </div>
              <label>
                Workflow preferences
                <textarea value={form.frank_workflows} onChange={(e) => updateField('frank_workflows', e.target.value)} />
              </label>
            </section>
          )}

          {selectedProducts.has('Dakota') && (
            <section className="section">
              <div className="section-header">
                <div>
                  <h2 className="section-title">Dakota</h2>
                  <p className="section-description">Describe Dakota bot tone, response style, and escalation rules.</p>
                </div>
              </div>
              <label>
                Dakota preferences
                <textarea value={form.dakota_preferences} onChange={(e) => updateField('dakota_preferences', e.target.value)} />
              </label>
            </section>
          )}

          <section className="section">
            <div className="section-header">
              <div>
                <h2 className="section-title">Email Accounts</h2>
                <p className="section-description">Configure the outreach email accounts and mail server details.</p>
              </div>
            </div>
            <div className="field-list">
              {form.email_accounts.map((account, index) => (
                <div className="card" key={`email-${index}`} style={{ padding: '18px', background: 'rgba(15,23,42,.95)' }}>
                  <div className="two-grid">
                    <label>
                      Provider
                      <input value={account.provider} onChange={(e) => updateEmailAccount(index, 'provider', e.target.value)} />
                    </label>
                    <label>
                      Email
                      <input type="email" value={account.email} onChange={(e) => updateEmailAccount(index, 'email', e.target.value)} />
                    </label>
                    <label>
                      IMAP server
                      <input value={account.imap_server} onChange={(e) => updateEmailAccount(index, 'imap_server', e.target.value)} />
                    </label>
                    <label>
                      IMAP port
                      <input value={account.imap_port} onChange={(e) => updateEmailAccount(index, 'imap_port', e.target.value)} />
                    </label>
                    <label>
                      SMTP server
                      <input value={account.smtp_server} onChange={(e) => updateEmailAccount(index, 'smtp_server', e.target.value)} />
                    </label>
                    <label>
                      SMTP port
                      <input value={account.smtp_port} onChange={(e) => updateEmailAccount(index, 'smtp_port', e.target.value)} />
                    </label>
                  </div>
                  <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" className="secondary-button" onClick={() => updateField('email_accounts', form.email_accounts.filter((_, i) => i !== index))}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="secondary-button" onClick={() => updateField('email_accounts', [...form.email_accounts, { provider: '', email: '', imap_server: '', imap_port: '', smtp_server: '', smtp_port: '' }])}>Add email account</button>
          </section>

          <section className="section">
            <div className="section-header">
              <div>
                <h2 className="section-title">Google Workspace</h2>
                <p className="section-description">Provide verified Google Workspace details if available.</p>
              </div>
            </div>
            <div className="two-grid">
              <label>
                Verified workspace?
                <select value={form.google_workspace_verified ? 'yes' : 'no'} onChange={(e) => updateField('google_workspace_verified', sanitizeBoolean(e.target.value === 'yes'))}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
              <label>
                Workspace domain
                <input value={form.google_workspace_domain} onChange={(e) => updateField('google_workspace_domain', e.target.value)} />
              </label>
              {form.google_workspace_verified && (
                <label>
                  Verified admin email
                  <input type="email" value={form.google_workspace_email} onChange={(e) => updateField('google_workspace_email', e.target.value)} />
                </label>
              )}
            </div>
          </section>

          <section className="section">
            <div className="section-header">
              <div>
                <h2 className="section-title">Social & Web</h2>
                <p className="section-description">Share social profiles and landing pages used for campaigns.</p>
              </div>
            </div>
            <div className="input-row two-grid">
              <label>
                LinkedIn URL
                <input value={form.social_links.linkedin} onChange={(e) => updateSocialLink('linkedin', e.target.value)} />
              </label>
              <label>
                Twitter URL
                <input value={form.social_links.twitter} onChange={(e) => updateSocialLink('twitter', e.target.value)} />
              </label>
              <label>
                Facebook URL
                <input value={form.social_links.facebook} onChange={(e) => updateSocialLink('facebook', e.target.value)} />
              </label>
              <label>
                Instagram URL
                <input value={form.social_links.instagram} onChange={(e) => updateSocialLink('instagram', e.target.value)} />
              </label>
              <label>
                TikTok URL
                <input value={form.social_links.tiktok} onChange={(e) => updateSocialLink('tiktok', e.target.value)} />
              </label>
            </div>
            <div className="field-list">
              {form.landing_page_urls.map((url, index) => (
                <label key={`landing-${index}`}>
                  Landing page URL {index + 1}
                  <div style={{ display: 'flex', gap: 12 }}>
                    <input style={{ flex: 1 }} value={url} onChange={(e) => updateLandingPage(index, e.target.value)} />
                    <button type="button" className="secondary-button" onClick={() => updateField('landing_page_urls', form.landing_page_urls.filter((_, i) => i !== index))}>Remove</button>
                  </div>
                </label>
              ))}
            </div>
            <button type="button" className="secondary-button" onClick={() => updateField('landing_page_urls', [...form.landing_page_urls, ''])}>Add landing page</button>
          </section>

          <section className="section">
            <div className="section-header">
              <div>
                <h2 className="section-title">Campaign Timeline</h2>
                <p className="section-description">Provide your kickoff and launch dates.</p>
              </div>
            </div>
            <div className="two-grid">
              <label>
                Kickoff date
                <input type="date" value={form.kickoff_date} onChange={(e) => updateField('kickoff_date', e.target.value)} />
              </label>
              <label>
                Launch date
                <input type="date" value={form.launch_date} onChange={(e) => updateField('launch_date', e.target.value)} />
              </label>
            </div>
          </section>

          <section className="section">
            <div className="section-header">
              <div>
                <h2 className="section-title">Additional Notes</h2>
                <p className="section-description">Add any extra context for the team.</p>
              </div>
            </div>
            <label>
              Notes
              <textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} />
            </label>
          </section>

          {status === 'error' && (
            <div className="alert">
              {errors.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {errors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              ) : (
                <p>{message}</p>
              )}
            </div>
          )}
          {status === 'success' && <div className="success">Your intake has been submitted successfully.</div>}

          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '24px' }}>
            <button type="submit" disabled={status === 'submitting'}>{status === 'submitting' ? 'Submitting…' : 'Submit intake form'}</button>
            <div className="summary">
              <p><strong>Client ID:</strong> {form.client_id || 'Missing from URL'}</p>
              <p>Only the provided link can be used to submit this form.</p>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
