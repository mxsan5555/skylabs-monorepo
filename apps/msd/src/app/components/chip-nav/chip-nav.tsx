import { createElement, type MouseEvent } from 'react';
import { ChipSet } from '@skylabs-monorepo/shared-ui/react';
import './chip-nav.css';

export interface ChipNavItem {
  value: string;
  label: string;
}

export interface ChipNavProps {
  items: ChipNavItem[];
  value: string;
  onSelect: (value: string) => void;
  ariaLabel: string;
}

/** Single-select pill row (M3 filter chips). Scrolls sideways on phones. */
export function ChipNav({ items, value, onSelect, ariaLabel }: ChipNavProps) {
  return (
    <ChipSet className="chip-nav" aria-label={ariaLabel}>
      {items.map((item) =>
        createElement('md-filter-chip', {
          key: item.value,
          label: item.label,
          selected: item.value === value,
          onClick: (e: MouseEvent) => {
            // md-filter-chip toggles itself on click; preventDefault keeps the state ours.
            e.preventDefault();
            onSelect(item.value);
          },
        }),
      )}
    </ChipSet>
  );
}
