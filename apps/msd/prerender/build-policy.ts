/**
 * Whether a prerender run must fail the build. A production deploy that silently ships the bare
 * SPA (API unreachable, or nothing rendered) loses every prerendered page, so it fails unless
 * `PRERENDER_ALLOW_EMPTY=1`. Preview and local builds always pass. Returns the failure message,
 * or null when the build may continue.
 */
export function shouldFailBuild(input: {
  vercelEnv: string | undefined;
  rendered: number;
  apiDown: boolean;
  allowEmpty: boolean;
}): string | null {
  if (input.vercelEnv !== 'production' || input.allowEmpty) return null;
  if (input.apiDown) {
    return 'production build: the catalog API was unreachable, so no page was prerendered. Check PRERENDER_API_URL, or set PRERENDER_ALLOW_EMPTY=1 to ship the SPA only.';
  }
  if (input.rendered === 0) {
    return 'production build: prerender produced 0 routes. Set PRERENDER_ALLOW_EMPTY=1 to ship the SPA only.';
  }
  return null;
}
