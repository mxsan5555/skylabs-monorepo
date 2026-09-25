import { createElement, useState, type ChangeEvent } from 'react';
import '@skylabs-monorepo/shared-ui';
import './checkbox-facet.css';

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface CheckboxFacetProps {
  options: FacetOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  searchLabel: string;
  showMore: string;
  showLess: string;
  /** @default 5 */
  limit?: number;
  /** Screen-reader text for a count (e.g. ", 3 deals"); the visible number is hidden from them. */
  countLabel?: (count: number) => string;
}

/** A searchable, "show more"-limited list of checkbox options with a live count per option. Raw
 *  M3 elements so tests can drive checkbox/search state directly. */
export function CheckboxFacet({ options, selected, onChange, searchLabel, showMore, showLess, limit = 5, countLabel }: CheckboxFacetProps) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const selectedSet = new Set(selected);

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;
  const canExpand = filtered.length > limit;
  const visible = expanded ? filtered : filtered.slice(0, limit);

  const toggle = (value: string, checked: boolean) => {
    onChange(checked ? [...selected, value] : selected.filter((v) => v !== value));
  };

  return (
    <div className="checkbox-facet">
      {options.length > limit &&
        createElement('md-outlined-text-field', {
          type: 'search',
          label: searchLabel,
          value: query,
          onInput: (e: ChangeEvent<HTMLElement & { value: string }>) => setQuery(e.currentTarget.value),
        })}
      <ul className="checkbox-facet__list">
        {visible.map((option) => {
          const isSelected = selectedSet.has(option.value);
          return (
            <li key={option.value}>
              <label className="checkbox-facet__row">
                {createElement('md-checkbox', {
                  checked: isSelected,
                  value: option.value,
                  disabled: option.count === 0 && !isSelected,
                  onChange: (e: ChangeEvent<HTMLElement & { checked: boolean }>) => toggle(option.value, e.currentTarget.checked),
                })}
                <span className="checkbox-facet__label body-medium">{option.label}</span>
                <span className="checkbox-facet__count label-small" aria-hidden={countLabel ? 'true' : undefined}>
                  {option.count}
                </span>
                {countLabel && <span className="sr-only">{countLabel(option.count)}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      {canExpand &&
        createElement(
          'md-text-button',
          { onClick: () => setExpanded((v) => !v) },
          expanded ? showLess : showMore,
        )}
    </div>
  );
}
