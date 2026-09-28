import type { ReactNode } from 'react';
import './listing-toolbar.css';

/** Toolbar row above a listing: start controls left, end controls right; wraps on phones. */
export function ListingToolbar({ ariaLabel, start, end }: { ariaLabel: string; start?: ReactNode; end?: ReactNode }) {
  return (
    <div className="listing-toolbar" role="group" aria-label={ariaLabel}>
      {start && <div className="listing-toolbar__start">{start}</div>}
      {end && <div className="listing-toolbar__end">{end}</div>}
    </div>
  );
}
