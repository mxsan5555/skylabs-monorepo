import { useEffect, useState } from 'react';

/**
 * Loads optional CMS content for a static page. Every caller has a content.json fallback, so a
 * failed or missing (404) load resolves to `null` and the page renders its default copy instead
 * of an error. `load` must be a stable (module-level) function; `arg` re-runs it (e.g. a slug).
 */
export function useCmsContent<T>(load: (arg: string) => Promise<{ data: T }>, arg = '') {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    load(arg)
      .then((res) => !cancelled && setData(res.data))
      .catch(() => !cancelled && setData(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [load, arg]);

  return { data, loading };
}
