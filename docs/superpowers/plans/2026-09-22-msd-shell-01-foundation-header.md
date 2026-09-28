# msd Shell Plan 1 of 4: Location, Shared Catalog Data, Header, Mobile Tab Bar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace msd's header with the new two-row desktop header plus phone tab bar, backed by one shared location provider (saved city, browser, Vercel IP, none) and one shared categories/cities fetch.

**Architecture:** Two React context providers (`CatalogShellProvider`, then `LocationProvider`) mount once in `app.tsx`. `SiteHeader` and `MobileTabBar` read from them and from existing auth, wishlist and cart state. The old `useCurrentLocation` hook becomes a thin wrapper over `useLocation()` so the five pages that call it keep working until their own page specs migrate them. A Vercel function (`apps/msd/api/geo.ts`) supplies the IP fallback. msd-api's `/catalog/locations` gains per-city average coordinates so browser coordinates map to a city without Google geocoding.

**Tech Stack:** React 19, React Router 6.30, Vite 8, Vitest + Testing Library (jsdom), shared-ui (Material Web + `sky-*` LIT elements), Express + Prisma 6 (msd-api), Vercel Functions (Web `Request`/`Response` handler).

**Spec:** `docs/superpowers/specs/2026-09-22-msd-shell-home-design.md` (sections 4, 5.1 to 5.3, 6).

**Plan series:** 1 (this) foundation + header + tab bar. 2 footer + `Seo`/JSON-LD. 3 home page. 4 prerender + crawler files.

**Rules for every task:** colours only `var(--md-sys-color-*)`; shape/type/motion/elevation only tokens from `packages/shared-ui/src/theme/base.css`; every user-facing string in `apps/msd/src/content.json`; no em dashes in copy.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `apps/msd-api/src/test-utils/prisma-mock.ts` | modify | add `branch.groupBy` mock |
| `apps/msd-api/src/services/catalog.service.ts` | modify | `listPublicLocations` returns avg lat/lng |
| `apps/msd-api/src/routes/catalog.routes.test.ts` | modify | locations test for new shape |
| `apps/msd/src/api/catalog.ts` | modify | `CatalogLocation` gains optional `latitude`/`longitude` |
| `apps/msd/src/location/geo.ts` | create | `parseGeoHeaders`, `nearestCity`, `haversineKm` (pure) |
| `apps/msd/src/location/geo.test.ts` | create | tests for the pure helpers |
| `apps/msd/api/geo.ts` | create | Vercel function using `parseGeoHeaders` |
| `apps/msd/src/catalog/catalog-shell.tsx` | create | `CatalogShellProvider`, `useCatalogShell`, `useCategoryLinks` |
| `apps/msd/src/catalog/catalog-shell.test.tsx` | create | provider tests |
| `apps/msd/src/location/location-context.tsx` | create | `LocationProvider`, `useLocation` |
| `apps/msd/src/location/location-context.test.tsx` | create | resolution-order tests |
| `apps/msd/src/hooks/useCurrentLocation.ts` | modify | thin wrapper over `useLocation()` |
| `apps/msd/src/hooks/use-cart-count.ts` | create | cart badge count (moved out of header) |
| `apps/msd/src/hooks/use-dismiss.ts` | create | Esc + outside-click close |
| `apps/msd/src/hooks/use-hide-on-scroll.ts` | create | scroll-direction flag for header row 2 |
| `apps/msd/src/app/components/shell/shell-labels.ts` | create | `countLabel()`, `useAccountLinks()` |
| `apps/msd/src/app/components/shell/shell-labels.test.ts` | create | tests |
| `apps/msd/src/content.json` | modify | new `header.*` and `tabBar.*` keys |
| `apps/msd/src/app/components/site-header/*` | create | header, category strip + mega panel, city chip, actions, CSS, tests |
| `apps/msd/src/app/components/mobile-tab-bar/*` | create | tab bar, category sheet, CSS, tests |
| `apps/msd/src/app/app.tsx` | modify | mount providers |
| `apps/msd/src/app/layouts/public-layout.tsx` | modify | new header, tab bar, `main#main-content` |
| `apps/msd/src/app/components/header-v2.tsx`, `header-v2.css`, `header.tsx`, `header.css` | delete | replaced |

---

### Task 1: msd-api `/catalog/locations` returns city coordinates

**Files:**
- Modify: `apps/msd-api/src/test-utils/prisma-mock.ts` (the `branch:` block near line 108)
- Modify: `apps/msd-api/src/services/catalog.service.ts:473-481`
- Test: `apps/msd-api/src/routes/catalog.routes.test.ts` (the `describe('GET /api/v1/catalog/locations'` block near line 409)
- Modify: `apps/msd/src/api/catalog.ts:37-42`

- [ ] **Step 1: Add `groupBy` to the branch mock**

In `apps/msd-api/src/test-utils/prisma-mock.ts`, change the `branch` block to:

```ts
    branch: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
```

- [ ] **Step 2: Replace the locations test with the new contract**

Replace the whole `describe('GET /api/v1/catalog/locations', ...)` block with:

```ts
describe('GET /api/v1/catalog/locations', () => {
  it('returns {state, city, latitude, longitude} per active city, averaging branch coordinates', async () => {
    prismaMock.branch.groupBy.mockResolvedValue([
      { state: 'Maharashtra', city: 'Pune', _avg: { latitude: '18.520400', longitude: '73.856700' } },
      { state: 'Uttar Pradesh', city: 'Gorakhpur', _avg: { latitude: null, longitude: null } },
    ]);
    const res = await request(app).get('/api/v1/catalog/locations');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { state: 'Maharashtra', city: 'Pune', latitude: 18.5204, longitude: 73.8567 },
      { state: 'Uttar Pradesh', city: 'Gorakhpur', latitude: null, longitude: null },
    ]);
    expect(prismaMock.branch.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['state', 'city'],
        where: expect.objectContaining({ isActive: true }),
        _avg: { latitude: true, longitude: true },
      }),
    );
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run apps/msd-api/src/routes/catalog.routes.test.ts -t "locations" --root apps/msd-api`
Expected: FAIL (`groupBy` never called; service still uses `findMany`).

- [ ] **Step 4: Implement**

Replace `listPublicLocations` in `apps/msd-api/src/services/catalog.service.ts` with:

```ts
/** Distinct active {state, city} pairs plus the average of that city's branch coordinates, so
 *  the storefront can map browser coordinates to the nearest city without a geocoding API.
 *  `latitude`/`longitude` are null when no branch in the city has coordinates. */
export async function listPublicLocations() {
  const rows = await prisma.branch.groupBy({
    by: ['state', 'city'],
    where: { isActive: true, state: { not: null }, city: { not: null } },
    _avg: { latitude: true, longitude: true },
    orderBy: [{ state: 'asc' }, { city: 'asc' }],
  });
  const toNumber = (v: unknown) => (v == null ? null : Number(v));
  return rows.map((r) => ({
    state: r.state as string,
    city: r.city as string,
    latitude: toNumber(r._avg.latitude),
    longitude: toNumber(r._avg.longitude),
  }));
}
```

- [ ] **Step 5: Run the test and the whole API suite**

Run: `npx vitest run apps/msd-api/src/routes/catalog.routes.test.ts --root apps/msd-api`
Expected: PASS.
Run: `npx nx run msd-api:test`
Expected: PASS (no other caller of `listPublicLocations`; confirm with `grep -rn "listPublicLocations" apps/msd-api/src` showing only the route and service).

- [ ] **Step 6: Update the frontend type**

In `apps/msd/src/api/catalog.ts` replace the `CatalogLocation` interface and its comment with:

```ts
/** `GET /catalog/locations`: distinct `{state, city}` pairs from active branches, plus the
 *  average branch coordinates for that city (null when no branch has coordinates). */
export interface CatalogLocation {
  state: string;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/msd-api/src/test-utils/prisma-mock.ts apps/msd-api/src/services/catalog.service.ts apps/msd-api/src/routes/catalog.routes.test.ts apps/msd/src/api/catalog.ts
git commit -m "feat(msd-api): return average city coordinates from /catalog/locations"
```

