import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseClient';
import { getDocument, isDocumentComplete, documentSignerEmails } from '@/lib/signnow';
import { handleSigned } from '@/lib/pipeline';
import { isValidAdminToken } from '@/lib/adminAuth';
import { logError } from '@/lib/logger';

// Security model, layered:
// 1. If SIGNNOW_WEBHOOK_SECRET is set and SignNow includes an HMAC signature
//    header, the raw body must verify against it.
// 2. Regardless of (1), the webhook payload is treated only as a HINT: we
//    re-fetch the document from SignNow with OUR api token and only act when
//    that authoritative copy is genuinely complete and matches a submission
//    (by stored document id, falling back to the signing client's email).
// A forged POST therefore cannot flip statuses or trigger email.
function verifySignature(rawBody: string, request: NextRequest): boolean {
  const secret = process.env.SIGNNOW_WEBHOOK_SECRET;
  if (!secret) return true; // no secret configured — rely on API-side verification
  const header =
    request.headers.get('x-signnow-signature') ||
    request.headers.get('x-signnow-sig') ||
    request.headers.get('signature');
  if (!header) return true; // header absent — still verified against the API below
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = crypto.createHash('sha256').update(header.trim()).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  const hexExpected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const c = crypto.createHash('sha256').update(hexExpected).digest();
  return crypto.timingSafeEqual(a, b) || crypto.timingSafeEqual(a, c);
}

function extractDocumentId(payload: any): string | null {
  return (
    payload?.content?.document_id ||
    payload?.content?.documentId ||
    payload?.document_id ||
    payload?.meta?.document_id ||
    null
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let payload: any = {};
  try { payload = rawBody ? JSON.parse(rawBody) : {}; } catch { payload = {}; }

  // Admin-gated simulation path for QA: skips SignNow verification but runs
  // the REAL signed-stage transitions (payment link + payment email).
  const url = request.nextUrl;
  if (url.searchParams.get('simulate') === '1') {
    if (!isValidAdminToken(url.searchParams.get('token'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const clientEmail = String(payload.client_email || '').toLowerCase();
    if (!clientEmail) return NextResponse.json({ error: 'client_email required' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: submission } = await supabase
      .from('intake_submissions')
      .select('id, status')
      .ilike('primary_contact_email', clientEmail)
      .in('status', ['agreement_sent', 'signed', 'payment_pending', 'paid', 'onboarding_sent'])
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!submission) return NextResponse.json({ error: 'No matching submission.' }, { status: 404 });
    try {
      const result = await handleSigned(submission.id);
      return NextResponse.json({ simulated: true, result });
    } catch (err) {
      return NextResponse.json({ simulated: true, error: (err as Error).message }, { status: 500 });
    }
  }

  try {
    if (!verifySignature(rawBody, request)) {
      logError('SignNow webhook signature verification failed', {});
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const documentId = extractDocumentId(payload);
    if (!documentId) {
      return NextResponse.json({ ok: true, ignored: 'no document id in payload' });
    }

    // Authoritative verification: fetch the document with our own token.
    let doc: any;
    try {
      doc = await getDocument(documentId);
    } catch (err) {
      logError('SignNow webhook: document fetch failed', { documentId, error: (err as Error).message });
      return NextResponse.json({ ok: true, ignored: 'document not found in our account' });
    }

    if (!isDocumentComplete(doc)) {
      return NextResponse.json({ ok: true, ignored: 'document not complete' });
    }

    const supabase = getSupabaseAdmin();

    // Prefer exact match on the stored document id, fall back to signer email.
    let { data: submission } = await supabase
      .from('intake_submissions')
      .select('id, status, primary_contact_email')
      .eq('signnow_document_id', documentId)
      .maybeSingle();

    if (!submission) {
      const signerEmails = documentSignerEmails(doc);
      if (signerEmails.length > 0) {
        const { data: byEmail } = await supabase
          .from('intake_submissions')
          .select('id, status, primary_contact_email')
          .in('status', ['agreement_sent', 'signed'])
          .order('submitted_at', { ascending: false });
        submission = (byEmail || []).find((s) => signerEmails.includes((s.primary_contact_email || '').toLowerCase())) ?? null;
      }
    }

    if (!submission) {
      return NextResponse.json({ ok: true, ignored: 'no matching submission' });
    }
    if (!['agreement_sent', 'signed'].includes(submission.status)) {
      return NextResponse.json({ ok: true, ignored: `status is ${submission.status}` });
    }

    const result = await handleSigned(submission.id);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    logError('SignNow webhook processing failed', { error: (err as Error).message });
    // Non-2xx so SignNow retries the delivery later.
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
