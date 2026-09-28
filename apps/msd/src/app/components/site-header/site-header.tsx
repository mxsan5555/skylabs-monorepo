import { useEffect, useId, useMemo, useRef, useState, type FocusEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCustomEvent } from '../../../hooks/use-custom-event';
import { useDismiss } from '../../../hooks/use-dismiss';
import { useHideOnScroll } from '../../../hooks/use-hide-on-scroll';
import { useCatalogShell } from '../../../catalog/catalog-shell';
import { useVisitorLocation } from '../../../location/location-context';
import { CategoryStrip } from './category-strip';
import { CityChip } from './city-chip';
import { HeaderActions } from './header-actions';
import { SearchSuggestions, flattenSuggestions } from './search-suggestions';
import { MIN_QUERY_LENGTH, useSearchSuggestions, type SearchSuggestionItem } from './use-search-suggestions';
import content from '../../../content.json';
import logo from '../../../assets/logo.jpg';
import './site-header.css';

/**
 * Site header. Desktop (>= 840px): row 1 brand, city, search, actions; row 2 category strip
 * that slides away on scroll down. Phones: brand + city, then full-width search; actions live
 * in MobileTabBar. Search submits to /explore, the search results route; typing shows live
 * suggestions (Deals/Products/Therapists/Categories/Subcategories) from the same public catalog
 * API the rest of the app uses, filtered by the visitor's current location.
 */
export function SiteHeader() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const compact = useHideOnScroll();
  const fieldRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const { categories } = useCatalogShell();
  const { city, state, coords } = useVisitorLocation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null);

  const { groups, loading } = useSearchSuggestions(query, categories, { city, state, coords });
  const flat = useMemo(() => flattenSuggestions(groups), [groups]);
  const showDropdown = open && query.trim().length >= MIN_QUERY_LENGTH;

  useDismiss(showDropdown, wrapRef, () => setOpen(false));

  // A route change (a suggestion click, /explore submit, or any other navigation) always closes
  // the dropdown, so it never lingers over the page it just navigated away from.
  useEffect(() => {
    setOpen(false);
  }, [routerLocation.pathname, routerLocation.search]);

  useEffect(() => {
    setActiveOptionId(null);
  }, [groups]);

  const selectItem = (item: SearchSuggestionItem) => {
    const field = fieldRef.current as (HTMLElement & { value: string }) | null;
    if (field) field.value = '';
    setQuery('');
    setOpen(false);
    navigate(item.href);
  };

  useEffect(() => {
    const el = fieldRef.current as (HTMLElement & { value: string }) | null;
    if (!el) return;
    const onInput = () => {
      const value = el.value;
      setQuery(value);
      setOpen(value.trim().length > 0);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!showDropdown || flat.length === 0) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex = flat.findIndex((f) => f.optionId === activeOptionId);
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = currentIndex === -1 ? (delta === 1 ? 0 : flat.length - 1) : (currentIndex + delta + flat.length) % flat.length;
        setActiveOptionId(flat[nextIndex].optionId);
      } else if (e.key === 'Enter') {
        const active = flat.find((f) => f.optionId === activeOptionId);
        if (active) {
          e.preventDefault();
          selectItem(active.item);
        }
      }
    };
    el.addEventListener('input', onInput);
    el.addEventListener('keydown', onKeyDown);
    return () => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('keydown', onKeyDown);
    };
    // Re-attached every render (cheap, two listeners) so the keydown closure always sees the
    // latest `flat`/`activeOptionId`/`showDropdown` — avoids a stale-closure bug from a narrower
    // dependency array.
  });

  // Tabbing (or otherwise moving focus) out of the field/dropdown closes it, same as
  // CategoryStrip's mega panel; a null relatedTarget (pointer press on a non-focusable spot) is
  // left to useDismiss's pointerdown handler instead.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && !e.currentTarget.contains(next)) setOpen(false);
  };

  useCustomEvent<{ value: string }>(fieldRef, 'sky-submit', (e) => {
    const q = e.detail.value;
    setOpen(false);
    navigate(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore');
  });

  return (
    <>
      <a className="site-skip label-large" href="#main-content">
        {content.header.skipToContent}
      </a>
      <header className={`site-header${compact ? ' site-header--compact' : ''}`}>
        <div className="site-header__top">
          <Link to="/" className="site-header__brand">
            <img src={logo} alt={content.site.fullName} width={402} height={171} className="site-header__logo" />
          </Link>
          <CityChip />
          <div ref={wrapRef} className="site-header__search-wrap" onBlur={onBlur}>
            <sky-action-field
              ref={fieldRef}
              className="site-header__search"
              role="search"
              dense
              type="search"
              enterkeyhint="search"
              icon="search"
              label={content.header.searchLabel}
              placeholder={content.header.searchPlaceholder}
              action-label={content.header.searchAction}
              aria-autocomplete="list"
              aria-expanded={showDropdown}
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId ? `${listboxId}-${activeOptionId}` : undefined}
            />
            {showDropdown && (
              <SearchSuggestions
                id={listboxId}
                loading={loading}
                groups={groups}
                activeOptionId={activeOptionId}
                onHover={setActiveOptionId}
                onSelect={selectItem}
              />
            )}
          </div>
          <HeaderActions />
        </div>
        <CategoryStrip />
      </header>
    </>
  );
}
