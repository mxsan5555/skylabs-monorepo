import { ApiRequestError } from '../api/rbac/client';

/** Extracts a flat `{field: message}` map from a 422's Zod-flattened `details.fieldErrors` (see
 *  msd-api's `middleware/validate.ts` — every Zod-validated route returns this same shape), one
 *  message per field. Generic over a field-key union so each dialog gets its own typed map
 *  without duplicating this body — mirrors the identical helper already established in
 *  `cms/field-errors.ts` and `vendor-profile-form.tsx#extractVendorFieldErrors`. Returns `null`
 *  for anything else (network error, a non-validation ApiError, etc.) so the caller falls back
 *  to its own generic message. */
export function extractFieldErrors<T extends string>(err: unknown): Partial<Record<T, string>> | null {
  if (!(err instanceof ApiRequestError) || err.code !== 'VALIDATION_ERROR') return null;
  const details = err.details as { fieldErrors?: Record<string, string[]> } | undefined;
  if (!details?.fieldErrors) return null;
  const flat: Partial<Record<T, string>> = {};
  for (const [key, messages] of Object.entries(details.fieldErrors)) {
    if (messages?.[0]) flat[key as T] = messages[0];
  }
  return Object.keys(flat).length > 0 ? flat : null;
}
