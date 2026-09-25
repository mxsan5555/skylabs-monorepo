import { Children, type ReactNode } from 'react';
import './card-grid.css';

export interface CardGridProps {
  /** Content before the grid (e.g. tabs, status messages). */
  above?: ReactNode;
  /** Wraps the grid in a tabpanel when `above` holds tabs that control it. */
  panel?: { id: string; labelledBy?: string };
  /** Shown instead of the list (loading, error, empty). */
  fallback?: ReactNode;
  children?: ReactNode;
}

/** Responsive card grid: 272px minimum columns (the card rail's slide width), equal-height rows. */
export function CardGrid({ above, panel, fallback, children }: CardGridProps) {
  const body = fallback ?? (
    // list-style: none drops list semantics in Safari; the explicit role restores them.
    // eslint-disable-next-line jsx-a11y/no-redundant-roles
    <ul className="card-grid__list" role="list">
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
