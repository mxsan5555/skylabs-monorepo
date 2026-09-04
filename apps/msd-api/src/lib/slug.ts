/**
 * Shared slug generation — used by Vendor creation (see vendor.service.ts) and by
 * prisma/seed.ts's one-time Vendor.slug backfill (`backfillVendorSlugs`), which previously
 * duplicated this exact `slugify` logic locally. Lowercases, collapses any run of non-alphanumeric
 * characters into a single hyphen, and trims leading/trailing hyphens.
 */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-+|-+$)/g, '') || 'vendor'
  );
}

/**
 * Resolves `slugify(base)` to a slug guaranteed unique per `existsCheck` — first tries the plain
 * slug, then `<slug>-<idSuffix>` (a short, stable disambiguator derived from the row's own id,
 * always available since Vendor generates its id before insert), then falls back to `idSuffix`
 * itself as a last resort (unique by construction). Mirrors the exact fallback shape
 * `prisma/seed.ts`'s `backfillVendorSlugs` already used, rather than an incrementing `-2`/`-3`
 * suffix loop — this repo's own established convention for this exact problem.
 */
export async function ensureUniqueSlug(
  base: string,
  idSuffix: string,
  existsCheck: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const slug = slugify(base);
  if (!(await existsCheck(slug))) return slug;

  const withSuffix = `${slug}-${idSuffix.slice(0, 6)}`;
  if (!(await existsCheck(withSuffix))) return withSuffix;

  return idSuffix;
}
