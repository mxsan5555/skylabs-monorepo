import { ApiRequestError } from '../../../../api/rbac/client';

export type BlogPostFieldKey =
  | 'title'
  | 'slug'
  | 'excerpt'
  | 'categorySlug'
  | 'body'
  | 'author'
  | 'readMinutes'
  | 'tags'
  | 'metaTitle'
  | 'metaDescription';

/** Extracts a flat `{field: message}` map from a 422's Zod-flattened `details.fieldErrors` (see
 *  msd-api's `middleware/validate.ts`) — first message per field only, matching how these forms
 *  already surface one message per field. Mirrors `vendor-profile-form.tsx`'s
 *  `extractVendorFieldErrors`, generalized over a field-key union so the identical body isn't
 *  tripled across BlogPost/AboutUs/ContactUs, which each have a different field set but the same
 *  422 response shape. Returns `null` for anything else (network error, a non-validation
 *  ApiError, etc.) so the caller falls back to its own generic message. */
function extractFieldErrors<T extends string>(err: unknown): Partial<Record<T, string>> | null {
  if (!(err instanceof ApiRequestError) || err.code !== 'VALIDATION_ERROR') return null;
  const details = err.details as { fieldErrors?: Record<string, string[]> } | undefined;
  if (!details?.fieldErrors) return null;
  const flat: Partial<Record<T, string>> = {};
  for (const [key, messages] of Object.entries(details.fieldErrors)) {
    if (messages?.[0]) flat[key as T] = messages[0];
  }
  return Object.keys(flat).length > 0 ? flat : null;
}

export function extractBlogPostFieldErrors(err: unknown): Partial<Record<BlogPostFieldKey, string>> | null {
  return extractFieldErrors<BlogPostFieldKey>(err);
}

/** Generic over the field-key union — used for both About Us and Contact Us (each has a
 *  different field set, see `AboutUsInput`/`ContactUsInput` in `api/rbac/site-content.ts`),
 *  called as `extractSiteContentFieldErrors<keyof AboutUsInput>(err)` /
 *  `extractSiteContentFieldErrors<keyof ContactUsInput>(err)`. */
export function extractSiteContentFieldErrors<T extends string>(err: unknown): Partial<Record<T, string>> | null {
  return extractFieldErrors<T>(err);
}
