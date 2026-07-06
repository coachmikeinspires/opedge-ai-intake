import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from './supabaseClient';
import { isUuid, sanitizePayload, IntakeFormPayload } from './validation';

export function getRequestIp(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return null;
}

export async function validateClientLink(clientId: string) {
  if (!isUuid(clientId)) return false;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('intake_links')
    .select('client_id, is_active')
    .eq('client_id', clientId)
    .single();

  if (error || !data) return false;
  return data.is_active === true;
}

export async function querySubmissionByClientId(clientId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('intake_submissions')
    .select('*')
    .eq('client_id', clientId)
    .single();

  if (error) return null;
  return data;
}

export function normalizeFormPayload(payload: IntakeFormPayload) {
  return sanitizePayload(payload);
}