---

### Task 2: Pure geo helpers (header parsing, nearest city)

**Files:**
- Create: `apps/msd/src/location/geo.ts`
- Test: `apps/msd/src/location/geo.test.ts`

- [ ] **Step 1: Write the failing tests**

`apps/msd/src/location/geo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { haversineKm, nearestCity, parseGeoHeaders } from './geo';

describe('parseGeoHeaders', () => {
  it('reads and decodes the Vercel IP headers', () => {
    const headers = new Headers({
      'x-vercel-ip-city': 'Navi%20Mumbai',
      'x-vercel-ip-country-region': 'MH',
      'x-vercel-ip-latitude': '19.0330',
      'x-vercel-ip-longitude': '73.0297',
    });
    expect(parseGeoHeaders(headers)).toEqual({ city: 'Navi Mumbai', region: 'MH', latitude: 19.033, longitude: 73.0297 });
  });

  it('returns null without a city header', () => {
    expect(parseGeoHeaders(new Headers())).toBeNull();
  });

  it('keeps the city but drops non-numeric coordinates', () => {
    const headers = new Headers({ 'x-vercel-ip-city': 'Pune', 'x-vercel-ip-latitude': 'abc' });
    expect(parseGeoHeaders(headers)).toEqual({ city: 'Pune', region: null, latitude: null, longitude: null });
  });
});

describe('haversineKm', () => {
  it('measures Pune to Mumbai at roughly 120 km', () => {
    const km = haversineKm({ latitude: 18.5204, longitude: 73.8567 }, { latitude: 19.076, longitude: 72.8777 });
    expect(km).toBeGreaterThan(115);
    expect(km).toBeLessThan(125);
  });
});

describe('nearestCity', () => {
  const cities = [
    { state: 'Maharashtra', city: 'Pune', latitude: 18.5204, longitude: 73.8567 },
    { state: 'Maharashtra', city: 'Mumbai', latitude: 19.076, longitude: 72.8777 },
    { state: 'Delhi', city: 'Delhi', latitude: null, longitude: null },
  ];

  it('picks the closest city with coordinates', () => {
    expect(nearestCity({ latitude: 18.6, longitude: 73.8 }, cities)?.city).toBe('Pune');
  });

  it('returns null when no city has coordinates', () => {
    expect(nearestCity({ latitude: 18.6, longitude: 73.8 }, [cities[2]])).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run apps/msd/src/location/geo.test.ts --root apps/msd`
Expected: FAIL, module `./geo` not found.

- [ ] **Step 3: Implement**

`apps/msd/src/location/geo.ts`:

```ts
export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeoResult {
  city: string;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
}

const toNumber = (value: string | null): number | null => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Vercel adds these headers to every request (values are URI-encoded). */
export function parseGeoHeaders(headers: Headers): GeoResult | null {
  const rawCity = headers.get('x-vercel-ip-city');
  if (!rawCity) return null;
  return {
    city: decodeURIComponent(rawCity),
    region: headers.get('x-vercel-ip-country-region'),
    latitude: toNumber(headers.get('x-vercel-ip-latitude')),
    longitude: toNumber(headers.get('x-vercel-ip-longitude')),
  };
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Any city record with optional coordinates (structurally matches `CatalogLocation`). Kept
 *  local so this file has no app imports and can be bundled into the Vercel function. */
export interface CityPoint {
  city: string;
  latitude?: number | null;
  longitude?: number | null;
}

export function nearestCity<T extends CityPoint>(point: Coordinates, cities: T[]): T | null {
  let best: T | null = null;
  let bestKm = Infinity;
  for (const c of cities) {
    if (c.latitude == null || c.longitude == null) continue;
    const km = haversineKm(point, { latitude: c.latitude, longitude: c.longitude });
    if (km < bestKm) {
      best = c;
      bestKm = km;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run apps/msd/src/location/geo.test.ts --root apps/msd`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/msd/src/location/geo.ts apps/msd/src/location/geo.test.ts
git commit -m "feat(msd): add geo header parser and nearest-city helper"
```

---

### Task 3: Vercel IP-location function

**Files:**
- Create: `apps/msd/api/geo.ts`

The Vercel project root is `apps/msd`, so `apps/msd/api/*.ts` deploys as functions. `vercel.json` keeps its SPA rewrite; Vercel matches `/api/*` functions before rewrites.

- [ ] **Step 1: Create the function**

`apps/msd/api/geo.ts`:

```ts
import { parseGeoHeaders } from '../src/location/geo';

/** GET /api/geo: the visitor's approximate location from Vercel's IP headers, or null.
 *  No third-party service, no API key. Returns null outside Vercel (no headers). */
export function GET(request: Request): Response {
  return Response.json(parseGeoHeaders(request.headers), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
```

- [ ] **Step 2: Type-check it**

Run: `npx tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --lib es2022,dom apps/msd/api/geo.ts`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add apps/msd/api/geo.ts
git commit -m "feat(msd): add Vercel /api/geo IP location function"
```

---

### Task 4: `CatalogShellProvider`

**Files:**
- Create: `apps/msd/src/catalog/catalog-shell.tsx`
- Test: `apps/msd/src/catalog/catalog-shell.test.tsx`

- [ ] **Step 1: Write the failing tests**

`apps/msd/src/catalog/catalog-shell.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listCatalogCategoriesMock = vi.fn();
const listCatalogLocationsMock = vi.fn();

vi.mock('../api/catalog', async () => {
  const actual = await vi.importActual<typeof import('../api/catalog')>('../api/catalog');
  return {
    ...actual,
    listCatalogCategories: (...a: unknown[]) => listCatalogCategoriesMock(...a),
    listCatalogLocations: (...a: unknown[]) => listCatalogLocationsMock(...a),
  };
});

import { CatalogShellProvider, useCatalogShell, useCategoryLinks } from './catalog-shell';

function Probe() {
  const { status, locations } = useCatalogShell();
  const links = useCategoryLinks();
  return (
    <p>
      {status}|{links.map((l) => `${l.label}>${l.to}`).join(',')}|{locations.map((l) => l.city).join(',')}
    </p>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('CatalogShellProvider', () => {
  it('fetches categories and locations once and exposes category links', async () => {
    listCatalogCategoriesMock.mockResolvedValue({ data: [{ id: 'c1', name: 'Massage', slug: 'massage', description: null, children: [] }] });
    listCatalogLocationsMock.mockResolvedValue({ data: [{ state: 'Maharashtra', city: 'Pune' }] });
    render(<CatalogShellProvider><Probe /></CatalogShellProvider>);
    await waitFor(() => expect(screen.getByText('ready|Massage>/category/massage|Pune')).toBeTruthy());
    expect(listCatalogCategoriesMock).toHaveBeenCalledTimes(1);
    expect(listCatalogLocationsMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to content.json category links when categories fail', async () => {
    listCatalogCategoriesMock.mockRejectedValue(new Error('down'));
    listCatalogLocationsMock.mockResolvedValue({ data: [] });
    render(<CatalogShellProvider><Probe /></CatalogShellProvider>);
    await waitFor(() => expect(screen.getByText(/^error\|Massage>\/category\/massage,/)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run apps/msd/src/catalog/catalog-shell.test.tsx --root apps/msd`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`apps/msd/src/catalog/catalog-shell.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  listCatalogCategories,
  listCatalogLocations,
  type CatalogCategoryWithChildren,
  type CatalogLocation,
} from '../api/catalog';
import content from '../content.json';

export interface CatalogShellValue {
  status: 'loading' | 'ready' | 'error';
  categories: CatalogCategoryWithChildren[];
  locations: CatalogLocation[];
}

export interface CategoryLink {
  id: string;
  label: string;
  to: string;
}

const EMPTY: CatalogShellValue = { status: 'loading', categories: [], locations: [] };
const CatalogShellContext = createContext<CatalogShellValue>(EMPTY);

/** One fetch of categories + cities for the whole shell (header, tab bar, footer, home).
 *  The two requests settle independently so one failing never hides the other. */
export function CatalogShellProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<CatalogShellValue>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([listCatalogCategories(), listCatalogLocations()]).then(([cats, locs]) => {
      if (cancelled) return;
      setValue({
        status: cats.status === 'fulfilled' ? 'ready' : 'error',
        categories: cats.status === 'fulfilled' ? (cats.value.data ?? []) : [],
        locations: locs.status === 'fulfilled' ? (locs.value.data ?? []) : [],
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <CatalogShellContext.Provider value={value}>{children}</CatalogShellContext.Provider>;
}

export function useCatalogShell(): CatalogShellValue {
  return useContext(CatalogShellContext);
}

/** Top-level category links from the API, or the static `nav.categories` list when the API
 *  has nothing (loading, error, empty) so navigation never disappears. */
export function useCategoryLinks(): CategoryLink[] {
  const { categories } = useCatalogShell();
  return useMemo(
    () =>
      categories.length > 0
        ? categories.map((c) => ({ id: c.id, label: c.name, to: `/category/${c.slug}` }))
        : content.nav.categories.map((c) => ({ id: c.to, label: c.label, to: c.to })),
    [categories],
  );
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run apps/msd/src/catalog/catalog-shell.test.tsx --root apps/msd`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/msd/src/catalog
git commit -m "feat(msd): add shared catalog shell provider for categories and cities"
```

---

### Task 5: `LocationProvider`

**Files:**
- Create: `apps/msd/src/location/location-context.tsx`
- Test: `apps/msd/src/location/location-context.test.tsx`

- [ ] **Step 1: Write the failing tests**

`apps/msd/src/location/location-context.test.tsx`:

```tsx
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('../catalog/catalog-shell', () => ({
  useCatalogShell: () => ({
    status: 'ready',
    categories: [],
    locations: [{ state: 'Maharashtra', city: 'Pune', latitude: 18.52, longitude: 73.85 }],
  }),
}));

import { LocationProvider, useLocation } from './location-context';

function Probe() {
  const { status, source, city, setCity } = useLocation();
  return (
    <>
      <p data-testid="out">{`${status}|${source}|${city ?? '-'}`}</p>
      <button onClick={() => setCity({ state: 'Delhi', city: 'Delhi', latitude: 28.6, longitude: 77.2 })}>pick</button>
    </>
  );
}

const getCurrentPosition = vi.fn();
let permissionState: PermissionState = 'prompt';

beforeEach(() => {
  localStorage.clear();
  getCurrentPosition.mockReset();
  permissionState = 'prompt';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => null }));
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn(async () => ({ state: permissionState })) },
  });
});

