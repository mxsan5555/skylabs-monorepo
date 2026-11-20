import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CatalogLocation } from '../api/catalog';
import { useCatalogShell } from '../catalog/catalog-shell';
import { nearestCity, type Coordinates, type GeoResult } from './geo';

export type LocationSource = 'saved' | 'state' | 'browser' | 'ip' | 'none';
export type LocationStatus = 'locating' | 'ready' | 'none';

export interface LocationValue {
  status: LocationStatus;
  source: LocationSource;
  city: string | null;
  /** State of the current catalog city; null when unknown or when the city name is ambiguous. */
  state: string | null;
  coords: Coordinates | null;
  setCity: (location: CatalogLocation) => void;
  /** A state-only choice (the header's state picker): no single catalog city applies, so `city`
   *  stays null — `coords` becomes the average of that state's partner-city coordinates (a
   *  representative point so distance sorting/filtering still has something to work with), not a
   *  real city's position, so it must never be reverse-resolved back into a city name. */
  setState: (state: string) => void;
  /** Asks the browser for coordinates. Resolves `located`, `far` when it located the visitor but
   *  no partner city is within `NEAREST_CITY_MAX_KM` (the coordinates still apply for distance
   *  sorting), `failed` when the visitor refused or the lookup failed, and `superseded` when a
   *  newer request or a city pick won meanwhile. */
  requestBrowser: () => Promise<BrowserLocateResult>;
  /** The search bar's own city/area selector (item F4) — deliberately independent of `city`
   *  above (which still drives the footer's popular-searches links and the listing pages'
   *  "near you" copy, unaffected by this). Defaults once from `city` the first time it resolves,
   *  then persists whatever the visitor explicitly picks (including clearing it back to "all
   *  cities"); cleared automatically if a new `setState` pick puts it outside the chosen state. */
  searchCity: string | null;
  setSearchCity: (city: string | null) => void;
}

/** What's persisted under `STORAGE_KEY`: a real catalog city (`CatalogLocation`), or a state-only
 *  choice with no single city. */
type PersistedLocation = { state: string; city: string | null; latitude?: number | null; longitude?: number | null };

export type BrowserLocateResult = 'located' | 'far' | 'failed' | 'superseded';

interface Resolved {
  status: LocationStatus;
  source: LocationSource;
  city: string | null;
  state: string | null;
  coords: Coordinates | null;
  /** Raw IP city name, used only when the IP lookup had no coordinates. It is shown only if it
   *  exactly (case-insensitively) names a catalog city; resolved against the catalog at render
   *  time so late-arriving locations still apply. */
  ipCity?: string | null;
}

const STORAGE_KEY = 'msd.location';
const SEARCH_CITY_KEY = 'msd.searchCity';
const NONE: Resolved = { status: 'none', source: 'none', city: null, state: null, coords: null };
const noop = () => undefined;
const failed = () => Promise.resolve<BrowserLocateResult>('failed');

const LocationContext = createContext<LocationValue>({ ...NONE, setCity: noop, setState: noop, requestBrowser: failed, searchCity: null, setSearchCity: noop });

const coordsOf = (v: { latitude?: number | null; longitude?: number | null }): Coordinates | null =>
  v.latitude != null && v.longitude != null ? { latitude: v.latitude, longitude: v.longitude } : null;

/** True iff `value` is shaped enough to be a `PersistedLocation` (a string `state`, and `city`
 *  either a string or null). Guards against a corrupted or unrelated JSON blob left behind under
 *  the same storage key. */
function isPersistedLocation(value: unknown): value is PersistedLocation {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { city?: unknown; state?: unknown };
  return (typeof v.city === 'string' || v.city === null) && typeof v.state === 'string';
}

function readSaved(): PersistedLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPersistedLocation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeSaved(value: PersistedLocation | null) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked (private mode): the choice lasts for this visit only.
  }
}

function readSearchCity(): string | null {
  try {
    return localStorage.getItem(SEARCH_CITY_KEY);
  } catch {
    return null;
  }
}

function writeSearchCity(city: string | null) {
  try {
    if (city) localStorage.setItem(SEARCH_CITY_KEY, city);
    else localStorage.removeItem(SEARCH_CITY_KEY);
  } catch {
    // Storage blocked (private mode): the choice lasts for this visit only.
  }
}

