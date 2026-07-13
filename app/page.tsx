import IntakeForm from '@/components/IntakeForm';
import { validateClientLink } from '@/lib/intakeHelpers';

interface PageProps {
  searchParams: { client_id?: string };
}

export default async function Page({ searchParams }: PageProps) {
  const clientId = searchParams.client_id?.trim() ?? '';
  const isValidLink = clientId ? await validateClientLink(clientId) : false;

  if (!clientId) {
    return (
      <main className="container">
        <div className="header">
          <p className="badge">Invalid intake link</p>
          <h1 className="title">Missing client link</h1>
          <p className="subtitle">Please use the private intake link sent to you.</p>
        </div>
        <div className="card" style={{ padding: '32px' }}>
          <p className="summary">A valid <strong>client_id</strong> is required in the URL query string.</p>
        </div>
      </main>
    );
  }

  if (!isValidLink) {
    return (
      <main className="container">
        <div className="header">
          <p className="badge">Invalid intake link</p>
          <h1 className="title">This submission link is not valid</h1>
          <p className="subtitle">The link may be expired, already submitted, or not authorized.</p>
        </div>
        <div className="card" style={{ padding: '32px' }}>
          <p className="summary">Contact your Op Edge AI representative for a new intake link.</p>
        </div>
      </main>
    );
  }

  return <IntakeForm clientId={clientId} />;
}
