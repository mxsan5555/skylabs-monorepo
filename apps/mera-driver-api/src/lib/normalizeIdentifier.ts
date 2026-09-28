const INDIA_COUNTRY_CODE = '+91';

/**
 * Normalizes an auth identifier so the same real phone number resolves to one canonical value.
 * Bare 10-digit Indian numbers are converted to +91XXXXXXXXXX, and emails are lowercased while
 * preserving their full value. This prevents a user created as +919876543210 from being missed
 * when the client submits 9876543210 or a case-mixed email.
 */
export function normalizeIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  if (!trimmed) return trimmed;

  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }

  const stripped = trimmed.replace(/[^\d+]/g, '');

  if (/^\d{10}$/.test(stripped)) {
    return `${INDIA_COUNTRY_CODE}${stripped}`;
  }

  if (/^\+91\d{10}$/.test(stripped)) {
    return stripped;
  }

  return trimmed;
}
