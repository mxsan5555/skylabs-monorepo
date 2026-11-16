import { useEffect, useId, useRef, useState } from 'react';
import { FilledTonalButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useCatalogShell } from '../../../catalog/catalog-shell';
import { useCustomEvent } from '../../../hooks/use-custom-event';
import { useVisitorLocation } from '../../../location/location-context';
import { NEAREST_CITY_MAX_KM } from '../../../location/geo';
import type { CatalogLocation } from '../../../api/catalog';
import { fillTemplate } from '../../../utils/format';
import content from '../../../content.json';
import './city-picker-dialog.css';

const t = content.header.city;

/**
 * Location chooser body shared by `CityPickerDialog` and the header search panel: a city filter
 * (Enter picks the first match), "Use my current location", an alert when the browser refuses
 * or fails or the visitor is farther than `NEAREST_CITY_MAX_KM` from every partner city, and the
 * partner cities. `onDone` runs after a city is set or the browser located the visitor near one;
 * a failed or far lookup keeps the picker open so the visitor can pick a city instead.
 */
export function CityPicker({
  onDone,
  autoFocus = false,
}: {
  onDone: () => void;
  autoFocus?: boolean;
}) {
  const { status, city, state, setCity, requestBrowser } = useVisitorLocation();
  const { locations } = useCatalogShell();
  const fieldRef = useRef<HTMLElement & { value: string; focus: () => void }>(
    null,
  );
  const [filter, setFilter] = useState('');
  const [problem, setProblem] = useState<'failed' | 'far' | null>(null);
  const errorId = useId();

  const q = filter.trim().toLowerCase();
  const matches = q
    ? locations.filter(
        (loc) =>
          loc.city.toLowerCase().includes(q) ||
          loc.state?.toLowerCase().includes(q),
      )
    : locations;

  const pick = (loc: CatalogLocation) => {
    setCity(loc);
    onDone();
  };

  const locate = async () => {
    setProblem(null);
    const result = await requestBrowser();
    if (result === 'located') onDone();
    else if (result === 'failed' || result === 'far') setProblem(result);
  };

  useEffect(() => {
    if (!autoFocus) return;
    const el = fieldRef.current as
      | (HTMLElement & { updateComplete?: Promise<unknown> })
      | null;
    void el?.updateComplete?.then(() => el.focus());
  }, [autoFocus]);

  useCustomEvent(fieldRef, 'input', () =>
    setFilter(fieldRef.current?.value ?? ''),
  );
  useCustomEvent(fieldRef, 'sky-submit', () => {
    if (matches[0]) pick(matches[0]);
  });

  return (
    <div className="city-dialog">
      <sky-action-field
        ref={fieldRef}
        variant="outlined"
        dense
        clearable
        clear-label={content.header.searchClear}
        icon="location_on"
        type="search"
        enterkeyhint="go"
        autocomplete="address-level2"
        label={t.filterLabel}
        placeholder={t.filterPlaceholder}
      />
      <FilledTonalButton
        className="city-dialog__locate"
        disabled={status === 'locating'}
        aria-describedby={problem ? errorId : undefined}
        onClick={() => void locate()}
      >
        <Icon slot="icon" aria-hidden="true">
          my_location
        </Icon>
        {status === 'locating' ? t.locating : t.useCurrent}
      </FilledTonalButton>
      {problem && (
        <div id={errorId} className="city-dialog__error" role="alert">
          <Icon aria-hidden="true">error</Icon>
          <p className="body-medium">
            {problem === 'far' ? (
              <>
                <strong>{t.locateFarTitle}</strong>{' '}
                {fillTemplate(t.locateFarText, { km: String(NEAREST_CITY_MAX_KM) })}
              </>
            ) : (
              <>
                <strong>{t.locateFailedTitle}</strong> {t.locateFailedText}
              </>
            )}
          </p>
        </div>
      )}
      {matches.length > 0 ? (
        <ul className="city-dialog__list" aria-label={t.listLabel}>
          {matches.map((loc) => (
            <li key={`${loc.state}|${loc.city}`}>
              <button
                type="button"
                className="city-dialog__option body-large"
                aria-current={
                  loc.city === city && loc.state === state ? 'true' : undefined
                }
                onClick={() => pick(loc)}
              >
                {loc.city}
                <span className="city-dialog__state body-small">
                  {loc.state}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="city-dialog__empty body-medium" role="status">
          {fillTemplate(t.noMatch, { query: filter.trim() })}
        </p>
      )}
    </div>
  );
}
