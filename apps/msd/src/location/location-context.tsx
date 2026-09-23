import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CatalogLocation } from '../api/catalog';
import { useCatalogShell } from '../catalog/catalog-shell';
import { nearestCity, type Coordinates, type GeoResult } from './geo';

export type LocationSource = 'saved' | 'browser' | 'ip' | 'none';
export type LocationStatus = 'locating' | 'ready' | 'none';

export interface LocationValue {
  status: LocationStatus;
  source: LocationSource;
  city: string | null;
  /** State of the current catalog city; null when unknown or when the city name is ambiguous. */
  state: string | null;
  coords: Coordinates | null;
  setCity: (location: CatalogLocation) => void;
  requestBrowser: () => void;
}

interface Resolved {
  status: LocationStatus;
  source: LocationSource;
  city: string | null;
  state: string | null;
  coords: Coordinates | null;
}

const STORAGE_KEY = 'msd.location';
const NONE: Resolved = { status: 'none', source: 'none', city: null, state: null, coords: null };
const noop = () => undefined;

const LocationContext = createContext<LocationValue>({ ...NONE, setCity: noop, requestBrowser: noop });

const coordsOf = (v: { latitude?: number | null; longitude?: number | null }): Coordinates | null =>
  v.latitude != null && v.longitude != null ? { latitude: v.latitude, longitude: v.longitude } : null;

/** True iff `value` is shaped enough to be a `CatalogLocation` (has a string `city`). Guards
 *  against a corrupted or unrelated JSON blob left behind under the same storage key. */
function isCatalogLocation(value: unknown): value is CatalogLocation {
  return typeof value === 'object' && value !== null && typeof (value as { city?: unknown }).city === 'string';
}

function readSaved(): CatalogLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCatalogLocation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeSaved(value: CatalogLocation | null) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
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
  const choiceGen = useRef(0);
  const browserRequestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const myChoiceGen = choiceGen.current;
    (async () => {
      const saved = readSaved();
      if (saved) {
        if (cancelled || choiceGen.current !== myChoiceGen) return;
        setResolved({ status: 'ready', source: 'saved', city: saved.city, state: saved.state ?? null, coords: coordsOf(saved) });
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
      setResolved(isUsableGeoResult(ip) ? { status: 'ready', source: 'ip', city: ip.city, state: null, coords: coordsOf(ip) } : NONE);
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

  const requestBrowser = useCallback(() => {
    const myBrowserId = ++browserRequestId.current;
    const myChoiceGen = choiceGen.current;
    setResolved((r) => ({ ...r, status: 'locating' }));
    void (async () => {
      const coords = await readBrowserCoords();
      // A newer requestBrowser() call superseded this one, or the visitor picked a city while
      // this lookup was in flight — either way, this result is stale and must not be applied.
      if (browserRequestId.current !== myBrowserId || choiceGen.current !== myChoiceGen) return;
      if (coords) {
        writeSaved(null);
        setResolved({ status: 'ready', source: 'browser', city: null, state: null, coords });
      } else {
        setResolved((r) => ({ ...r, status: r.city || r.coords ? 'ready' : 'none' }));
      }
    })();
  }, []);

  const value = useMemo<LocationValue>(() => {
    const nearest = !resolved.city && resolved.coords ? nearestCity(resolved.coords, locations) : null;
    const city = resolved.city ?? nearest?.city ?? null;
    // An IP city carries no catalog state; take it from the catalog only when the name is unique.
    const namesakes = city ? locations.filter((l) => l.city === city) : [];
    const state = resolved.state ?? nearest?.state ?? (namesakes.length === 1 ? namesakes[0].state : null);
    return { ...resolved, city, state, setCity, requestBrowser };
  }, [resolved, locations, setCity, requestBrowser]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

/**
 * Note: this hook is named `useVisitorLocation` (rather than `useLocation`) specifically to
 * avoid a name clash with React Router's `useLocation`.
 */
export function useVisitorLocation(): LocationValue {
  return useContext(LocationContext);
}