/** True iff `ip` is a usable `GeoResult` — has a non-empty `city` string. `/api/geo` can resolve
 *  to `{}` (or, in local dev, to something that isn't a `GeoResult` at all), which must be
 *  treated the same as "no data" rather than surfaced as a city named `undefined`. */
function isUsableGeoResult(ip: unknown): ip is GeoResult {
  return typeof ip === 'object' && ip !== null && typeof (ip as { city?: unknown }).city === 'string' && (ip as GeoResult).city.length > 0;
}

async function geolocationGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    return status?.state === 'granted';
  } catch {
    return false;
  }
}

function readBrowserCoords(): Promise<Coordinates | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => resolve(null),
      { maximumAge: 600_000, timeout: 5_000 },
    );
  });
}

async function fetchIpLocation(): Promise<GeoResult | null> {
  try {
    const res = await fetch('/api/geo');
    if (!res.ok) return null;
    return (await res.json()) as GeoResult | null;
  } catch {
    // Local dev serves index.html for /api/geo, so JSON parsing fails here: treat as no data.
    return null;
  }
}

/**
 * One location lookup per visit, in order: saved choice, browser coordinates (only when
 * permission is already granted; never prompts on load), Vercel IP headers, none.
 * Browser coordinates map to a city name via the nearest active city from `/catalog/locations`
 * (within `nearestCity`'s distance cap — a visitor far from every active city keeps their raw
 * coordinates for distance sorting but gets no city guess).
 *
 * Two independent guards decide whether an async lookup's result is still allowed to land:
 *  - `choiceGen` is bumped only by `setCity`, the one action that must always win. The mount
 *    effect and `requestBrowser` each capture its value before starting and skip committing if
 *    it has since changed, so a city the visitor explicitly picks can never be clobbered by a
 *    slower lookup that was already in flight.
 *  - `browserRequestId` is bumped by every `requestBrowser` call, so an older, still-pending
 *    geolocation lookup discards its own result instead of clobbering a newer one. It never
 *    touches the mount effect's own IP lookup: that runs and commits independently, so a
 *    `requestBrowser` failure only restores the state that existed before it started and never
 *    cancels a same-time mount lookup still resolving in the background.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const { locations } = useCatalogShell();
  const [resolved, setResolved] = useState<Resolved>({ ...NONE, status: 'locating' });
  const [searchCityState, setSearchCityState] = useState<string | null>(() => readSearchCity());
  const choiceGen = useRef(0);
  const browserRequestId = useRef(0);
  const locationsRef = useRef(locations);
  const searchCityRef = useRef(searchCityState);
  // True once the visitor has an explicit (or previously-persisted) search city, including
  // deliberately clearing it to "all cities" — only the one-time default-from-`city` below must
  // never overwrite that.
  const searchCityDefaulted = useRef(searchCityState !== null);
  useEffect(() => {
    locationsRef.current = locations;
  }, [locations]);
  useEffect(() => {
    searchCityRef.current = searchCityState;
  }, [searchCityState]);

  useEffect(() => {
    let cancelled = false;
    const myChoiceGen = choiceGen.current;
    (async () => {
      const saved = readSaved();
      if (saved) {
        if (cancelled || choiceGen.current !== myChoiceGen) return;
        setResolved({ status: 'ready', source: saved.city ? 'saved' : 'state', city: saved.city, state: saved.state, coords: coordsOf(saved) });
        return;
      }
      const granted = await geolocationGranted();
      if (cancelled || choiceGen.current !== myChoiceGen) return;
      if (granted) {
        const coords = await readBrowserCoords();
        if (cancelled || choiceGen.current !== myChoiceGen) return;
        if (coords) {
          setResolved({ status: 'ready', source: 'browser', city: null, state: null, coords });
          return;
        }
      }
      const ip = await fetchIpLocation();
      if (cancelled || choiceGen.current !== myChoiceGen) return;
      if (!isUsableGeoResult(ip)) {
        setResolved(NONE);
        return;
      }
      // Coordinates resolve through the catalog via nearestCity (75 km cap) like browser ones;
      // the raw IP city name is only a fallback when there are no coordinates.
      const coords = coordsOf(ip);
      setResolved({ status: 'ready', source: 'ip', city: null, state: null, coords, ipCity: coords ? null : ip.city });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setCity = useCallback((location: CatalogLocation) => {
    choiceGen.current += 1;
    writeSaved(location);
    setResolved({ status: 'ready', source: 'saved', city: location.city, state: location.state, coords: coordsOf(location) });
  }, []);

  const setSearchCity = useCallback((city: string | null) => {
    searchCityDefaulted.current = true;
    writeSearchCity(city);
    setSearchCityState(city);
  }, []);

  const setState = useCallback(
    (state: string) => {
      choiceGen.current += 1;
      const inState = locationsRef.current.filter((l) => l.state === state);
      const withCoords = inState.filter((l) => l.latitude != null && l.longitude != null);
      const coords =
        withCoords.length > 0
          ? {
              latitude: withCoords.reduce((sum, l) => sum + (l.latitude as number), 0) / withCoords.length,
              longitude: withCoords.reduce((sum, l) => sum + (l.longitude as number), 0) / withCoords.length,
            }
          : null;
      const saved: PersistedLocation = { state, city: null, latitude: coords?.latitude, longitude: coords?.longitude };
      writeSaved(saved);
      setResolved({ status: 'ready', source: 'state', city: null, state, coords });
      // A search city picked under the PREVIOUS state is meaningless under the new one — clear
      // it rather than leave a "searching in {old city}" filter silently scoped to a state the
      // visitor no longer has selected.
      if (searchCityRef.current && !inState.some((l) => l.city === searchCityRef.current)) {
        setSearchCity(null);
      }
    },
    [setSearchCity],
  );

  const requestBrowser = useCallback(async (): Promise<BrowserLocateResult> => {
    const myBrowserId = ++browserRequestId.current;
    const myChoiceGen = choiceGen.current;
    setResolved((r) => ({ ...r, status: 'locating' }));
    const coords = await readBrowserCoords();
    // A newer requestBrowser() call superseded this one, or the visitor picked a city while
    // this lookup was in flight — either way, this result is stale and must not be applied.
    if (browserRequestId.current !== myBrowserId || choiceGen.current !== myChoiceGen) return 'superseded';
    if (coords) {
      writeSaved(null);
      setResolved({ status: 'ready', source: 'browser', city: null, state: null, coords });
      // Without the catalog cities yet there is nothing to compare with: count it as located.
      const cities = locationsRef.current;
      return cities.length > 0 && !nearestCity(coords, cities) ? 'far' : 'located';
    }
    setResolved((r) => ({ ...r, status: r.city || r.state || r.coords || r.ipCity ? 'ready' : 'none' }));
    return 'failed';
  }, []);

  const computed = useMemo(() => {
    const { ipCity, ...rest } = resolved;
    // A deliberate state-only pick must never be reverse-resolved into a specific city: its
    // `coords` is an averaged, non-real point, and feeding it through `nearestCity` could even
    // land on a city just across the border in a different state.
    const isStatePick = resolved.source === 'state';
    const nearest = !isStatePick && !rest.city && rest.coords ? nearestCity(rest.coords, locations) : null;
    // An IP city without coordinates counts only when it names a catalog city; the catalog's
    // spelling wins, and its state is taken only when the name is unique.
    const ipName = !isStatePick ? ipCity?.toLowerCase() : undefined;
    const namesakes = ipName ? locations.filter((l) => l.city.toLowerCase() === ipName) : [];
    const city = isStatePick ? null : rest.city ?? nearest?.city ?? namesakes[0]?.city ?? null;
    const state = rest.state ?? nearest?.state ?? (namesakes.length === 1 ? namesakes[0].state : null);
    return { ...rest, city, state };
  }, [resolved, locations]);

  // One-time default: the first time a real city resolves (auto-detected or a legacy saved
  // pick), it also seeds the search bar's own city selector — but never overwrites a choice the
  // visitor already made there (including explicitly clearing it), per `searchCityDefaulted`.
  useEffect(() => {
    if (!searchCityDefaulted.current && computed.city) {
      searchCityDefaulted.current = true;
      writeSearchCity(computed.city);
      setSearchCityState(computed.city);
    }
  }, [computed.city]);

  const value = useMemo<LocationValue>(
    () => ({ ...computed, setCity, setState, requestBrowser, searchCity: searchCityState, setSearchCity }),
    [computed, setCity, setState, requestBrowser, searchCityState, setSearchCity],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

/**
 * Note: this hook is named `useVisitorLocation` (rather than `useLocation`) specifically to
 * avoid a name clash with React Router's `useLocation`.
 */
export function useVisitorLocation(): LocationValue {
  return useContext(LocationContext);
}
