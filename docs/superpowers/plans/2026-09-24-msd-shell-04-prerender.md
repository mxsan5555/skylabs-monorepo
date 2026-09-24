# msd Shell Plan 4 of 4: Build-time Prerender, sitemap, robots, llms.txt

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship real HTML for `/`, every `/category/:slug` and every deal-category `/category/:slug/:city`, embedding the page data so React hydrates instead of re-rendering, and generate `sitemap.xml`, `robots.txt` and `llms.txt`, all in the existing Vercel static build.

**Architecture:** First remove the known hydration hazards (listeners React 19 does not attach on hydrate, camelCase props that serialize as dead attributes, auth UI that differs between server and first client render). Then add a `PrerenderDataProvider` context: the server passes fetched data in, the client reads the same data from `<script id="__MSD_DATA__">`; data hooks start from it. A Node script builds an SSR bundle of `entry-server.tsx` with Vite, fetches data from `PRERENDER_API_URL`, renders each route with `renderToString` inside `StaticRouter`, moves React's hoisted head tags into `<head>`, and writes `dist/apps/msd/<route>/index.html`. `main.tsx` hydrates when the root was prerendered. The SPA rewrite keeps serving every other route.

**Tech Stack:** React 19 (`react-dom/server` `renderToString`, `hydrateRoot`), React Router 6.30 (`StaticRouter` from `react-router-dom/server`), Vite 8 programmatic `build()` with `ssr`, `tsx` to run the script, Lit elements under Node (Lit's node export uses `@lit-labs/ssr-dom-shim`), Vercel static hosting.

**Spec:** `docs/superpowers/specs/2026-09-22-msd-shell-home-design.md` section 8.1 and 8.4. Prerequisites from `TASK.md` "Plan 4 prerender prerequisites" (a) to (e).

**Rules for every task:** colours/type/shape/motion only tokens; copy in `apps/msd/src/content.json`; test files put all imports first, then `vi.mock` (`vi.hoisted` for referenced mocks); stage only the files a task names; check `git diff --cached --stat` before every commit; never `git stash`/`reset`/`checkout`; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Known pre-existing msd failures: `app.spec.tsx` showcase title, 2 in `otp.test.tsx` (flakes: vendor-user-picker, popular-tags).

**Decision on prerequisite (e):** the gift and member `sky-feature-card` copy stays in shadow DOM. It is promotional, not a search landing target; the crawlable content on home is the h1, tiles, deals JSON-LD, How it works, directory and FAQ. Record this in the spec in Task 7.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `apps/msd/src/hooks/use-custom-event.ts` (+ test) | create | attach custom-element events via ref (works after hydrate) |
| `site-header.tsx`, `newsletter-band.tsx`, `home-hero.tsx` | modify | use `useCustomEvent` for `sky-submit` |
| `apps/msd/src/app/components/sky-product-card-wc.tsx` | modify | string/boolean props as kebab-case attributes |
| `home-offers.tsx`, `home.tsx` | modify | kebab-case attributes on `sky-feature-card` / `sky-cta-banner`; light-DOM CTA link |
| `apps/msd/src/hooks/use-hydrated.ts` (+ test) | create | false on server and first client render |
| `header-actions.tsx`, `mobile-tab-bar.tsx`, `home-offers.tsx` | modify | gate auth-dependent UI on `useHydrated()` |
| `apps/msd/src/prerender-data/prerender-data.tsx` (+ test) | create | `PrerenderDataProvider`, `usePrerenderedData`, `readPrerenderPayload` |
| `apps/msd/src/prerender-data/loaders.ts` (+ test) | create | `loadShellData`, `loadHomeData`, `loadCategoryData` |
| `catalog-shell.tsx`, `home-data.ts`, `category.tsx` | modify | start from prerendered data |
| `apps/msd/src/main.tsx` | modify | hydrate when prerendered |
| `apps/msd/src/entry-server.tsx` | create | `render(url, payload)` |
| `apps/msd/prerender/*.ts` (+ tests) | create | build, render, head assembly, crawler files |
| `apps/msd/project.json`, `apps/msd/vercel.json`, `apps/msd/.env.example` | modify | `prerender` target, build command, env |

---

### Task 1: Custom-element events that survive hydration (prerequisite a)

React 19 does not attach `on<custom-event>` listeners to elements it hydrates. Attach them with a ref instead.

- [ ] **Step 1: Failing test** `apps/msd/src/hooks/use-custom-event.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { useCustomEvent } from './use-custom-event';

function Probe({ onSubmit }: { onSubmit: (e: CustomEvent<{ value: string }>) => void }) {
  const ref = useRef<HTMLElement>(null);
  useCustomEvent(ref, 'sky-submit', onSubmit);
  return <div ref={ref as React.RefObject<HTMLDivElement>} data-testid="host" />;
}

describe('useCustomEvent', () => {
  it('calls the latest handler and cleans up on unmount', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { getByTestId, rerender, unmount } = render(<Probe onSubmit={first} />);
    const host = getByTestId('host');
    host.dispatchEvent(new CustomEvent('sky-submit', { detail: { value: 'a' } }));
    rerender(<Probe onSubmit={second} />);
    host.dispatchEvent(new CustomEvent('sky-submit', { detail: { value: 'b' } }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second.mock.calls[0][0].detail.value).toBe('b');
    unmount();
    host.dispatchEvent(new CustomEvent('sky-submit', { detail: { value: 'c' } }));
    expect(second).toHaveBeenCalledTimes(1);
  });
});
```

Run `npx vitest run apps/msd/src/hooks/use-custom-event.test.tsx --root apps/msd` → FAIL.

- [ ] **Step 2: Implement** `apps/msd/src/hooks/use-custom-event.ts`:

```ts
import { useEffect, useRef, type RefObject } from 'react';

/**
 * Listens for a custom-element event through a ref. React 19 does not attach `on<event>`
 * props to custom elements it hydrates from prerendered HTML, so event handlers on
 * `sky-*` / `md-*` tags must be wired here instead. The latest handler is always used.
 */
export function useCustomEvent<D>(
  ref: RefObject<HTMLElement | null>,
  type: string,
  handler: (event: CustomEvent<D>) => void,
) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const listener = (event: Event) => latest.current(event as CustomEvent<D>);
    el.addEventListener(type, listener);
    return () => el.removeEventListener(type, listener);
  }, [ref, type]);
}
```

- [ ] **Step 3: Adopt it.** In `site-header.tsx`, `newsletter-band.tsx` and `home-hero.tsx`: add `const fieldRef = useRef<HTMLElement>(null)` (reuse the existing ref in `newsletter-band.tsx` if it already has one), put `ref={fieldRef}` on the `sky-action-field`, remove the `onsky-submit` prop, and call `useCustomEvent<{ value: string }>(fieldRef, 'sky-submit', handler)` with the same handler body. Existing tests that dispatch `sky-submit` on the element must still pass unchanged. `grep -rn "onsky-submit" apps/msd/src --include=*.tsx | grep -v test` → no output afterwards.

- [ ] **Step 4: Run.** `npx nx run msd:test` → known failures only. **Commit** (the hook, its test, the three components): "fix(msd): wire sky-submit through a ref so it survives hydration".

---

### Task 2: Attributes that serialize (prerequisite b and c)

Under `renderToString`, camelCase props on raw custom elements become lowercase attributes (`ctalabel`) that Lit ignores, and React never sets them during hydration. Use the kebab-case attributes Lit already maps.

- [ ] **Step 1: Failing tests.**
  - In the home tests: the partner `sky-cta-banner` has attributes `cta-label`, `cta-href`, `cta-icon`, `icon-style`, `icon-shape`; the gift `sky-feature-card` has `cta-label`, `cta-href`, `icon-style` (assert with `getAttribute`).
  - New `apps/msd/src/app/components/sky-product-card-wc.test.tsx`: rendering `<SkyProductCardWC imageAlt="x" eyebrowHref="/v" originalPrice="₹999" priceNote="60 min" pricePrefix="From" favoriteActive heading="H" />` produces a `sky-product-card` with attributes `image-alt="x"`, `eyebrow-href="/v"`, `original-price="₹999"`, `price-note="60 min"`, `price-prefix="From"`, `favorite-active=""`, and `heading="H"`; `favoriteActive={false}` → no `favorite-active` attribute. Read `sky-product-card-wc.tsx` first and assert only props it actually forwards.
  - `renderToString` check in the same test file: `renderToString(<SkyProductCardWC imageAlt="x" />)` contains `image-alt="x"` and not `imagealt`.

  Run → FAIL.

- [ ] **Step 2: Implement.**
  - `sky-product-card-wc.tsx`: map each string/number/boolean prop whose Lit property declares an `attribute:` name (see `packages/shared-ui/src/components/sky-product-card/sky-product-card.ts` `static properties`) to that kebab-case attribute; `true` → `''`, `false`/`undefined`/`null` → omitted. Arrays/objects (e.g. `gallery`) stay properties set in the existing effect. Keep the component's public props unchanged.
  - `home.tsx` partner banner and `home-offers.tsx` feature cards: use `icon-style`, `icon-shape`, `cta-label`, `cta-href`, `cta-icon` attributes. Add the attribute names to `apps/msd/src/types/sky-elements.d.ts` for `sky-feature-card` / `sky-cta-banner` if missing (keep existing camelCase typings).
  - Prerequisite (c): the welcome offer CTA becomes a light-DOM link: `<Link to="/explore" className="home-offer__cta label-large">{home.welcomeOffer.cta}</Link>`, styled in `home.css` as an M3 filled button (tokens only: `--md-sys-color-primary` / `on-primary`, `--md-sys-shape-corner-full`, 40px min height, 24px inline padding, hover state layer via `color-mix` with `--md-sys-state-hover-state-layer-opacity`, 3px primary focus ring). Update the CTA test to query the link by role and name.
  - Audit other raw custom-element usages in files rendered by `PublicLayout`, `Home` and `Category`: `grep -rnE "<sky-[a-z-]+[^>]*[a-z][A-Z][a-zA-Z]*=" apps/msd/src/app --include=*.tsx | grep -v test`; convert string/boolean camelCase props the same way; report anything else.

- [ ] **Step 3: Run.** `npx nx run msd:test` → known failures only; `npx nx build msd`. **Commit:** "fix(msd): kebab-case attributes on custom elements so props survive server rendering".

---

### Task 3: Hydration-safe auth UI

`AuthProvider` reads the token from `localStorage` in its initial state, so the first client render can be "signed in" while the server rendered "signed out". Auth-dependent UI must match the server on the first render.

- [ ] **Step 1: Failing test** `apps/msd/src/hooks/use-hydrated.test.tsx`: `renderToString` of a component showing `useHydrated() ? 'yes' : 'no'` contains `no`; `render()` in jsdom ends up showing `yes` after effects.

- [ ] **Step 2: Implement** `apps/msd/src/hooks/use-hydrated.ts`:

```ts
import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/** false during server rendering and hydration, true once the client has taken over. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
```

- [ ] **Step 3: Gate auth-dependent output.** Wherever `isAuthenticated` (or anything derived from the token/bootstrap) changes rendered markup in `PublicLayout`, `Home` or `Category`, use `const signedIn = useHydrated() && isAuthenticated;` for rendering decisions: `header-actions.tsx` (Sign in vs account menu), `shell-labels.ts` `useAccountLinks` (account path), `mobile-tab-bar.tsx` (Account target), `home-offers.tsx` (member banner), deal/product favourite `favoriteActive` in `home.tsx` and `category.tsx`. Event handlers may keep using `isAuthenticated`. Tests: a `renderToString` of `HeaderActions` with a signed-in auth mock renders the Sign in button (server view); the jsdom render shows the account menu.

- [ ] **Step 4: Run + commit** (hook, test, touched components/tests): "fix(msd): render auth-dependent UI after hydration so server and client markup match".

---

### Task 4: Prerender data plumbing

- [ ] **Step 1: Failing tests.**

`apps/msd/src/prerender-data/prerender-data.test.tsx`:
  - `readPrerenderPayload()` returns `{}` when `#__MSD_DATA__` is absent or invalid JSON, and the parsed object when present.
  - `usePrerenderedData('shell')` inside `<PrerenderDataProvider payload={{ shell: { a: 1 } }}>` returns `{ a: 1 }`; outside a provider returns `undefined`.

`apps/msd/src/prerender-data/loaders.test.ts` (mock `../api/catalog`):
  - `loadShellData()` returns `{ categories, locations, socialLinks }` from the three list calls; any failing call yields `[]` for that field.
  - `loadHomeData()` returns `{ deals, products, therapists, faqs }` using `HOME_DEALS_PAGE_SIZE`/`HOME_RAIL_SIZE` and no coordinates.
  - `loadCategoryData('massage', 'Pune')` returns `{ category, deals }` where deals were fetched with `{ categoryId, city: 'Pune', pageSize: 60 }` (and without `city` when not given); a 404 category returns `{ category: null, deals: [] }`.

Run → FAIL.

- [ ] **Step 2: Implement** `apps/msd/src/prerender-data/prerender-data.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from 'react';

/** Data the prerender embedded in the page, keyed by `shell`, `home`, `category:<slug>[:<city>]`. */
export type PrerenderPayload = Record<string, unknown>;

export const PRERENDER_SCRIPT_ID = '__MSD_DATA__';

const PrerenderDataContext = createContext<PrerenderPayload>({});

export function PrerenderDataProvider({ payload, children }: { payload: PrerenderPayload; children: ReactNode }) {
  return <PrerenderDataContext.Provider value={payload}>{children}</PrerenderDataContext.Provider>;
}

export function usePrerenderedData<T>(key: string): T | undefined {
  return useContext(PrerenderDataContext)[key] as T | undefined;
}

/** Client side: the JSON the prerender wrote into the page, or {} for SPA-only routes. */
export function readPrerenderPayload(): PrerenderPayload {
  try {
    const el = typeof document === 'undefined' ? null : document.getElementById(PRERENDER_SCRIPT_ID);
    return el?.textContent ? (JSON.parse(el.textContent) as PrerenderPayload) : {};
  } catch {
    return {};
  }
}

export const categoryDataKey = (slug: string, city?: string) => (city ? `category:${slug}:${city}` : `category:${slug}`);
```

`apps/msd/src/prerender-data/loaders.ts`: plain async functions (no React) that call the existing `api/catalog` functions with `Promise.allSettled` and return the shapes above, reusing `HOME_DEALS_PAGE_SIZE`/`HOME_RAIL_SIZE` from `home-data.ts` and the same deal query the category page uses. Export the payload types: `ShellData`, `HomeData`, `CategoryData`.

- [ ] **Step 3: Start from prerendered data.**
  - `catalog-shell.tsx`: `const initial = usePrerenderedData<ShellData>('shell')`; when present, initial state is `{ status: 'ready', locationsStatus: 'ready', ...initial }` and the fetch effect is skipped.
  - `home-data.ts` `useHomeCatalog`: `const initial = usePrerenderedData<HomeData>('home')`; when present, initial state is ready with that data and `hasLoadedRef` starts `true` (so the location-driven refetch keeps content on screen); FAQs start from `initial.faqs`.
  - `category.tsx`: `const initial = usePrerenderedData<CategoryData>(categoryDataKey(slug, cityParamCity))` where `cityParamCity` is the resolved city name when the route has a city; when present, `category`/`deals` state starts from it with `categoryLoading`/`dealsLoading` false, and the first fetch of each is skipped for that same slug/city.
  - Tests: each consumer renders its prerendered content on the first render without calling the list/get functions.

- [ ] **Step 4: Run + commit** (`apps/msd/src/prerender-data`, the three consumers and their tests): "feat(msd): prerender data context and loaders; shell, home and category start from it".

---

### Task 5: Client hydration entry and server entry

- [ ] **Step 1: `main.tsx`:**

```tsx
const container = document.getElementById('root') as HTMLElement;
const payload = readPrerenderPayload();
const app = (
  <StrictMode>
    <PrerenderDataProvider payload={payload}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PrerenderDataProvider>
  </StrictMode>
);
if (container.hasAttribute('data-prerendered')) ReactDOM.hydrateRoot(container, app);
else ReactDOM.createRoot(container).render(app);
```

(imports: `readPrerenderPayload`, `PrerenderDataProvider` from `./prerender-data/prerender-data`). Keep the existing style/theme imports and `initThemePreference()`.

- [ ] **Step 2: `apps/msd/src/entry-server.tsx`:**

```tsx
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import '@skylabs-monorepo/shared-ui';
import App from './app/app';
import { PrerenderDataProvider, type PrerenderPayload } from './prerender-data/prerender-data';

export { loadCategoryData, loadHomeData, loadShellData } from './prerender-data/loaders';

/** Server render of one route. Styles are not imported here: the client bundle's CSS
 *  links are already in index.html. */
export function render(url: string, payload: PrerenderPayload): string {
  return renderToString(
    <StrictMode>
      <PrerenderDataProvider payload={payload}>
        <StaticRouter location={url}>
          <App />
        </StaticRouter>
      </PrerenderDataProvider>
    </StrictMode>,
  );
}
```

- [ ] **Step 3: Smoke-render in a unit test** `apps/msd/src/entry-server.test.tsx` (vitest `// @vitest-environment node`, mock `./api/catalog` list calls to resolve empty): `render('/', { shell: {categories:[], locations:[], socialLinks:[]}, home: {deals:[], products:[], therapists:[], faqs:[]} })` returns a string containing `<h1` and `Spa, massage and beauty deals near you`, and does not throw. If a module touches `window`/`document` at import or render time under Node, fix it at the source with a `typeof window !== 'undefined'` guard (or move it into an effect) and list each fix in the report. Known candidate: `@skylabs-monorepo/shared-ui/carousel` (Swiper `register()`); guard it inside `packages/shared-ui/src/carousel.ts` with `if (typeof window !== 'undefined') register();`.

- [ ] **Step 4: Run + commit:** "feat(msd): hydrate prerendered pages and add the server render entry".

---

### Task 6: The prerender script and crawler files

**Files:** create `apps/msd/prerender/routes.ts`, `apps/msd/prerender/html.ts`, `apps/msd/prerender/crawler-files.ts`, `apps/msd/prerender/prerender.ts`, tests `apps/msd/prerender/*.test.ts`; modify `apps/msd/project.json`, `apps/msd/vercel.json`, `apps/msd/.env.example`, `apps/msd/vite.config.mts` (test `include` must cover `prerender/**/*.test.ts`).

- [ ] **Step 1: Failing tests** (pure functions only):
  - `routes.test.ts`: `buildRoutes(shell)` returns `/`, `/category/<slug>` for every category, and `/category/<slug>/<city-slug>` for every (category whose `type` is not PRODUCT/THERAPY) × (unique city slug) pair.
  - `html.test.ts`: `assembleHtml(template, { appHtml, payload })`:
    - puts `appHtml` inside `<div id="root" data-prerendered>`;
    - moves every `<title>…</title>`, `<meta …>` and `<link rel="canonical" …>` that appears in `appHtml` into `<head>` (before `</head>`), removing them from the body;
    - appends `<script type="application/json" id="__MSD_DATA__">…</script>` before `</body>` with `<` escaped as `<`;
    - leaves `application/ld+json` scripts in the body.
  - `crawler-files.test.ts`:
    - `robotsTxt(siteUrl)` allows all, disallows `/account`, `/my-account`, `/cart`, `/checkout`, `/orders`, `/sign-in`, `/otp`, `/wishlist`, `/choose-experience`, and ends with `Sitemap: <siteUrl>/sitemap.xml`;
    - `sitemapXml(siteUrl, paths, lastmod)` is a valid `urlset` with one `<url><loc>` per path (XML-escaped) and `<lastmod>`;
    - `llmsTxt(siteUrl, shell)` starts with `# MySpaDeal`, has a one-paragraph summary from `content.site`, a "## Categories" list of `[Name](<siteUrl>/category/<slug>)` lines and a "## Pages" list (home, explore, how it works, about, contact, become vendor).
  - Static public paths for the sitemap (in `routes.ts` as `STATIC_PUBLIC_PATHS`): `/`, `/explore`, `/categories`, `/products`, `/therapists`, `/blog`, `/about`, `/how-it-works`, `/contact`, `/careers`, `/become-vendor`, `/privacy`, `/terms`, `/accessibility`, `/cookies`.

  Run `npx vitest run apps/msd/prerender --root apps/msd` → FAIL.

- [ ] **Step 2: Implement the pure modules** to satisfy the tests (use `citySlug`, `categoryHref`, `cityHref` from `src/catalog/catalog-shell.tsx` and `content.json`; no network, no fs).

- [ ] **Step 3: Implement `prerender.ts`** (run with `tsx`):
  1. Read `PRERENDER_API_URL` (fallback `VITE_API_URL`) and `VITE_SITE_URL` from env (load `apps/msd/.env.local` via Vite's `loadEnv` when present).
  2. Build the server bundle with Vite's `build()`: `configFile: 'apps/msd/vite.config.mts'`, `build: { ssr: 'src/entry-server.tsx', outDir: '../../dist/apps/msd-ssr', emptyOutDir: true, rollupOptions: { output: { format: 'es' } } }`, `ssr: { noExternal: true }`, `mode: 'production'`. Import the built `entry-server.js` with `import(pathToFileURL(...).href)`.
  3. Set `globalThis.__MSD_API_URL__`-free: the loaders use the same `api` client as the app, which reads `import.meta.env.VITE_API_URL`; set `process.env.VITE_API_URL = PRERENDER_API_URL` before the SSR build so Vite inlines it.
  4. `loadShellData()`; on failure (API unreachable): log a warning, write crawler files from static paths only, and exit 0 without prerendering (the SPA still works).
  5. For each route from `buildRoutes(shell)`: build the payload (`shell` + `home` for `/`, or `shell` + `category:<slug>[:<city>]` via `loadCategoryData(slug, cityName)`), `render(route, payload)`, `assembleHtml(template, …)` with `dist/apps/msd/index.html` as template, write `dist/apps/msd/<route>/index.html` (`/` → overwrite `index.html` only after all others succeed; keep a copy of the untouched template as `dist/apps/msd/spa.html` for the SPA rewrite).
  6. Write `sitemap.xml` (static paths + all rendered routes, `lastmod` = today), `robots.txt`, `llms.txt` into `dist/apps/msd/`.
  7. Log `prerendered N routes` and exit non-zero only on an unexpected render exception (report which route).

- [ ] **Step 4: Wire the build.**
  - `apps/msd/project.json` `targets`: add `"prerender": { "executor": "nx:run-commands", "dependsOn": ["build"], "options": { "command": "npx tsx apps/msd/prerender/prerender.ts" } }`.
  - `apps/msd/vercel.json`: `buildCommand` → `cd ../.. && npx nx run msd:prerender`; rewrite destination → `/spa.html` (so SPA-only routes never receive the home page's prerendered HTML and data); keep the `/((?!api/).*)` source.
  - `apps/msd/.env.example`: add `PRERENDER_API_URL=` with a comment (the production msd-api `/api/v1` URL used at build time; if unreachable the build skips prerendering and still succeeds).

- [ ] **Step 5: Run it locally** against the dev API (msd-api on :3333): `PRERENDER_API_URL=http://localhost:3333/api/v1 VITE_SITE_URL=http://localhost:4300 npx nx run msd:prerender`. Check:
  - `dist/apps/msd/index.html` contains the hero `<h1`, category links (`href="/category/`), exactly one `<title>` inside `<head>`, `rel="canonical"`, the `__MSD_DATA__` script, `data-prerendered`.
  - `dist/apps/msd/category/massage/<city>/index.html` exists for a seeded city with its h1 "Massage in <City>".
  - `sitemap.xml`, `robots.txt`, `llms.txt`, `spa.html` exist.
  Paste the counts in the report.

- [ ] **Step 6: Commit** (`apps/msd/prerender`, `project.json`, `vercel.json`, `.env.example`, `vite.config.mts`, and any source guard fixes): "feat(msd): build-time prerender with sitemap, robots and llms.txt".

---

### Task 7: Hydration check, docs

- [ ] **Step 1 (controller):** serve the prerendered build: `npx vite preview --config apps/msd/vite.config.mts --port 4200` (msd-api allows only :4200). In the browser: `/` and one city page show content before JS (disable JS once to confirm); with JS, no hydration errors or warnings in the console; hero search submits to `/explore?q=`; header search and footer newsletter work; theme switch works; a signed-in session (set the token in localStorage) shows the account menu after load without errors.
- [ ] **Step 2:** Update the spec 8.1/8.4 with: routes prerendered, `spa.html` rewrite, payload keys, prerequisite decisions (a)-(e) including the shadow-DOM gift/member copy decision. Update TASK.md: mark plan 4 done; remove the resolved prerequisites; add "msd: set PRERENDER_API_URL and VITE_SITE_URL in Vercel (Production + Preview)", "msd: verify /api/geo and prerendered routes on the first Vercel preview".
- [ ] **Step 3: Commit:** "docs: record prerender decisions and plan 4 status".

---

## Self-review notes

- Spec 8.1 (prerender, hydrate, data payload, fallback on API failure, SPA rewrite kept) → Tasks 4-6; 8.4 (robots, sitemap, llms) → Task 6. TASK.md prerequisites (a) Task 1, (b) and (c) Task 2, (d) Task 4, (e) decision recorded in Task 7.
- Names across tasks: `useCustomEvent`, `useHydrated`, `PrerenderDataProvider`, `usePrerenderedData`, `readPrerenderPayload`, `PRERENDER_SCRIPT_ID`, `categoryDataKey`, `loadShellData`, `loadHomeData`, `loadCategoryData`, `ShellData`, `HomeData`, `CategoryData`, `render`, `buildRoutes`, `STATIC_PUBLIC_PATHS`, `assembleHtml`, `robotsTxt`, `sitemapXml`, `llmsTxt`: consistent.
- Risk: Material Web or another dependency touching `document` at import under Node. Task 5 Step 3 catches it with a Node-environment smoke test before the script exists.
