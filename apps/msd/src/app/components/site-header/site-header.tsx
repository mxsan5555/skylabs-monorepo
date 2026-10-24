import { useCallback, useEffect, useId, useMemo, useRef, useState, type FocusEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCustomEvent } from '../../../hooks/use-custom-event';
import { useDismiss } from '../../../hooks/use-dismiss';
import { useHideOnScroll } from '../../../hooks/use-hide-on-scroll';
import { useCatalogShell } from '../../../catalog/catalog-shell';
import { useVisitorLocation } from '../../../location/location-context';
import { CategoryStrip } from './category-strip';
import { CityChip } from './city-chip';
import { HeaderActions } from './header-actions';
import { SearchPanel, flattenSuggestions, type SearchPanelMode } from './search-suggestions';
import { MIN_QUERY_LENGTH, useSearchSuggestions, type SearchSuggestionItem } from './use-search-suggestions';
import { fillTemplate } from '../../../utils/format';
import content from '../../../content.json';
import { LOGO_SRC as logo } from '../../../brand';
import './site-header.css';

const t = content.header.searchSuggestions;

/**
 * Site header. Desktop (>= 840px): row 1 brand, city, search, actions; row 2 category strip
 * that slides away on scroll down. Phones: brand + city, then full-width search; actions live
 * in MobileTabBar. Focusing the search opens `SearchPanel`: the visitor's location (or a prompt
 * to set it), then Services / Therapists / Products near that location as they type. Submitting
 * goes to /explore, the search results route.
 */
export function SiteHeader() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const compact = useHideOnScroll();
  const fieldRef = useRef<HTMLElement & { value: string }>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const listboxId = useId();
  const [listbox, setListbox] = useState<HTMLDivElement | null>(null);

  const { categories } = useCatalogShell();
  const { city, state, coords } = useVisitorLocation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SearchPanelMode>('results');
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null);

  const { groups, loading, total } = useSearchSuggestions(query, categories, { city, state, coords });
  const flat = useMemo(() => flattenSuggestions(groups), [groups]);
  const searching = query.trim().length >= MIN_QUERY_LENGTH;
  const locationLabel = city ? fillTemplate(t.near, { city }) : coords ? t.nearYou : null;
  const activeOption = open && activeOptionId ? document.getElementById(`${listboxId}-${activeOptionId}`) : null;

  const close = useCallback(() => {
    setOpen(false);
    setMode('results');
  }, []);
  const focusField = () => fieldRef.current?.focus();
  const backToResults = () => {
    setMode('results');
    focusField();
  };

  // Escape steps back from the location step first; an outside press closes the panel.
  useDismiss(open, wrapRef, (reason) => {
    if (reason === 'escape' && mode === 'location') backToResults();
    else close();
  });

  // A route change (a result click, /explore submit, or any other navigation) closes the panel.
  useEffect(close, [routerLocation.pathname, routerLocation.search, close]);

  useEffect(() => {
    setActiveOptionId(null);
  }, [groups]);

  // Keep the active option in view while arrowing through a scrolled list.
  useEffect(() => {
    activeOption?.scrollIntoView?.({ block: 'nearest' });
  }, [activeOption]);

  const selectItem = (item: SearchSuggestionItem) => {
    if (fieldRef.current) fieldRef.current.value = '';
    setQuery('');
    close();
    navigate(item.href);
  };

  const showAll = (value = query.trim()) => {
    close();
    navigate(value ? `/explore?q=${encodeURIComponent(value)}` : '/explore');
  };

  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const onFocus = () => setOpen(true);
    const onInput = () => {
      setQuery(el.value);
      setOpen(true);
      setMode('results');
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!open || mode !== 'results' || flat.length === 0) return;
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
    el.addEventListener('focusin', onFocus);
    el.addEventListener('input', onInput);
    el.addEventListener('keydown', onKeyDown);
    return () => {
      el.removeEventListener('focusin', onFocus);
      el.removeEventListener('input', onInput);
      el.removeEventListener('keydown', onKeyDown);
    };
    // Re-attached every render (cheap) so the keydown closure always sees the latest
    // `flat`/`activeOptionId`/`open`/`mode` without a stale closure.
  });

  // Tabbing out of the field and panel closes it; a null relatedTarget (pointer press on a
  // non-focusable spot) is left to useDismiss's pointerdown handler instead.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && !e.currentTarget.contains(next)) close();
  };

  useCustomEvent<{ value: string }>(fieldRef, 'sky-submit', (e) => showAll(e.detail.value));

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
              clearable
              clear-label={content.header.searchClear}
              combobox
              expanded={open && mode === 'results'}
              controlsElement={open ? listbox : null}
              activeOption={activeOption}
              type="search"
              enterkeyhint="search"
              autocomplete="off"
              icon="search"
              label={content.header.searchLabel}
              placeholder={content.header.searchPlaceholder}
              action-label={content.header.searchAction}
            />
            {open && (
              <SearchPanel
                id={panelId}
                listboxId={listboxId}
                listboxRef={setListbox}
                query={query}
                mode={mode}
                locationLabel={locationLabel}
                loading={loading}
                groups={groups}
                total={total}
                searching={searching}
                activeOptionId={activeOptionId}
                onHover={setActiveOptionId}
                onSelect={selectItem}
                onShowAll={() => showAll()}
                onModeChange={(next) => (next === 'results' ? backToResults() : setMode(next))}
                onLocationDone={backToResults}
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
