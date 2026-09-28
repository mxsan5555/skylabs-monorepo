/** Public origin for canonical/OG/JSON-LD URLs, from `VITE_SITE_URL` (no trailing slash).
 *  Empty when unset (local dev); callers then omit absolute-URL tags instead of guessing. */
export const SITE_URL: string = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? '').replace(/\/+$/, '');

export function absoluteUrl(path: string): string | undefined {
  return SITE_URL ? new URL(path, `${SITE_URL}/`).toString() : undefined;
}
