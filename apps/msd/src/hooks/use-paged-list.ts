import { useCallback, useEffect, useRef, useState } from 'react';

export interface PagedResponse<T> {
  data: T[];
  meta?: { total?: number };
}

export interface PagedListOptions<T> {
  /** false = do not fetch (e.g. the list is for another category type). */
  enabled?: boolean;
  /** A prerendered first page for this key: shown at once, refreshed once in the background. */
  initial?: { items: T[]; total: number };
  errorMessage: (err: unknown) => string;
}

export interface PagedList<T> {
  items: T[];
  total: number;
  status: 'loading' | 'ready' | 'error';
  error: string;
  hasMore: boolean;
  loadingMore: boolean;
  /** Next page; after a first-page error, retries page 1. */
  loadMore: () => void;
}

interface State<T> {
  key: string;
  items: T[];
  total: number;
  page: number;
  status: PagedList<T>['status'];
  error: string;
  loadingMore: boolean;
}

/** Page-by-page list for "load more" listings. A new `key` (any filter change) restarts at
 *  page 1; responses for an older key or request are dropped. */
export function usePagedList<T>(
  fetchPage: (page: number) => Promise<PagedResponse<T>>,
  key: string,
  { enabled = true, initial, errorMessage }: PagedListOptions<T>,
): PagedList<T> {
  const [state, setState] = useState<State<T>>(() =>
    initial
      ? { key, items: initial.items, total: initial.total, page: 1, status: 'ready', error: '', loadingMore: false }
      : { key: '', items: [], total: 0, page: 0, status: 'loading', error: '', loadingMore: false },
  );
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const errorRef = useRef(errorMessage);
  errorRef.current = errorMessage;
  const requestId = useRef(0);
  const refreshed = useRef(false);

  const load = useCallback(
    (page: number, mode: 'reset' | 'append' | 'refresh') => {
      const id = ++requestId.current;
      if (mode === 'reset') setState({ key, items: [], total: 0, page: 0, status: 'loading', error: '', loadingMore: false });
      if (mode === 'append') setState((s) => ({ ...s, loadingMore: true, error: '' }));
      fetchRef
        .current(page)
        .then(({ data, meta }) => {
          if (id !== requestId.current) return;
          const rows = data ?? [];
          setState((s) => {
            const items = mode === 'append' ? [...s.items, ...rows] : rows;
            return { key, items, total: meta?.total ?? items.length, page, status: 'ready', error: '', loadingMore: false };
          });
        })
        .catch((err) => {
          // A failed background refresh keeps the prerendered page on screen.
          if (id !== requestId.current || mode === 'refresh') return;
          setState((s) => ({ ...s, status: mode === 'append' ? 'ready' : 'error', error: errorRef.current(err), loadingMore: false }));
        });
    },
    [key],
  );

  useEffect(() => {
    if (!enabled) return;
    if (state.key === key && state.page > 0) {
      // Seeded page for this key: refresh it once, quietly.
      if (!refreshed.current) {
        refreshed.current = true;
        load(1, 'refresh');
      }
      return;
    }
    load(1, 'reset');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  const loadMore = useCallback(() => {
    if (state.status === 'error') {
      load(1, 'reset');
      return;
    }
    if (state.status !== 'ready' || state.loadingMore || state.items.length >= state.total) return;
    load(state.page + 1, 'append');
  }, [state, load]);

  return {
    items: state.items,
    total: state.total,
    status: state.status,
    error: state.error,
    hasMore: state.status === 'ready' && state.items.length < state.total,
    loadingMore: state.loadingMore,
    loadMore,
  };
}
