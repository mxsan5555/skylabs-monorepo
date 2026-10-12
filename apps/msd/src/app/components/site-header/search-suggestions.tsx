import type { SearchSuggestionGroup, SearchSuggestionItem } from './use-search-suggestions';
import content from '../../../content.json';
import './search-suggestions.css';

const t = content.header.searchSuggestions;

/** Flattens groups into one ordered list for keyboard nav / activedescendant lookup — same
 *  order the groups render in. */
export function flattenSuggestions(groups: SearchSuggestionGroup[]): { optionId: string; item: SearchSuggestionItem }[] {
  return groups.flatMap((group) => group.items.map((item) => ({ optionId: `${group.key}-${item.id}`, item })));
}

/** Live search suggestions dropdown: grouped Deals/Products/Therapists/Categories/Subcategories,
 *  a loading state while the debounced fetch is in flight, and a no-results state once it
 *  settles empty. Options are real buttons (mouse-selectable) but keyboard highlighting is done
 *  via `aria-activedescendant` on the search field itself, so focus never leaves the input. */
export function SearchSuggestions({
  id,
  loading,
  groups,
  activeOptionId,
  onHover,
  onSelect,
}: {
  id: string;
  loading: boolean;
  groups: SearchSuggestionGroup[];
  activeOptionId: string | null;
  onHover: (optionId: string) => void;
  onSelect: (item: SearchSuggestionItem) => void;
}) {
  const hasResults = groups.length > 0;

  return (
    <div id={id} className="search-suggestions" role="listbox" aria-label={t.listLabel}>
      {loading && !hasResults && (
        <p className="search-suggestions__status" role="status">
          {t.loading}
        </p>
      )}
      {!loading && !hasResults && (
        <p className="search-suggestions__status" role="status">
          {t.noResults}
        </p>
      )}
      {groups.map((group) => (
        <div key={group.key} className="search-suggestions__group">
          <p className="search-suggestions__heading label-small">{group.label}</p>
          {group.items.map((item) => {
            const optionId = `${group.key}-${item.id}`;
            const active = optionId === activeOptionId;
            return (
              <button
                key={optionId}
                id={`${id}-${optionId}`}
                type="button"
                role="option"
                aria-selected={active}
                className={`search-suggestions__item body-large${active ? ' search-suggestions__item--active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => onHover(optionId)}
                onClick={() => onSelect(item)}
              >
                <span className="search-suggestions__item-label">{item.label}</span>
                {item.sublabel && <span className="search-suggestions__item-sublabel body-small">{item.sublabel}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
