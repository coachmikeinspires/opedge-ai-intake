import crypto from 'crypto';

// Constant-time check of the ?token= value against ADMIN_TOKEN. Hashing both
// sides first keeps timingSafeEqual happy about unequal input lengths.
export function isValidAdminToken(token: string | null | undefined): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || !token) return false;
  const a = crypto.createHash('sha256').update(String(token)).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
