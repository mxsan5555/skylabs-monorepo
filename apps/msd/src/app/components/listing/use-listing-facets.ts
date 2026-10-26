import { useEffect, useState } from 'react';
import type { ListingFacets } from '../filter-panel/filter-panel';

/**
 * Filter-panel counts for a listing: calls `fetcher(opts)` whenever the options change (compared
 * by value) and keeps the last counts when a refresh fails (facets are optional). Pass a null
 * fetcher to skip (e.g. while the page's category is still loading). `resetKey` clears the
 * counts when the page switches to another listing.
 */
export function useListingFacets<O>(
  fetcher: ((opts: O) => Promise<{ data: ListingFacets | null | undefined }>) | null,
  opts: O,
  resetKey?: string,
): ListingFacets | null {
  const [facets, setFacets] = useState<ListingFacets | null>(null);
  useEffect(() => setFacets(null), [resetKey]);
  const key = JSON.stringify(opts);
  useEffect(() => {
    if (!fetcher) return;
    let cancelled = false;
    fetcher(JSON.parse(key) as O)
      .then(({ data }) => {
        if (!cancelled) setFacets(data ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fetcher, key]);
  return facets;
}
