import '../globals.css';

export default function SuccessPage() {
  return (
    <main className="container">
      <div className="header">
        <p className="badge">Submission complete</p>
        <h1 className="title">Thanks for your intake submission</h1>
        <p className="subtitle">We received your details and our team is reviewing the request now.</p>
      </div>
      <div className="card" style={{ padding: '32px' }}>
        <div className="success">
          <h2 style={{ marginTop: 0, color: '#d1fae5' }}>What happens next</h2>
          <p>Our team will validate your submission, follow up with any clarification questions, and prepare the campaign kickoff plan.</p>
          <p>If you submitted with an email address, check your inbox for confirmation from <strong>noreply@opedge.ai</strong>.</p>
          <p>Need to update anything? Reply to the notification email or contact your Op Edge AI representative.</p>
        </div>
      </div>
    </main>
  );
}
