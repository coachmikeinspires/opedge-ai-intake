import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { isValidAdminToken } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { token?: string; sent?: string; error?: string };
}

const STATUS_LABELS: Record<string, string> = {
  intake_received: 'Intake received',
  agreement_sent: 'Agreement sent',
  signed: 'Signed',
  onboarding_sent: 'Onboarding sent',
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export default async function AdminPage({ searchParams }: PageProps) {
  const token = searchParams.token ?? '';

  if (!isValidAdminToken(token)) {
    return (
      <main className="container">
        <div className="header">
          <p className="badge">Restricted</p>
          <h1 className="title">Admin access required</h1>
          <p className="subtitle">A valid admin token is required in the URL query string.</p>
        </div>
      </main>
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: submissions, error } = await supabase
    .from('intake_submissions')
    .select('id, client_id, primary_contact_name, primary_contact_email, company_name, legal_name, client_timezone, assistant_name, status, submitted_at')
    .order('submitted_at', { ascending: false });

  return (
    <main className="container" style={{ maxWidth: 1080 }}>
      <div className="header">
        <p className="badge">Op Edge AI · internal</p>
        <h1 className="title">Intake queue</h1>
        <p className="subtitle">Set pricing and send the service agreement. Nothing sends without the button below.</p>
      </div>

      {searchParams.sent && <div className="success" style={{ marginBottom: 16 }}>Agreement generated and sent for signing.</div>}
      {searchParams.error && <div className="alert" style={{ marginBottom: 16 }}>{decodeURIComponent(searchParams.error)}</div>}
      {error && <div className="alert" style={{ marginBottom: 16 }}>Could not load submissions: {error.message}</div>}

      <div className="card" style={{ padding: 20, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 720 }}>
          <thead>
            <tr>
              {['Name', 'Business', 'Email', 'Timezone', 'Assistant', 'Status', 'Submitted', 'Pricing / send'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid rgba(148,163,184,.16)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(submissions || []).map((s) => (
              <tr key={s.id}>
                <td style={{ padding: 10, borderBottom: '1px solid rgba(148,163,184,.08)' }}>{s.primary_contact_name || '—'}</td>
                <td style={{ padding: 10, borderBottom: '1px solid rgba(148,163,184,.08)' }}>{s.company_name || s.legal_name || '—'}</td>
                <td style={{ padding: 10, borderBottom: '1px solid rgba(148,163,184,.08)', wordBreak: 'break-all' }}>{s.primary_contact_email || '—'}</td>
                <td style={{ padding: 10, borderBottom: '1px solid rgba(148,163,184,.08)' }}>{s.client_timezone || '—'}</td>
                <td style={{ padding: 10, borderBottom: '1px solid rgba(148,163,184,.08)' }}>{s.assistant_name || '—'}</td>
                <td style={{ padding: 10, borderBottom: '1px solid rgba(148,163,184,.08)' }}>{STATUS_LABELS[s.status] || s.status}</td>
                <td style={{ padding: 10, borderBottom: '1px solid rgba(148,163,184,.08)', whiteSpace: 'nowrap' }}>{formatDate(s.submitted_at)}</td>
                <td style={{ padding: 10, borderBottom: '1px solid rgba(148,163,184,.08)', minWidth: 260 }}>
                  {s.status === 'intake_received' ? (
                    <form method="post" action="/api/admin/agreement" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="submission_id" value={s.id} />
                      <input name="setup_fee" type="number" min="0" step="any" required placeholder="Setup fee *" style={{ width: 110 }} />
                      <input name="monthly_fee" type="number" min="0" step="any" required placeholder="Monthly fee *" style={{ width: 110 }} />
                      <input name="handover_fee" type="number" min="0" step="any" placeholder="Handover fee" style={{ width: 110 }} />
                      <input name="usage_ceiling_text" type="text" placeholder="Usage ceiling (text)" style={{ width: 170 }} />
                      <button type="submit">Generate &amp; Send Agreement</button>
                    </form>
                  ) : (
                    <span style={{ color: '#64748b' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
            {(submissions || []).length === 0 && (
              <tr><td colSpan={8} style={{ padding: 16, color: '#64748b' }}>No submissions yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
