import crypto from 'crypto';

/** Generates a 6-digit numeric OTP as a string, e.g. "042917". */
export function generateOtp(): string {
  return crypto.randomInt(100_000, 1_000_000).toString();
}

/** Generates a high-entropy opaque token (refresh tokens, preview-token jti). */
export function generateOpaqueToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Deterministic hash for exact-match DB lookups of high-entropy opaque tokens (refresh
 * tokens). Unlike bcrypt (used for the low-entropy OTP, where slow+salted hashing matters
 * for brute-force resistance), a 256-bit random token only needs a fast, deterministic
 * digest so the DB can look it up by `hashedToken` equality.
 */
export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