afterEach(() => vi.unstubAllGlobals());

const out = () => screen.getByTestId('out').textContent;

describe('LocationProvider', () => {
  it('uses a saved city first, without touching geolocation or the network', async () => {
    localStorage.setItem('msd.location', JSON.stringify({ state: 'Maharashtra', city: 'Pune', latitude: 18.52, longitude: 73.85 }));
    render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('ready|saved|Pune'));
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads browser coordinates silently when permission is already granted, mapping to the nearest city', async () => {
    permissionState = 'granted';
    getCurrentPosition.mockImplementation((ok: PositionCallback) =>
      ok({ coords: { latitude: 18.6, longitude: 73.8 } } as GeolocationPosition),
    );
    render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('ready|browser|Pune'));
  });

  it('never prompts on load when permission is "prompt", and falls back to /api/geo', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ city: 'Nagpur', region: 'MH', latitude: 21.1, longitude: 79.1 }) } as Response);
    render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('ready|ip|Nagpur'));
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('/api/geo');
  });

  it('ends in "none" when the IP lookup has nothing', async () => {
    render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('none|none|-'));
  });

  it('setCity saves the choice', async () => {
    render(<LocationProvider><Probe /></LocationProvider>);
    await waitFor(() => expect(out()).toBe('none|none|-'));
    act(() => screen.getByText('pick').click());
    expect(out()).toBe('ready|saved|Delhi');
    expect(JSON.parse(localStorage.getItem('msd.location') ?? '{}').city).toBe('Delhi');
  });

  it('useLocation outside a provider returns a safe "none" value', () => {
    render(<Probe />);
    expect(out()).toBe('none|none|-');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run apps/msd/src/location/location-context.test.tsx --root apps/msd`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`apps/msd/src/location/location-context.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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

function readSaved(): CatalogLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CatalogLocation) : null;
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = readSaved();
      if (saved) {
        setResolved({ status: 'ready', source: 'saved', city: saved.city, coords: coordsOf(saved) });
        return;
      }
      if (await geolocationGranted()) {
        const coords = await readBrowserCoords();
        if (cancelled) return;
        if (coords) {
          setResolved({ status: 'ready', source: 'browser', city: null, coords });
          return;
        }
      }
      const ip = await fetchIpLocation();
      if (cancelled) return;
      setResolved(ip ? { status: 'ready', source: 'ip', city: ip.city, coords: coordsOf(ip) } : NONE);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setCity = useCallback((location: CatalogLocation) => {
    writeSaved(location);
    setResolved({ status: 'ready', source: 'saved', city: location.city, coords: coordsOf(location) });
  }, []);

  const requestBrowser = useCallback(async () => {
    setResolved((r) => ({ ...r, status: 'locating' }));
    const coords = await readBrowserCoords();
    if (coords) {
      writeSaved(null);
      setResolved({ status: 'ready', source: 'browser', city: null, coords });
    } else {
      setResolved((r) => ({ ...r, status: r.city || r.coords ? 'ready' : 'none' }));
    }
  }, []);

  const value = useMemo<LocationValue>(() => {
    const city = resolved.city ?? (resolved.coords ? (nearestCity(resolved.coords, locations)?.city ?? null) : null);
    return { ...resolved, city, setCity, requestBrowser };
  }, [resolved, locations, setCity, requestBrowser]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationValue {
  return useContext(LocationContext);
}
```

Note: this `useLocation` shadows React Router's hook of the same name only by name. Import it as `import { useLocation as useVisitorLocation } from '../location/location-context'` in any file that also uses the router's `useLocation`.

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run apps/msd/src/location/location-context.test.tsx --root apps/msd`
Expected: PASS (6 tests).

- [ ] **Step 5: Point the old hook at the provider**

Replace the whole of `apps/msd/src/hooks/useCurrentLocation.ts` with:

```ts
import { useLocation } from '../location/location-context';

/**
 * Compatibility wrapper for pages not yet migrated to `useLocation()` from
 * `location/location-context`. Same `{ location, coords }` shape as before, now fed by the one
 * shared lookup (saved, browser, IP, none) instead of a per-page geolocation + Google geocode call.
 */
export function useCurrentLocation() {
  const { city, coords } = useLocation();
  return { location: city, coords };
}
```

- [ ] **Step 6: Run the msd suite**

Run: `npx nx run msd:test`
Expected: same pass/fail set as before this plan (the 3 pre-existing failures in `app.spec.tsx` and `otp.test.tsx` stay; nothing new fails).

- [ ] **Step 7: Commit**

```bash
git add apps/msd/src/location apps/msd/src/hooks/useCurrentLocation.ts
git commit -m "feat(msd): add shared LocationProvider (saved, browser, IP, none)"
```

---

### Task 6: Mount providers; `main` landmark target

**Files:**
- Modify: `apps/msd/src/app/app.tsx`
- Modify: `apps/msd/src/app/layouts/public-layout.tsx`

- [ ] **Step 1: Wrap the app**

In `apps/msd/src/app/app.tsx` add imports:

```tsx
import { CatalogShellProvider } from '../catalog/catalog-shell';
import { LocationProvider } from '../location/location-context';
```

and change the returned tree to:

```tsx
    <AuthProvider appPrefix="msd" apiBaseUrl={import.meta.env.VITE_API_URL}>
      <CatalogShellProvider>
        <LocationProvider>
          <WishlistProvider>
            <ToastProvider>
              <ErrorBoundary>
                <AppRoutes />
              </ErrorBoundary>
            </ToastProvider>
          </WishlistProvider>
        </LocationProvider>
      </CatalogShellProvider>
    </AuthProvider>
```

Add one sentence to the doc comment: "`CatalogShellProvider` (categories + cities, fetched once) wraps `LocationProvider` because the location lookup maps coordinates to the nearest catalog city."

- [ ] **Step 2: Give `<main>` the skip-link target**

In `apps/msd/src/app/layouts/public-layout.tsx` change `<main className="app-main">` to:

```tsx
      <main id="main-content" className="app-main" tabIndex={-1}>
```

- [ ] **Step 3: Run the suite and build**

Run: `npx nx run msd:test` then `npx nx build msd`
Expected: tests as in Task 5 Step 6; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/msd/src/app/app.tsx apps/msd/src/app/layouts/public-layout.tsx
git commit -m "feat(msd): mount catalog shell and location providers; add main landmark id"
```

---

### Task 7: Shared shell helpers (cart count, dismiss, scroll, labels)

**Files:**
- Create: `apps/msd/src/hooks/use-cart-count.ts`
- Create: `apps/msd/src/hooks/use-dismiss.ts`
- Create: `apps/msd/src/hooks/use-hide-on-scroll.ts`
- Create: `apps/msd/src/app/components/shell/shell-labels.ts`
- Test: `apps/msd/src/app/components/shell/shell-labels.test.ts`
- Modify: `apps/msd/src/content.json` (`header` block, lines 14-37)

- [ ] **Step 1: Add the copy**

In `apps/msd/src/content.json`, replace the whole `"header": { ... }` object with:

```json
  "header": {
    "skipToContent": "Skip to main content",
    "closeNavigation": "Close navigation",
    "myAccount": "My Account",
    "signIn": "Sign in",
    "signOut": "Sign out",
    "orders": "Orders",
    "cart": "Cart",
    "wishlist": "Wishlist",
    "countLabel": "{label}, {count} items",
    "countLabelOne": "{label}, 1 item",
    "becomeMember": "Become a Member",
    "becomeMemberTo": "/member",
    "allCategories": "All categories",
    "categoriesNavLabel": "Categories",
    "accountMenuLabel": "Account menu",
    "profileMenu": {
      "profile": "My Profile",
      "orders": "Orders",
      "signOut": "Sign out"
    },
    "city": {
      "locating": "Locating…",
      "setLocation": "Set location",
      "changeLabel": "Change city",
      "dialogTitle": "Choose your city",
      "useCurrent": "Use my current location",
      "listLabel": "Cities with partner spas",
      "close": "Close"
    },
    "searchLabel": "Search spas, massages and treatments",
    "searchPlaceholder": "Search spas, massages, treatments",
    "searchAction": "Search"
  },
  "tabBar": {
    "label": "Primary",
    "home": "Home",
    "categories": "Categories",
    "wishlist": "Wishlist",
    "cart": "Cart",
    "account": "Account",
    "sheetTitle": "All categories",
    "viewAll": "All {category}"
  },
```

Then confirm no remaining code reads removed keys: `grep -rn "header\.\(openNavigation\|homeAriaLabel\|detectingLocation\|openMenu\|profile\b\|drawerLabel\)\|profileMenu\.bookings\|profileMenu\.wishlist" apps/msd/src`. Only `header-v2.tsx` should match (deleted in Task 10). If any other file matches, keep that key.

- [ ] **Step 2: Write the failing label test**

`apps/msd/src/app/components/shell/shell-labels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { countLabel } from './shell-labels';

describe('countLabel', () => {
  it('returns the bare label at zero', () => expect(countLabel('Cart', 0)).toBe('Cart'));
  it('uses the singular form at one', () => expect(countLabel('Cart', 1)).toBe('Cart, 1 item'));
  it('uses the plural form above one', () => expect(countLabel('Wishlist', 3)).toBe('Wishlist, 3 items'));
});
```

Run: `npx vitest run apps/msd/src/app/components/shell --root apps/msd`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the helpers**

`apps/msd/src/app/components/shell/shell-labels.ts`:

```ts
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { isCustomerUser, isStaffUser } from '../../../auth/role-routing';
import content from '../../../content.json';

/** Accessible name for a counted action ("Cart, 2 items"); the visible label stays a prefix
 *  so WCAG 2.5.3 label-in-name holds. */
export function countLabel(label: string, count: number): string {
  if (count <= 0) return label;
  const template = count === 1 ? content.header.countLabelOne : content.header.countLabel;
  return template.replace('{label}', label).replace('{count}', String(count));
}

/** Where "Account" goes for the current visitor. */
export function useAccountLinks() {
  const { isAuthenticated, bootstrap } = useAuth();
  const isCustomer = !!bootstrap && isCustomerUser(bootstrap) && !isStaffUser(bootstrap);
  return {
    isAuthenticated,
    isCustomer,
    accountPath: !isAuthenticated ? '/sign-in' : isCustomer ? '/my-account' : '/account',
  };
}
```

`apps/msd/src/hooks/use-cart-count.ts`:

```ts
import { useEffect, useState } from 'react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCart, subscribeCartUpdated } from '../api/cart';

/** Total item quantity in the signed-in customer's cart; refetches on every cart mutation. */
export function useCartCount(): number {
  const { isAuthenticated, token } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const load = () => {
      getCart(token)
        .then(({ data }) => {
          if (!cancelled) setCount(data.items.reduce((sum, item) => sum + item.quantity, 0));
        })
        .catch(() => {
          if (!cancelled) setCount(0);
        });
    };
    load();
    const unsubscribe = subscribeCartUpdated(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isAuthenticated, token]);

  return count;
}
```

`apps/msd/src/hooks/use-dismiss.ts`:

```ts
import { useEffect, type RefObject } from 'react';

/** While `active`, Escape or a pointer press outside `ref` calls `onDismiss`. */
export function useDismiss(
  active: boolean,
  ref: RefObject<HTMLElement | null>,
  onDismiss: (reason: 'escape' | 'outside') => void,
) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss('escape');
    };
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss('outside');
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [active, ref, onDismiss]);
}
```

`apps/msd/src/hooks/use-hide-on-scroll.ts`:

```ts
import { useEffect, useState } from 'react';

