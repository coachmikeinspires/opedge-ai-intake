// SignNow OAuth token management. Access tokens on this account are
// short-lived, so the service refreshes them programmatically:
//   - SIGNNOW_BASIC_TOKEN  (the app's Basic auth value) +
//     SIGNNOW_REFRESH_TOKEN (from the one-time password grant)
//     → refresh flow with an in-memory access-token cache (primary)
//   - SIGNNOW_API_TOKEN → static token, legacy fallback only
// Callers force a refresh + single retry when SignNow rejects a token.

export const SIGNNOW_BASE = process.env.SIGNNOW_API_BASE || 'https://api.signnow.com';

let cached: { token: string; expiresAt: number } | null = null;
// SignNow may rotate refresh tokens; prefer the latest one we were issued.
let currentRefreshToken: string | null = null;
// Dedupe concurrent refreshes so parallel requests share one token call.
let inFlightRefresh: Promise<string> | null = null;

export function isSignNowAuthFailure(status: number, body: any): boolean {
  if (status === 401) return true;
  if (status === 400 || status === 403) {
    return body?.error === 'invalid_token' || body?.code === 1537;
  }
  return false;
}

async function refreshAccessToken(basic: string, refreshToken: string): Promise<string> {
  const res = await fetch(`${SIGNNOW_BASE}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, scope: '*' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`SignNow token refresh failed: ${body.error_description || body.error || `HTTP ${res.status}`}`);
  }
  if (body.refresh_token) currentRefreshToken = body.refresh_token;
  const ttlSeconds = Number(body.expires_in) > 0 ? Number(body.expires_in) : 1800;
  cached = { token: body.access_token, expiresAt: Date.now() + ttlSeconds * 1000 };
  return cached.token;
}

export async function getSignNowAccessToken(forceRefresh = false): Promise<string> {
  const basic = process.env.SIGNNOW_BASIC_TOKEN;
  const refreshToken = currentRefreshToken || process.env.SIGNNOW_REFRESH_TOKEN;

  if (basic && refreshToken) {
    if (!forceRefresh && cached && Date.now() < cached.expiresAt - 60_000) {
      return cached.token;
    }
    if (!inFlightRefresh) {
      inFlightRefresh = refreshAccessToken(basic, refreshToken).finally(() => {
        inFlightRefresh = null;
      });
    }
    return inFlightRefresh;
  }

  const staticToken = process.env.SIGNNOW_API_TOKEN;
  if (staticToken) return staticToken;

  throw new Error('SignNow auth is not configured: set SIGNNOW_BASIC_TOKEN + SIGNNOW_REFRESH_TOKEN (preferred) or SIGNNOW_API_TOKEN.');
}
