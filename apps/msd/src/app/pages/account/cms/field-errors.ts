import { ApiRequestError } from '../../../../api/rbac/client';

export type BlogPostFieldKey =
  | 'title'
  | 'slug'
  | 'excerpt'
  | 'categoryId'
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

export type FaqFieldKey = 'question' | 'answer' | 'sortOrder';

export function extractFaqFieldErrors(err: unknown): Partial<Record<FaqFieldKey, string>> | null {
  return extractFieldErrors<FaqFieldKey>(err);
}

export type BlogCategoryFieldKey = 'name' | 'slug' | 'description' | 'sortOrder' | 'isActive';

export function extractBlogCategoryFieldErrors(err: unknown): Partial<Record<BlogCategoryFieldKey, string>> | null {
  return extractFieldErrors<BlogCategoryFieldKey>(err);
}

export type HowItWorksStepFieldKey = 'title' | 'description' | 'icon' | 'sortOrder' | 'isActive';

export function extractHowItWorksStepFieldErrors(err: unknown): Partial<Record<HowItWorksStepFieldKey, string>> | null {
  return extractFieldErrors<HowItWorksStepFieldKey>(err);
}

export type CareersJobFieldKey =
  | 'jobTitle'
  | 'department'
  | 'location'
  | 'employmentType'
  | 'description'
  | 'responsibilities'
  | 'requirements'
  | 'applyUrl'
  | 'applyInstructions'
  | 'sortOrder';

export function extractCareersJobFieldErrors(err: unknown): Partial<Record<CareersJobFieldKey, string>> | null {
  return extractFieldErrors<CareersJobFieldKey>(err);
}

export type SocialMediaLinkFieldKey = 'platform' | 'displayName' | 'url' | 'sortOrder' | 'isActive';

export function extractSocialMediaLinkFieldErrors(err: unknown): Partial<Record<SocialMediaLinkFieldKey, string>> | null {
  return extractFieldErrors<SocialMediaLinkFieldKey>(err);
}

export type WebsitePageFieldKey = 'title' | 'content' | 'status' | 'metaTitle' | 'metaDescription';

export function extractWebsitePageFieldErrors(err: unknown): Partial<Record<WebsitePageFieldKey, string>> | null {
  return extractFieldErrors<WebsitePageFieldKey>(err);
}

/** The public "Become a Vendor" application's own field set — a subset of msd-api's
 *  `VendorFieldsSchema` (see `VendorSelfCreateSchema`), just the identity/business/address
 *  fields that page actually collects. */
export type BecomeVendorFieldKey =
  | 'businessName'
  | 'businessEmail'
  | 'businessPhone'
  | 'ownerFirstName'
  | 'ownerLastName'
  | 'ownerEmail'
  | 'ownerMobile'
  | 'address'
  | 'city'
  | 'state'
  | 'pincode';

export function extractBecomeVendorFieldErrors(err: unknown): Partial<Record<BecomeVendorFieldKey, string>> | null {
  return extractFieldErrors<BecomeVendorFieldKey>(err);
}
