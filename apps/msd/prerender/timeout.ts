/**
 * Rejects `promise` with a clear error if it has not settled within `ms`. Used by `prerender.ts`
 * so a hanging `PRERENDER_API_URL` call cannot stall the Vercel build forever: `loadShellData`,
 * `loadHomeData` and `loadCategoryData` all go through this before the caller's existing
 * try/catch decides whether to skip prerendering entirely or just skip one route.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label ? `${label}: ` : ''}timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
