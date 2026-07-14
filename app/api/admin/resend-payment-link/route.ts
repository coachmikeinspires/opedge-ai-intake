import { NextRequest, NextResponse } from 'next/server';
import { isValidAdminToken } from '@/lib/adminAuth';
import { resendPaymentLink } from '@/lib/pipeline';
import { logError } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const token = String(form.get('token') ?? '');

  if (!isValidAdminToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL('/admin', request.nextUrl.origin);
  url.searchParams.set('token', token);

  try {
    const submissionId = String(form.get('submission_id') ?? '');
    if (!/^\d+$/.test(submissionId)) throw new Error('Missing submission_id.');
    await resendPaymentLink(submissionId);
    url.searchParams.set('sent', '1');
  } catch (err) {
    logError('Resend payment link failed', { error: (err as Error).message });
    url.searchParams.set('error', encodeURIComponent((err as Error).message));
  }
  return NextResponse.redirect(url, 303);
}