/** True while the page is scrolled past `threshold` px and the last scroll went down. */
export function useHideOnScroll(threshold = 64): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        setHidden(y > threshold && y > last);
        last = y;
        frame = 0;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return hidden;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run apps/msd/src/app/components/shell --root apps/msd`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/msd/src/hooks/use-cart-count.ts apps/msd/src/hooks/use-dismiss.ts apps/msd/src/hooks/use-hide-on-scroll.ts apps/msd/src/app/components/shell apps/msd/src/content.json
git commit -m "feat(msd): add shell helpers (cart count, dismiss, hide-on-scroll, count labels) and header copy"
```

---

### Task 8: `SiteHeader` (desktop two rows, phone header)

**Files:**
- Create: `apps/msd/src/app/components/site-header/category-strip.tsx`
- Create: `apps/msd/src/app/components/site-header/city-chip.tsx`
- Create: `apps/msd/src/app/components/site-header/header-actions.tsx`
- Create: `apps/msd/src/app/components/site-header/site-header.tsx`
- Create: `apps/msd/src/app/components/site-header/site-header.css`
- Test: `apps/msd/src/app/components/site-header/site-header.test.tsx`

- [ ] **Step 1: Write the failing tests**

`apps/msd/src/app/components/site-header/site-header.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ isAuthenticated: false, token: null, bootstrap: null, signOut: vi.fn() }),
}));
vi.mock('../../../wishlist/wishlist-context', () => ({ useWishlist: () => ({ ids: new Set(['a', 'b']) }) }));
vi.mock('../../../hooks/use-cart-count', () => ({ useCartCount: () => 1 }));
vi.mock('../../../catalog/catalog-shell', () => ({
  useCatalogShell: () => ({
    status: 'ready',
    locations: [{ state: 'Maharashtra', city: 'Pune' }],
    categories: [
      { id: 'c1', name: 'Massage', slug: 'massage', description: null, children: [{ id: 's1', name: 'Swedish', slug: 'swedish', description: null }] },
    ],
  }),
  useCategoryLinks: () => [{ id: 'c1', label: 'Massage', to: '/category/massage' }],
}));
vi.mock('../../../location/location-context', () => ({
  useLocation: () => ({ status: 'ready', source: 'ip', city: 'Pune', coords: null, setCity: vi.fn(), requestBrowser: vi.fn() }),
}));

import { SiteHeader } from './site-header';

const renderHeader = () => render(<MemoryRouter><SiteHeader /></MemoryRouter>);

describe('SiteHeader', () => {
  it('has a skip link to #main-content and a banner landmark', () => {
    renderHeader();
    expect(screen.getByText('Skip to main content').getAttribute('href')).toBe('#main-content');
    expect(screen.getByRole('banner')).toBeTruthy();
  });

  it('renders category links as plain links inside the categories nav', () => {
    renderHeader();
    const nav = screen.getByRole('navigation', { name: 'Categories' });
    expect(within(nav).getByRole('link', { name: 'Massage' }).getAttribute('href')).toBe('/category/massage');
  });

  it('toggles the mega panel as a disclosure and closes it with Escape, returning focus', () => {
    renderHeader();
    const button = screen.getByRole('button', { name: /All categories/ });
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    expect(within(panel).getByRole('link', { name: 'Swedish' }).getAttribute('href')).toBe('/category/massage?sub=swedish');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('names counted actions for screen readers', () => {
    renderHeader();
    expect(document.querySelector('[aria-label="Wishlist, 2 items"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Cart, 1 item"]')).toBeTruthy();
  });

  it('shows the resolved city in the city chip', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Change city: Pune' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run apps/msd/src/app/components/site-header --root apps/msd`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `category-strip.tsx`**

