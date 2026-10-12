import { Children, type ReactNode } from 'react';
import './card-grid.css';

export interface CardGridProps {
  /** Content before the grid (e.g. tabs, status messages). */
  above?: ReactNode;
  /** Wraps the grid in a tabpanel when `above` holds tabs that control it. */
  panel?: { id: string; labelledBy?: string };
  /** Shown instead of the list (loading, error, empty). */
  fallback?: ReactNode;
  /** `grid` (default): the responsive card grid, 272px minimum columns. `list`: single column,
   *  for horizontal cards. `compact`: narrower (160px) columns for small status/step cards that
   *  should sit several to a row (e.g. a member's setup-progress cards). */
  layout?: 'grid' | 'list' | 'compact';
  children?: ReactNode;
}

const LAYOUT_CLASS: Record<'grid' | 'list' | 'compact', string> = {
  grid: '',
  list: ' card-grid__list--list',
  compact: ' card-grid__list--compact',
};

/** Responsive card grid: 272px minimum columns (the card rail's slide width), equal-height rows.
 *  `layout="list"` switches to a single column; `layout="compact"` narrows the columns instead. */
export function CardGrid({ above, panel, fallback, layout = 'grid', children }: CardGridProps) {
  const body = fallback ?? (
    // list-style: none drops list semantics in Safari; the explicit role restores them.
    // eslint-disable-next-line jsx-a11y/no-redundant-roles
    <ul className={`card-grid__list${LAYOUT_CLASS[layout]}`} role="list">
      {Children.map(children, (child) => (
        <li className="card-grid__item">{child}</li>
      ))}
    </ul>
  );
  return (
    <div className="card-grid">
      {above}
      {panel ? (
        <div role="tabpanel" id={panel.id} aria-labelledby={panel.labelledBy}>
          {body}
        </div>
      ) : (
        body
      )}
    </div>
  );
}
