const INDIA_COUNTRY_CODE = '+91';

/**
 * Normalizes an OTP `identifier` so the same real phone number always resolves to the same
 * `OtpChallenge`/`User` row, regardless of whether the caller sent a bare 10-digit Indian
 * number or the full `+91`-prefixed form — without this, "9876543210" and "+919876543210"
 * are two different strings to every downstream `where: { identifier }` / `where: { phone }`
 * lookup, so the same seeded Vendor/Customer (stored as `+91XXXXXXXXXX`) silently fails to
 * match and a brand-new customer-role account gets created instead.
 *
 * Applied once at the authentication boundary (`auth.routes.ts`'s `/otp/request` and
 * `/otp/verify` handlers, which also covers "resend" since it reuses `/otp/request`) so
 * `otp.service.ts`/`auth.service.ts` never need to know this happened — they still just see
 * one plain `identifier` string, same as before.
 *
 * Email identifiers pass through untouched. Only the two phone shapes this application has
 * ever actually sent or stored are handled (bare 10-digit, and already-`+91`-prefixed) — no
 * invented format support (leading trunk `0`, other country codes, etc.) since nothing in
 * this codebase produces or expects those today; an unrecognized shape is left as-is rather
 * than guessed at.
 */
export function normalizeIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) return trimmed; // email — same "no @ means phone" signal as isPhoneIdentifier()/identifierKind()

  const stripped = trimmed.replace(/[^\d+]/g, '');

  if (/^\d{10}$/.test(stripped)) {
    return `${INDIA_COUNTRY_CODE}${stripped}`;
  }
  if (/^\+91\d{10}$/.test(stripped)) {
    return stripped;
  }
  return trimmed;
}