```tsx
import { useCallback, useId, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useCatalogShell, useCategoryLinks } from '../../../catalog/catalog-shell';
import { useDismiss } from '../../../hooks/use-dismiss';
import content from '../../../content.json';

const MAX_STRIP_LINKS = 8;

/** Row 2: plain category links plus an "All categories" disclosure panel. The panel links stay
 *  in the DOM (hidden) so prerendered HTML carries every category URL for crawlers. */
export function CategoryStrip() {
  const links = useCategoryLinks();
  const { categories } = useCatalogShell();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);
  const dismiss = useCallback((reason: 'escape' | 'outside') => {
    setOpen(false);
    if (reason === 'escape') buttonRef.current?.focus();
  }, []);
  useDismiss(open, rootRef, dismiss);

  return (
    <nav ref={rootRef} className="category-strip" aria-label={content.header.categoriesNavLabel}>
      <div className="category-strip__inner">
        <button
          ref={buttonRef}
          type="button"
          className="category-strip__all label-large"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon aria-hidden="true">menu</Icon>
          {content.header.allCategories}
          <Icon aria-hidden="true" className="category-strip__chevron">expand_more</Icon>
        </button>
        <ul className="category-strip__links">
          {links.slice(0, MAX_STRIP_LINKS).map((link) => (
            <li key={link.id}>
              <NavLink to={link.to} className="category-strip__link label-large">
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
      <div id={panelId} className="mega-panel" hidden={!open}>
        <div className="mega-panel__grid">
          {categories.map((cat) => (
            <div key={cat.id} className="mega-panel__group">
              <Link to={`/category/${cat.slug}`} className="mega-panel__heading title-small" onClick={close}>
                {cat.name}
              </Link>
              {cat.children.length > 0 && (
                <ul className="mega-panel__list">
                  {cat.children.map((sub) => (
                    <li key={sub.id}>
                      <Link to={`/category/${cat.slug}?sub=${sub.slug}`} className="mega-panel__link body-medium" onClick={close}>
                        {sub.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Implement `city-chip.tsx`**

```tsx
import { useState } from 'react';
import { Dialog, FilledTonalButton, Icon, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useCatalogShell } from '../../../catalog/catalog-shell';
import { useLocation as useVisitorLocation } from '../../../location/location-context';
import content from '../../../content.json';

const t = content.header.city;

