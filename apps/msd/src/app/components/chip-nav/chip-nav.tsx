import { createElement, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChipSet } from '@skylabs-monorepo/shared-ui/react';
import './chip-nav.css';

export interface ChipNavItem {
  value: string;
  label: string;
  /** A page URL: the row becomes a nav of real links (crawlable), not filter chips. */
  href?: string;
}

export interface ChipNavProps {
  items: ChipNavItem[];
  value: string;
  /** Filter chips only; link chips navigate. */
  onSelect?: (value: string) => void;
  ariaLabel: string;
  /** Content at the end of the row, e.g. the result count; it wraps under the chips on phones. */
  end?: ReactNode;
}

/** Single-select pill row (M3 filter chips), or a nav of link chips when the items have `href`.
 *  Scrolls sideways on phones. With no items only `end` renders. */
export function ChipNav({ items, value, onSelect, ariaLabel, end }: ChipNavProps) {
  const chips = items.length === 0 ? null : items.some((item) => item.href) ? (
    <nav className="chip-nav" aria-label={ariaLabel}>
      <ul className="chip-nav__list">
        {items.map((item) => (
          <li key={item.value}>
            <Link
              to={item.href ?? ''}
              className="chip-nav__link label-large"
              aria-current={item.value === value ? 'page' : undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  ) : (
    <ChipSet className="chip-nav" aria-label={ariaLabel}>
      {items.map((item) =>
        createElement('md-filter-chip', {
          key: item.value,
          label: item.label,
          selected: item.value === value,
          onClick: (e: MouseEvent) => {
            // md-filter-chip toggles itself on click; preventDefault keeps the state ours.
            e.preventDefault();
            onSelect?.(item.value);
          },
        }),
      )}
    </ChipSet>
  );
  return (
    <div className="chip-nav-row">
      {chips}
      {end != null && <div className="chip-nav-row__end">{end}</div>}
    </div>
  );
}
