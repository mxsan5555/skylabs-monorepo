import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Dialog, Icon, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useCatalogShell } from '../../../catalog/catalog-shell';
import { useCustomEvent } from '../../../hooks/use-custom-event';
import { useVisitorLocation } from '../../../location/location-context';
import { fillTemplate } from '../../../utils/format';
import content from '../../../content.json';
import './search-city-select.css';

const t = content.header.searchCity;

/**
 * The dialog's body, as its own component so it mounts fresh every time the dialog opens: its
 * `sky-action-field` only exists while the dialog is open, so the `input`/`sky-submit` listeners
 * (attached by a mount effect via `useCustomEvent`) must mount alongside it — a parent effect
 * keyed off a `useRef` that's already populated at the *parent's* mount never fires again when
 * this field is later created, so it would never actually attach.
 */
function SearchCityDialogContent({ cities, searchCity, onPick, onClose }: { cities: string[]; searchCity: string | null; onPick: (city: string | null) => void; onClose: () => void }) {
  const fieldRef = useRef<HTMLElement & { value: string; focus: () => void }>(null);
  const [filter, setFilter] = useState('');
  const errorId = useId();

  const q = filter.trim().toLowerCase();
  const matches = q ? cities.filter((c) => c.toLowerCase().includes(q)) : cities;

  useEffect(() => {
    const el = fieldRef.current as (HTMLElement & { updateComplete?: Promise<unknown> }) | null;
    void el?.updateComplete?.then(() => el.focus());
  }, []);

  useCustomEvent(fieldRef, 'input', () => setFilter(fieldRef.current?.value ?? ''));
  useCustomEvent(fieldRef, 'sky-submit', () => {
    if (matches[0]) onPick(matches[0]);
  });

  return (
    <Dialog open onClose={onClose}>
      <span slot="headline">{t.dialogTitle}</span>
      <div slot="content" className="search-city-dialog">
        <sky-action-field
          ref={fieldRef}
          variant="outlined"
          dense
          clearable
          clear-label={content.header.searchClear}
          icon="search"
          type="search"
          enterkeyhint="go"
          autocomplete="address-level2"
          label={t.filterLabel}
          placeholder={t.filterPlaceholder}
          aria-describedby={errorId}
        />
        <ul className="search-city-dialog__list" aria-label={t.listLabel}>
          <li>
            <button type="button" className="search-city-dialog__option body-large" aria-current={searchCity === null ? 'true' : undefined} onClick={() => onPick(null)}>
              {t.allCitiesOption}
            </button>
          </li>
          {matches.map((city) => (
            <li key={city}>
              <button type="button" className="search-city-dialog__option body-large" aria-current={city === searchCity ? 'true' : undefined} onClick={() => onPick(city)}>
                {city}
              </button>
            </li>
          ))}
        </ul>
        {matches.length === 0 && (
          <p id={errorId} className="search-city-dialog__empty body-medium" role="status">
            {fillTemplate(t.noMatch, { query: filter.trim() })}
          </p>
        )}
      </div>
      <div slot="actions">
        <TextButton onClick={onClose}>{t.close}</TextButton>
      </div>
    </Dialog>
  );
}

/**
 * The search bar's own city/area selector (item F4) — `[ City/Area ▾ ] [ search… 🔍 ]`.
 * Deliberately independent of the header's own state picker (`CityChip`): that one is a coarse,
 * app-wide personalization choice (home hero, banners); this one is a fine-grained override
 * scoped to search/explore results only, via `useVisitorLocation().searchCity`. The options list
 * narrows to the chosen state's partner cities when one is set, otherwise every partner city —
 * "area" isn't a real filter yet (no `Branch.area` column exists), so this is city-only for now;
 * the label still reads "City/Area" per the product brief, ready for that to land later.
 */
export function SearchCitySelect() {
  const { state, searchCity, setSearchCity } = useVisitorLocation();
  const { locations } = useCatalogShell();
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);

  const cities = useMemo(() => {
    const scoped = state ? locations.filter((l) => l.state === state) : locations;
    return [...new Set(scoped.map((l) => l.city))].sort();
  }, [locations, state]);

  const label = searchCity ?? t.allCitiesOption;

  const close = () => {
    setOpen(false);
    chipRef.current?.focus();
  };

  const pick = (city: string | null) => {
    setSearchCity(city);
    close();
  };

  return (
    <>
      <button
        ref={chipRef}
        type="button"
        className="search-city-select"
        aria-haspopup="dialog"
        aria-label={`${t.changeLabel}: ${label}`}
        onClick={() => setOpen(true)}
      >
        <Icon aria-hidden="true">location_on</Icon>
        <span className="search-city-select__text">{label}</span>
        <Icon aria-hidden="true" className="search-city-select__caret">
          arrow_drop_down
        </Icon>
      </button>
      {open && <SearchCityDialogContent cities={cities} searchCity={searchCity} onPick={pick} onClose={close} />}
    </>
  );
}

export default SearchCitySelect;