/** Shows the visitor's city; opens a dialog to pick a city or use the browser location. */
export function CityChip() {
  const { status, city, setCity, requestBrowser } = useVisitorLocation();
  const { locations } = useCatalogShell();
  const [open, setOpen] = useState(false);
  const label = status === 'locating' ? t.locating : (city ?? t.setLocation);

  return (
    <>
      <button
        type="button"
        className="city-chip label-large"
        aria-haspopup="dialog"
        aria-label={`${t.changeLabel}: ${label}`}
        onClick={() => setOpen(true)}
      >
        <Icon aria-hidden="true">location_on</Icon>
        <span className="city-chip__text">{label}</span>
      </button>
      {open && (
        <Dialog open onClose={() => setOpen(false)}>
          <span slot="headline">{t.dialogTitle}</span>
          <div slot="content" className="city-dialog">
            <FilledTonalButton
              onClick={() => {
                requestBrowser();
                setOpen(false);
              }}
            >
              <Icon slot="icon" aria-hidden="true">my_location</Icon>
              {t.useCurrent}
            </FilledTonalButton>
            <ul className="city-dialog__list" aria-label={t.listLabel}>
              {locations.map((loc) => (
                <li key={`${loc.state}|${loc.city}`}>
                  <button
                    type="button"
                    className="city-dialog__option body-large"
                    aria-current={loc.city === city ? 'true' : undefined}
                    onClick={() => {
                      setCity(loc);
                      setOpen(false);
                    }}
                  >
                    {loc.city}
                    <span className="city-dialog__state body-small">{loc.state}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div slot="actions">
            <TextButton onClick={() => setOpen(false)}>{t.close}</TextButton>
          </div>
        </Dialog>
      )}
    </>
  );
}
```

- [ ] **Step 5: Implement `header-actions.tsx`**

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilledButton, FilledTonalIconButton, Icon, Menu, MenuItem } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { useCartCount } from '../../../hooks/use-cart-count';
import { countLabel, useAccountLinks } from '../shell/shell-labels';
import content from '../../../content.json';

const t = content.header;
const ACCOUNT_BUTTON_ID = 'site-header-account';

function CountedAction({ href, icon, label, count }: { href: string; icon: string; label: string; count: number }) {
  return (
    <span className="header-actions__counted">
      <FilledTonalIconButton href={href} aria-label={countLabel(label, count)}>
        <Icon>{icon}</Icon>
      </FilledTonalIconButton>
      {count > 0 && (
        <sky-badge size="small" className="header-actions__badge" aria-hidden="true">
          {count}
        </sky-badge>
      )}
    </span>
  );
}

/** Row 1 actions (desktop only; phones use MobileTabBar). */
export function HeaderActions() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { ids } = useWishlist();
  const cartCount = useCartCount();
  const { isAuthenticated, isCustomer, accountPath } = useAccountLinks();
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  return (
    <div className="header-actions">
      <Link to={t.becomeMemberTo} className="header-actions__member label-large">
        {t.becomeMember}
      </Link>
      <CountedAction href="/wishlist" icon="favorite_border" label={t.wishlist} count={ids?.size ?? 0} />
      <CountedAction href="/cart" icon="shopping_bag" label={t.cart} count={cartCount} />
      {isAuthenticated ? (
        <span className="header-actions__account">
          <FilledTonalIconButton
            id={ACCOUNT_BUTTON_ID}
            aria-label={t.accountMenuLabel}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Icon>person</Icon>
          </FilledTonalIconButton>
          <Menu open={menuOpen} anchor={ACCOUNT_BUTTON_ID} positioning="popover" onClosed={() => setMenuOpen(false)}>
            <MenuItem onClick={() => go(accountPath)}>
              <Icon slot="start" aria-hidden="true">person</Icon>
              <span slot="headline">{t.profileMenu.profile}</span>
            </MenuItem>
            {isCustomer && (
              <MenuItem onClick={() => go('/orders')}>
                <Icon slot="start" aria-hidden="true">receipt_long</Icon>
                <span slot="headline">{t.profileMenu.orders}</span>
              </MenuItem>
            )}
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                signOut();
              }}
            >
              <Icon slot="start" aria-hidden="true">logout</Icon>
              <span slot="headline">{t.profileMenu.signOut}</span>
            </MenuItem>
          </Menu>
        </span>
      ) : (
        <FilledButton href="/sign-in">{t.signIn}</FilledButton>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Implement `site-header.tsx`**

```tsx
import { Link, useNavigate } from 'react-router-dom';
import { useHideOnScroll } from '../../../hooks/use-hide-on-scroll';
import { CategoryStrip } from './category-strip';
import { CityChip } from './city-chip';
import { HeaderActions } from './header-actions';
import content from '../../../content.json';
import logo from '../../../assets/logo.jpg';
import './site-header.css';

/**
 * Site header. Desktop (>= 840px): row 1 brand, city, search, actions; row 2 category strip
 * that slides away on scroll down. Phones: brand + city, then full-width search; actions live
 * in MobileTabBar. Search submits to /explore, the search results route.
 */
export function SiteHeader() {
  const navigate = useNavigate();
  const compact = useHideOnScroll();

  const onSearch = (e: CustomEvent<{ value: string }>) => {
    const q = e.detail.value;
    navigate(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore');
  };

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
          <sky-action-field
            className="site-header__search"
            role="search"
            dense
            type="search"
            enterkeyhint="search"
            icon="search"
            label={content.header.searchLabel}
            placeholder={content.header.searchPlaceholder}
            actionLabel={content.header.searchAction}
            onsky-submit={onSearch}
          />
          <HeaderActions />
        </div>
        <CategoryStrip />
      </header>
    </>
  );
}
```

- [ ] **Step 7: Write `site-header.css`**

```css
/* Site header. Colours: app theme (--md-sys-color-*); shape/type/motion/elevation: shared-ui
   theme/base.css. 840px is the M3 "expanded" window-size class (media queries cannot read
   custom properties). */

.site-skip {
  position: absolute;
  inset-inline-start: 8px;
  inset-block-start: -100px;
  z-index: 100;
  padding: 12px 16px;
  border-radius: var(--md-sys-shape-corner-small);
  background-color: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
}
.site-skip:focus {
  inset-block-start: 8px;
}

.site-header {
  position: sticky;
  inset-block-start: 0;
  z-index: 50;
  background-color: var(--md-sys-color-surface);
  border-block-end: 1px solid var(--md-sys-color-outline-variant);
}

.site-header__top {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    'brand city'
    'search search';
  align-items: center;
  gap: 8px 12px;
  max-inline-size: 1280px;
  margin-inline: auto;
  padding: 8px 16px;
}
.site-header__brand {
  grid-area: brand;
  display: inline-flex;
  border-radius: var(--md-sys-shape-corner-small);
}
.site-header__logo {
  block-size: 40px;
  inline-size: auto;
}
.site-header__search {
  grid-area: search;
}
.city-chip {
  grid-area: city;
  justify-self: end;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-block-size: 48px;
  max-inline-size: 60vw;
  padding-inline: 12px 16px;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-full);
  background-color: transparent;
  color: var(--md-sys-color-on-surface);
  cursor: pointer;
  --md-icon-size: 20px;
}
.city-chip__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.city-chip:hover,
.category-strip__all:hover,
.category-strip__link:hover {
  background-color: color-mix(
    in srgb,
    var(--md-sys-color-on-surface) calc(var(--md-sys-state-hover-state-layer-opacity) * 100%),
    transparent
  );
}

.site-header :is(a, button):focus-visible,
.site-skip:focus-visible {
  outline: 3px solid var(--md-sys-color-primary);
  outline-offset: 2px;
}

.header-actions,
.category-strip {
  display: none;
}

.city-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.city-dialog__list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-block-size: 50vh;
  overflow-y: auto;
}
.city-dialog__option {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  inline-size: 100%;
  min-block-size: 48px;
  padding-inline: 12px;
  border: 0;
  border-radius: var(--md-sys-shape-corner-small);
  background: transparent;
  color: var(--md-sys-color-on-surface);
  cursor: pointer;
  text-align: start;
}
.city-dialog__option[aria-current='true'] {
  background-color: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
}
.city-dialog__state {
  color: var(--md-sys-color-on-surface-variant);
}

@media (min-width: 840px) {
  .site-header__top {
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    grid-template-areas: 'brand city search actions';
    gap: 16px;
    min-block-size: 64px;
    padding-block: 8px;
  }
  .site-header__logo {
    block-size: 48px;
  }
  .site-header__search {
    max-inline-size: 640px;
  }
  .header-actions {
    grid-area: actions;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .header-actions__member {
    padding: 12px;
    color: var(--md-sys-color-primary);
    text-decoration: none;
  }
  .header-actions__member:hover {
    text-decoration: underline;
  }
  .header-actions__counted {
    position: relative;
    display: inline-flex;
  }
  .header-actions__badge {
    position: absolute;
    inset-block-start: -2px;
    inset-inline-end: -2px;
    pointer-events: none;
  }

  .category-strip {
    display: block;
    border-block-start: 1px solid var(--md-sys-color-outline-variant);
    transition:
      margin-block-start var(--md-sys-motion-duration-medium1) var(--md-sys-motion-easing-standard),
      opacity var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .site-header--compact .category-strip:not(:focus-within) {
    margin-block-start: -45px;
    opacity: 0;
    pointer-events: none;
  }
  .category-strip__inner {
    display: flex;
    align-items: center;
    gap: 4px;
    max-inline-size: 1280px;
    min-block-size: 44px;
    margin-inline: auto;
    padding-inline: 8px 16px;
  }
  .category-strip__all,
  .category-strip__link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-block-size: 40px;
    padding-inline: 12px;
    border: 0;
    border-radius: var(--md-sys-shape-corner-full);
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    --md-icon-size: 20px;
  }
  .category-strip__all {
    color: var(--md-sys-color-primary);
  }
  .category-strip__all[aria-expanded='true'] .category-strip__chevron {
    transform: rotate(180deg);
  }
  .category-strip__chevron {
    transition: transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
  }
  .category-strip__link.active {
    color: var(--md-sys-color-on-secondary-container);
    background-color: var(--md-sys-color-secondary-container);
  }
  .category-strip__links {
    display: flex;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: hidden;
  }

  .mega-panel {
    position: absolute;
    inset-inline: 0;
    inset-block-start: 100%;
    max-block-size: 70vh;
    overflow-y: auto;
    background-color: var(--md-sys-color-surface-container-low);
    border-block-end: 1px solid var(--md-sys-color-outline-variant);
    box-shadow: var(--sky-elevation-2);
  }
  .mega-panel__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 24px;
    max-inline-size: 1280px;
    margin-inline: auto;
    padding: 24px 16px;
  }
  .mega-panel__heading {
    color: var(--md-sys-color-on-surface);
    text-decoration: none;
  }
  .mega-panel__list {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }
  .mega-panel__link {
    display: block;
    padding-block: 6px;
    color: var(--md-sys-color-on-surface-variant);
    text-decoration: none;
  }
  .mega-panel__heading:hover,
  .mega-panel__link:hover {
    color: var(--md-sys-color-primary);
    text-decoration: underline;
  }
}
```

The type classes (`label-large`, `title-small`, `body-medium`, `body-large`, `body-small`) used in the markup are app-global; add them in Step 8.

- [ ] **Step 8: Expose the shared type classes globally**

`typescale` classes exist only inside shadow roots today. Add the same classes for light DOM to `packages/shared-ui/src/theme/base.css`, after the `body { ... }` rule:

```css
/* M3 type roles as light-DOM utility classes (the same roles components use in shadow DOM). */
:where(.title-large, .title-medium, .title-small, .body-large, .body-medium, .body-small, .label-large, .label-medium, .label-small) {
  margin: 0;
}
.title-large { font: var(--md-sys-typescale-title-large-weight) var(--md-sys-typescale-title-large-size) / var(--md-sys-typescale-title-large-line-height) var(--md-sys-typescale-title-large-font); letter-spacing: var(--md-sys-typescale-title-large-tracking); }
.title-medium { font: var(--md-sys-typescale-title-medium-weight) var(--md-sys-typescale-title-medium-size) / var(--md-sys-typescale-title-medium-line-height) var(--md-sys-typescale-title-medium-font); letter-spacing: var(--md-sys-typescale-title-medium-tracking); }
.title-small { font: var(--md-sys-typescale-title-small-weight) var(--md-sys-typescale-title-small-size) / var(--md-sys-typescale-title-small-line-height) var(--md-sys-typescale-title-small-font); letter-spacing: var(--md-sys-typescale-title-small-tracking); }
.body-large { font: var(--md-sys-typescale-body-large-weight) var(--md-sys-typescale-body-large-size) / var(--md-sys-typescale-body-large-line-height) var(--md-sys-typescale-body-large-font); letter-spacing: var(--md-sys-typescale-body-large-tracking); }
.body-medium { font: var(--md-sys-typescale-body-medium-weight) var(--md-sys-typescale-body-medium-size) / var(--md-sys-typescale-body-medium-line-height) var(--md-sys-typescale-body-medium-font); letter-spacing: var(--md-sys-typescale-body-medium-tracking); }
.body-small { font: var(--md-sys-typescale-body-small-weight) var(--md-sys-typescale-body-small-size) / var(--md-sys-typescale-body-small-line-height) var(--md-sys-typescale-body-small-font); letter-spacing: var(--md-sys-typescale-body-small-tracking); }
.label-large { font: var(--md-sys-typescale-label-large-weight) var(--md-sys-typescale-label-large-size) / var(--md-sys-typescale-label-large-line-height) var(--md-sys-typescale-label-large-font); letter-spacing: var(--md-sys-typescale-label-large-tracking); }
.label-medium { font: var(--md-sys-typescale-label-medium-weight) var(--md-sys-typescale-label-medium-size) / var(--md-sys-typescale-label-medium-line-height) var(--md-sys-typescale-label-medium-font); letter-spacing: var(--md-sys-typescale-label-medium-tracking); }
.label-small { font: var(--md-sys-typescale-label-small-weight) var(--md-sys-typescale-label-small-size) / var(--md-sys-typescale-label-small-line-height) var(--md-sys-typescale-label-small-font); letter-spacing: var(--md-sys-typescale-label-small-tracking); }
```

Before adding, check for collisions: `grep -rn "class\(Name\)\?=\"[^\"]*\b\(title\|body\|label\)-\(large\|medium\|small\)\b" apps --include=*.tsx --include=*.html --include=*.ts`. Any existing use of these class names in apps now picks up the M3 role, which is the intent; report any hit that looks like a different meaning.

Also update `packages/shared-ui/src/components/shared-styles.ts` `typescale` doc comment to say the same classes exist globally in `theme/base.css` for light DOM.

- [ ] **Step 9: Run the tests**

Run: `npx vitest run apps/msd/src/app/components/site-header --root apps/msd`
Expected: PASS (5 tests). If the Escape test fails because `md-*` wrappers swallow focus in jsdom, the assertion targets the native `<button>`, so it must pass; debug `useDismiss` wiring rather than loosening the test.

- [ ] **Step 10: Commit**

```bash
git add apps/msd/src/app/components/site-header packages/shared-ui/src/theme/base.css packages/shared-ui/src/components/shared-styles.ts
git commit -m "feat(msd): add SiteHeader with category strip, mega panel and city chip"
```

---

### Task 9: `MobileTabBar` and category sheet

**Files:**
- Create: `apps/msd/src/app/components/mobile-tab-bar/category-sheet.tsx`
- Create: `apps/msd/src/app/components/mobile-tab-bar/mobile-tab-bar.tsx`
- Create: `apps/msd/src/app/components/mobile-tab-bar/mobile-tab-bar.css`
- Test: `apps/msd/src/app/components/mobile-tab-bar/mobile-tab-bar.test.tsx`

- [ ] **Step 1: Write the failing tests**

`apps/msd/src/app/components/mobile-tab-bar/mobile-tab-bar.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ isAuthenticated: false, token: null, bootstrap: null }),
}));
vi.mock('../../../wishlist/wishlist-context', () => ({ useWishlist: () => ({ ids: new Set(['a']) }) }));
vi.mock('../../../hooks/use-cart-count', () => ({ useCartCount: () => 0 }));
vi.mock('../../../catalog/catalog-shell', () => ({
  useCatalogShell: () => ({
    status: 'ready',
    locations: [],
    categories: [{ id: 'c1', name: 'Massage', slug: 'massage', description: null, children: [] }],
  }),
}));

