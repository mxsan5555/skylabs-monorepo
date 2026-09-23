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
  coords: Coordinates | null;
  setCity: (location: CatalogLocation) => void;
  requestBrowser: () => void;
}

interface Resolved {
  status: LocationStatus;
  source: LocationSource;
  city: string | null;
  coords: Coordinates | null;
}

const STORAGE_KEY = 'msd.location';
const NONE: Resolved = { status: 'none', source: 'none', city: null, coords: null };
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
      { maximumAge: 600_000, timeout: 10_000 },
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
 * Browser coordinates map to a city name via the nearest active city from `/catalog/locations`.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const { locations } = useCatalogShell();
  const [resolved, setResolved] = useState<Resolved>({ ...NONE, status: 'locating' });
  // Bumped by every user-driven choice (setCity, requestBrowser) so a slower, superseded
  // lookup can detect it is stale and discard its result instead of clobbering a newer one.
  const requestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const myId = ++requestId.current;
    (async () => {
      const saved = readSaved();
      if (saved) {
        if (cancelled || requestId.current !== myId) return;
        setResolved({ status: 'ready', source: 'saved', city: saved.city, coords: coordsOf(saved) });
        return;
      }
      if (await geolocationGranted()) {
        const coords = await readBrowserCoords();
        if (cancelled || requestId.current !== myId) return;
        if (coords) {
          setResolved({ status: 'ready', source: 'browser', city: null, coords });
          return;
        }
      }
      const ip = await fetchIpLocation();
      if (cancelled || requestId.current !== myId) return;
      setResolved(ip ? { status: 'ready', source: 'ip', city: ip.city, coords: coordsOf(ip) } : NONE);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setCity = useCallback((location: CatalogLocation) => {
    requestId.current += 1;
    writeSaved(location);
    setResolved({ status: 'ready', source: 'saved', city: location.city, coords: coordsOf(location) });
  }, []);

  const requestBrowser = useCallback(() => {
    const myId = ++requestId.current;
    setResolved((r) => ({ ...r, status: 'locating' }));
    void (async () => {
      const coords = await readBrowserCoords();
      if (requestId.current !== myId) return; // a newer setCity/requestBrowser won since this started
      if (coords) {
        writeSaved(null);
        setResolved({ status: 'ready', source: 'browser', city: null, coords });
      } else {
        setResolved((r) => ({ ...r, status: r.city || r.coords ? 'ready' : 'none' }));
      }
    })();
  }, []);

  const value = useMemo<LocationValue>(() => {
    const city = resolved.city ?? (resolved.coords ? (nearestCity(resolved.coords, locations)?.city ?? null) : null);
    return { ...resolved, city, setCity, requestBrowser };
  }, [resolved, locations, setCity, requestBrowser]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

/**
 * `useLocation` shares a name with React Router's hook; consumers that also use the router's
 * hook should import it as `useLocation as useVisitorLocation`.
 */
export function useLocation(): LocationValue {
  return useContext(LocationContext);
}
