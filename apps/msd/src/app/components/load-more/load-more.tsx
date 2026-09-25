import { useEffect, useRef } from 'react';
import { CircularProgress, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import './load-more.css';

export interface LoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  error: string;
  /** e.g. "Showing 12 of 24" (polite live region). */
  status: string;
  onLoadMore: () => void;
  copy: { button: string; loading: string; retry: string };
}

/** Infinite-scroll footer: loads the next page near the viewport, with a visible button fallback. */
export function LoadMore({ hasMore, loading, error, status, onLoadMore, copy }: LoadMoreProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const latest = useRef(onLoadMore);
  latest.current = onLoadMore;
  const auto = hasMore && !loading && !error;

  useEffect(() => {
    const el = sentinel.current;
    if (!auto || !el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) latest.current();
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [auto]);

  return (
    <div className="load-more">
      <p className="load-more__status body-medium" aria-live="polite">
        {status}
      </p>
      {error ? (
        <>
          <p className="error-state" role="alert">
            {error}
          </p>
          <OutlinedButton onClick={onLoadMore}>{copy.retry}</OutlinedButton>
        </>
      ) : loading ? (
        <CircularProgress indeterminate aria-label={copy.loading} />
      ) : hasMore ? (
        <OutlinedButton onClick={onLoadMore}>{copy.button}</OutlinedButton>
      ) : null}
      <div ref={sentinel} aria-hidden="true" />
    </div>
  );
}