import { MobileTabBar } from './mobile-tab-bar';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MobileTabBar />
    </MemoryRouter>,
  );

describe('MobileTabBar', () => {
  it('is a labelled nav with Home, Categories, Wishlist, Cart, Account', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Home' })).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Categories' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Wishlist, 1 item' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Cart' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Account' }).getAttribute('href')).toBe('/sign-in');
  });

  it('marks the current route with aria-current="page"', () => {
    renderAt('/cart');
    expect(screen.getByRole('link', { name: 'Cart' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBeNull();
  });

  it('opens the category sheet from the Categories button', () => {
    renderAt('/');
    const button = screen.getByRole('button', { name: 'Categories' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: 'All Massage' }).getAttribute('href')).toBe('/category/massage');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run apps/msd/src/app/components/mobile-tab-bar --root apps/msd`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `category-sheet.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { Dialog, IconButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useCatalogShell } from '../../../catalog/catalog-shell';
import content from '../../../content.json';

/** Full-screen category tree for phones. */
export function CategorySheet({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const { categories } = useCatalogShell();
  if (!open) return null;
  return (
    <Dialog id={id} open className="category-sheet" onClose={onClose}>
      <span slot="headline" className="category-sheet__headline">
        {content.tabBar.sheetTitle}
        <IconButton aria-label={content.header.closeNavigation} onClick={onClose}>
          <Icon>close</Icon>
        </IconButton>
      </span>
      <div slot="content">
        <sky-accordion single>
          {categories.map((cat) => (
            <sky-accordion-item key={cat.id} header={cat.name}>
              <ul className="category-sheet__list">
                <li>
                  <Link to={`/category/${cat.slug}`} className="category-sheet__link title-small" onClick={onClose}>
                    {content.tabBar.viewAll.replace('{category}', cat.name)}
                  </Link>
                </li>
                {cat.children.map((sub) => (
                  <li key={sub.id}>
                    <Link to={`/category/${cat.slug}?sub=${sub.slug}`} className="category-sheet__link body-large" onClick={onClose}>
                      {sub.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </sky-accordion-item>
          ))}
        </sky-accordion>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 4: Implement `mobile-tab-bar.tsx`**

```tsx
import { useId, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { useCartCount } from '../../../hooks/use-cart-count';
import { countLabel, useAccountLinks } from '../shell/shell-labels';
import { CategorySheet } from './category-sheet';
import content from '../../../content.json';
import './mobile-tab-bar.css';

const t = content.tabBar;

function TabIcon({ icon, count }: { icon: string; count?: number }) {
  return (
    <span className="tab-bar__icon">
      <Icon aria-hidden="true">{icon}</Icon>
      {!!count && (
        <sky-badge size="small" className="tab-bar__badge" aria-hidden="true">
          {count}
        </sky-badge>
      )}
    </span>
  );
}

function TabLink({ to, icon, label, count, end }: { to: string; icon: string; label: string; count?: number; end?: boolean }) {
  return (
    <li>
      <NavLink to={to} end={end} className="tab-bar__item" aria-label={count ? countLabel(label, count) : undefined}>
        <TabIcon icon={icon} count={count} />
        <span className="tab-bar__label label-medium">{label}</span>
      </NavLink>
    </li>
  );
}

/** Phone-only (< 840px) bottom navigation. */
export function MobileTabBar() {
  const { ids } = useWishlist();
  const cartCount = useCartCount();
  const { accountPath } = useAccountLinks();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetId = useId();

  return (
    <>
      <nav className="tab-bar" aria-label={t.label}>
        <ul className="tab-bar__list">
          <TabLink to="/" icon="home" label={t.home} end />
          <li>
            <button
              type="button"
              className="tab-bar__item"
              aria-expanded={sheetOpen}
              aria-controls={sheetId}
              onClick={() => setSheetOpen(true)}
            >
              <TabIcon icon="grid_view" />
              <span className="tab-bar__label label-medium">{t.categories}</span>
            </button>
          </li>
          <TabLink to="/wishlist" icon="favorite_border" label={t.wishlist} count={ids?.size ?? 0} />
          <TabLink to="/cart" icon="shopping_bag" label={t.cart} count={cartCount} />
          <TabLink to={accountPath} icon="person" label={t.account} />
        </ul>
      </nav>
      <CategorySheet id={sheetId} open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
```

- [ ] **Step 5: Write `mobile-tab-bar.css`**

```css
/* Phone bottom navigation; hidden from 840px (M3 expanded window class). */
.tab-bar {
  position: fixed;
  inset-inline: 0;
  inset-block-end: 0;
  z-index: 50;
  padding-block-end: env(safe-area-inset-bottom);
  background-color: var(--md-sys-color-surface-container);
  border-block-start: 1px solid var(--md-sys-color-outline-variant);
}
.tab-bar__list {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin: 0;
  padding: 0;
  list-style: none;
}
.tab-bar__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  inline-size: 100%;
  min-block-size: 64px;
  padding: 8px 4px;
  border: 0;
  background: transparent;
  color: var(--md-sys-color-on-surface-variant);
  text-decoration: none;
  cursor: pointer;
}
.tab-bar__icon {
  position: relative;
  display: grid;
  place-items: center;
  inline-size: 64px;
  block-size: 32px;
  border-radius: var(--md-sys-shape-corner-full);
  transition: background-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}
.tab-bar__item[aria-current='page'] {
  color: var(--md-sys-color-on-surface);
}
.tab-bar__item[aria-current='page'] .tab-bar__icon {
  background-color: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
}
.tab-bar__item:focus-visible {
  outline: 3px solid var(--md-sys-color-primary);
  outline-offset: -3px;
}
.tab-bar__badge {
  position: absolute;
  inset-block-start: -2px;
  inset-inline-end: 12px;
}

/* Keep page content clear of the fixed bar. */
.app-shell {
  padding-block-end: calc(64px + env(safe-area-inset-bottom));
}

.category-sheet {
  --md-dialog-container-shape: 0;
  max-inline-size: 100vw;
  max-block-size: 100dvh;
  inline-size: 100vw;
  block-size: 100dvh;
}
.category-sheet__headline {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.category-sheet__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.category-sheet__link {
  display: flex;
  align-items: center;
  min-block-size: 48px;
  color: var(--md-sys-color-on-surface);
  text-decoration: none;
}

@media (min-width: 840px) {
  .tab-bar {
    display: none;
  }
  .app-shell {
    padding-block-end: 0;
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run apps/msd/src/app/components/mobile-tab-bar --root apps/msd`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/msd/src/app/components/mobile-tab-bar
git commit -m "feat(msd): add phone bottom tab bar and category sheet"
```

---

### Task 10: Swap the shell in; delete the old header

**Files:**
- Modify: `apps/msd/src/app/layouts/public-layout.tsx`
- Delete: `apps/msd/src/app/components/header-v2.tsx`, `header-v2.css`, `header.tsx`, `header.css`

- [ ] **Step 1: Confirm nothing else imports the old headers**

Run: `grep -rn "header-v2\|components/header'\|from './header'\|HeaderV2\|HeaderV3" apps/msd/src`
Expected: only `public-layout.tsx` and the files being deleted. If anything else matches, switch it to `SiteHeader` in this task.

- [ ] **Step 2: Update the layout**

Replace `apps/msd/src/app/layouts/public-layout.tsx` with:

```tsx
import { Outlet } from 'react-router-dom';
import { SiteHeader } from '../components/site-header/site-header';
import { MobileTabBar } from '../components/mobile-tab-bar/mobile-tab-bar';
import { Footer } from '../components/footer';

/**
 * Public app shell: header, routed content, footer, and the phone tab bar. `main#main-content`
 * is the skip-link target. The footer is replaced in plan 2.
 */
export function PublicLayout() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      <MobileTabBar />
    </div>
  );
}
```

- [ ] **Step 3: Delete the old header files**

```bash
git rm apps/msd/src/app/components/header-v2.tsx apps/msd/src/app/components/header-v2.css apps/msd/src/app/components/header.tsx apps/msd/src/app/components/header.css
```

- [ ] **Step 4: Lint, test, build**

Run: `npx nx run-many -t lint test build --projects=msd,msd-api,shared-ui`
Expected: lint 0 errors; tests pass except the 3 pre-existing msd failures (`app.spec.tsx` title, 2 in `otp.test.tsx`); builds succeed. If `app.spec.tsx` now fails differently because of the header, fix that spec to query the new header.

- [ ] **Step 5: Hardcoded-value check**

Run: `grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(|[0-9]+ms\b" apps/msd/src/app/components/site-header/*.css apps/msd/src/app/components/mobile-tab-bar/*.css`
Expected: no output.

- [ ] **Step 6: Manual check in the browser**

Run: `npx nx serve msd` and open http://localhost:4200.
Check:
- Desktop (1280px): two rows; "All categories" opens and Esc closes the panel with focus back on the button; row 2 slides away on scroll down, returns on scroll up; Tab from the page top shows the skip link first.
- Phone (390px in devtools): logo + city chip, full-width search, tab bar at bottom, no content hidden behind it, Categories opens the full-screen sheet.
- City chip: dialog lists cities; picking one updates the chip and survives a reload.
- Dark mode: run `document.documentElement.className='dark'` in the console; nothing unreadable. Known issue: `assets/logo.jpg` has a white background; flag for a transparent logo asset.

- [ ] **Step 7: Commit**

```bash
git add apps/msd/src/app/layouts/public-layout.tsx
git commit -m "feat(msd): switch public layout to SiteHeader and MobileTabBar; remove old headers"
```

---

## Self-review notes

- Spec 5.1 to 5.3 and 6 are covered by Tasks 1 to 10. Spec 5.4 (footer), 7 (home), 8 (SEO/prerender) are plans 2 to 4.
- The Vercel function (Task 3) has no unit test of its own; its logic lives in `parseGeoHeaders`, which Task 2 tests.
- `useLocation` name clash with React Router is handled by aliasing on import (Task 5 note, used in Task 8 `city-chip.tsx`).
