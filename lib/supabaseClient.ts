import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase environment variables are required.');
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { 'x-application-name': 'opedge-intake' } },
  });
}
