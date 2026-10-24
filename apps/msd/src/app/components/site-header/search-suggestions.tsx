import { createElement, useId, type ReactNode } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { CityPicker } from '../city-picker-dialog/city-picker';
import type {
  SearchSuggestionGroup,
  SearchSuggestionItem,
} from './use-search-suggestions';
import { fillTemplate } from '../../../utils/format';
import content from '../../../content.json';
import './search-suggestions.css';

const t = content.header.searchSuggestions;

export type SearchPanelMode = 'results' | 'location';

/** Flattens groups into one ordered list for keyboard nav / active-descendant lookup, in the
 *  order the groups render. */
export function flattenSuggestions(
  groups: SearchSuggestionGroup[],
): { optionId: string; item: SearchSuggestionItem }[] {
  return groups.flatMap((group) =>
    group.items.map((item) => ({ optionId: `${group.key}-${item.id}`, item })),
  );
}

/** The label with the query's first match in bold, so the visitor sees why a row matched. */
function highlight(label: string, query: string): ReactNode {
  const at = query ? label.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return label;
  return (
    <>
      {label.slice(0, at)}
      <mark className="search-panel__match">
        {label.slice(at, at + query.length)}
      </mark>
      {label.slice(at + query.length)}
    </>
  );
}

function RichRow({
  item,
  query,
}: {
  item: SearchSuggestionItem;
  query: string;
}) {
  const meta = [item.sublabel, item.place].filter(Boolean).join(' · ');
  return (
    <>
      <sky-image
        className="search-panel__media"
        {...(item.image ? { src: item.image } : {})}
        alt=""
        ratio="1"
        shape="medium"
        placeholderIcon="spa"
      />
      <span className="search-panel__body">
        <span className="search-panel__title title-small">
          {highlight(item.label, query)}
        </span>
        {meta && <span className="search-panel__meta body-small">{meta}</span>}
        {(item.price || item.distance) && (
          <span className="search-panel__price body-small">
            {item.price && (
              <span className="search-panel__current title-small">
                {item.price}
              </span>
            )}
            {item.originalPrice && <s>{item.originalPrice}</s>}
            {item.discount && (
              <span className="search-panel__discount label-medium">
                {item.discount}
              </span>
            )}
            {item.distance && (
              <span className="search-panel__distance">
                <Icon aria-hidden="true">near_me</Icon>
                {item.distance}
              </span>
            )}
          </span>
        )}
      </span>
    </>
  );
}

function TextRow({
  item,
  query,
  icon,
}: {
  item: SearchSuggestionItem;
  query: string;
  icon: string;
}) {
  return (
    <>
      <Icon className="search-panel__icon" aria-hidden="true">
        {icon}
      </Icon>
      <span className="search-panel__body">
        <span className="search-panel__title body-large">
          {highlight(item.label, query)}
        </span>
        {item.sublabel && (
          <span className="search-panel__meta body-small">{item.sublabel}</span>
        )}
      </span>
    </>
  );
}

export interface SearchPanelProps {
  id: string;
  listboxId: string;
  query: string;
  mode: SearchPanelMode;
  /** "Near {city}" text, or null when the visitor has no location yet. */
  locationLabel: string | null;
  loading: boolean;
  groups: SearchSuggestionGroup[];
  total: number | null;
  /** Show the results footer (a query long enough to search). */
  searching: boolean;
  activeOptionId: string | null;
  onHover: (optionId: string) => void;
  onSelect: (item: SearchSuggestionItem) => void;
  onShowAll: () => void;
  onModeChange: (mode: SearchPanelMode) => void;
  /** The location step finished (a city was set or the browser located the visitor). */
  onLocationDone: () => void;
  listboxRef: (el: HTMLDivElement | null) => void;
}

/**
 * Header search panel (docs/msd/PLANNING.md §4 "Header search"). Results mode: a location row
 * (Near {city} + Change, or a prompt to set one), then a listbox of category text rows and
 * Services / Therapists / Products rich rows, then "Show all results". Options are highlighted
 * through the field's active descendant, so focus stays in the input; the location row and the
 * footer are ordinary buttons reached with Tab. Location mode swaps the results for the shared
 * `CityPicker`.
 */
export function SearchPanel(props: SearchPanelProps) {
  const {
    id,
    listboxId,
    query,
    mode,
    locationLabel,
    loading,
    groups,
    total,
    searching,
    activeOptionId,
  } = props;
  const titleId = useId();
  const q = query.trim();
  const hasResults = groups.length > 0;

  if (mode === 'location') {
    return (
      <section id={id} className="search-panel" aria-labelledby={titleId}>
        <div className="search-panel__step-head">
          {createElement(
            'md-icon-button',
            {
              'aria-label': t.back,
              onClick: () => props.onModeChange('results'),
            },
            createElement('md-icon', { 'aria-hidden': 'true' }, 'arrow_back'),
          )}
          <h2 id={titleId} className="search-panel__step-title title-medium">
            {t.locationTitle}
          </h2>
        </div>
        <div className="search-panel__step-body">
          <CityPicker autoFocus onDone={props.onLocationDone} />
        </div>
      </section>
    );
  }

  return (
    <div id={id} className="search-panel">
      <div className="search-panel__location">
        <Icon aria-hidden="true">location_on</Icon>
        <span className="search-panel__location-text body-medium">
          {locationLabel ?? t.noLocation}
        </span>
        <button
          type="button"
          className="search-panel__change label-large"
          onClick={() => props.onModeChange('location')}
        >
          {locationLabel ? t.change : t.setLocation}
        </button>
      </div>

      <div className="search-panel__scroll">
        <div
          ref={props.listboxRef}
          id={listboxId}
          role="listbox"
          aria-label={t.listLabel}
          className="search-panel__list"
        >
          {groups.map((group) => {
            const headingId = `${listboxId}-${group.key}`;
            return (
              <div
                key={group.key}
                role="group"
                aria-labelledby={headingId}
                aria-describedby={group.note ? `${headingId}-note` : undefined}
                className="search-panel__group"
              >
                <p id={headingId} className="search-panel__heading label-large">
                  {group.label}
                </p>
                {group.note && (
                  <p
                    id={`${headingId}-note`}
                    className="search-panel__note body-small"
                  >
                    {group.note}
                  </p>
                )}
                {group.items.map((item) => {
                  const optionId = `${group.key}-${item.id}`;
                  const active = optionId === activeOptionId;
                  return (
                    <button
                      key={optionId}
                      id={`${listboxId}-${optionId}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={active}
                      className={`search-panel__row${group.rich ? ' search-panel__row--rich' : ''}${active ? ' search-panel__row--active' : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => props.onHover(optionId)}
                      onClick={() => props.onSelect(item)}
                    >
                      {group.rich ? (
                        <RichRow item={item} query={q} />
                      ) : (
                        <TextRow
                          item={item}
                          query={q}
                          icon={group.key === 'browse' ? 'category' : 'search'}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <p className="search-panel__status body-medium" role="status">
          {searching && loading && !hasResults ? t.loading : ''}
          {searching && !loading && !hasResults
            ? fillTemplate(t.noResults, { query: q })
            : ''}
        </p>
      </div>

      {searching && (
        <div className="search-panel__footer">
          {createElement(
            'md-filled-button',
            { className: 'search-panel__all', onClick: props.onShowAll },
            createElement(
              'md-icon',
              { slot: 'icon', 'aria-hidden': 'true' },
              'search',
            ),
            total === 1
              ? t.showAllOne
              : total
                ? fillTemplate(t.showAllCount, { count: String(total) })
                : t.showAll,
          )}
        </div>
      )}
    </div>
  );
}
