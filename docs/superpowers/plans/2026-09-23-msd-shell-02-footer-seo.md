# msd Shell Plan 2 of 4: Footer, Seo Component, JSON-LD, City Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace msd's footer with the approved design (trust strip, newsletter band, link columns, "{Category} in {City}" popular searches, legal bar with theme switch), add a reusable `Seo` component and JSON-LD builders, and make `/category/:slug/:city` a real page so popular-search links work.

**Architecture:** Social links join categories and cities in `CatalogShellProvider` (one fetch each, shared by footer and Organization JSON-LD). The footer is split into small parts under `app/components/site-footer/`. Link columns render as plain headed lists on wide screens and as disclosures below 840px, driven by a `useMediaQuery` hook whose server snapshot is "wide" so prerendered HTML (plan 4) shows every link. `Seo` relies on React 19 hoisting `<title>`, `<meta>` and `<link>` into `<head>`; JSON-LD is an inline `application/ld+json` script. A theme-preference module persists light, dark or system and keeps honouring the OS high-contrast setting (AAA).

**Tech Stack:** React 19, React Router 6.30, Vite 8, Vitest + Testing Library (jsdom), shared-ui (`sky-action-field`, Material Web wrappers), `applyTheme` / `applySystemTheme` / `prefersContrast` from `@skylabs-monorepo/shared-ui`.

**Spec:** `docs/superpowers/specs/2026-09-22-msd-shell-home-design.md` sections 5.4, 8.2, 8.3 (Organization, WebSite, BreadcrumbList), and the city route from 3/8.1.

**Rules for every task:** colours only `var(--md-sys-color-*)`; shape/type/motion/state/elevation only tokens from `packages/shared-ui/src/theme/base.css`; global M3 type classes (`title-small`, `body-medium`, `label-large`, ...) for text roles; every user-facing string in `apps/msd/src/content.json`; no em dashes in copy; test files put all imports first, then `vi.mock` (use `vi.hoisted` for mock fns a factory references); stage only the files a task names; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Known pre-existing msd test failures: `app.spec.tsx` showcase title and 2 in `otp.test.tsx` (plus occasional timing flakes in `vendor-user-picker`/`popular-tags`).

**Spec deviation (intentional):** spec 5.4 says phone columns use `sky-accordion`. That would render every link twice (desktop list + accordion) or hide headings inside shadow DOM. This plan uses one list per column with a native disclosure button below 840px instead. Record this in the spec in Task 8.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `apps/msd/src/catalog/catalog-shell.tsx` | modify | add `socialLinks`; `citySlug`, `cityHref` |
| `apps/msd/src/catalog/catalog-shell.test.tsx` | modify | tests for the above |
| `apps/msd/src/content.json` | modify | footer, theme, city page copy |
| `apps/msd/src/app/seo/site-url.ts` | create | `SITE_URL`, `absoluteUrl()` |
| `apps/msd/src/app/seo/jsonld.ts` | create | JSON-LD builders + safe serializer |
| `apps/msd/src/app/seo/json-ld.tsx` | create | `<JsonLd data>` script element |
| `apps/msd/src/app/seo/seo.tsx` | create | `<Seo>` head tags |
| `apps/msd/src/app/seo/site-json-ld.tsx` | create | Organization + WebSite for every public page |
| `apps/msd/src/app/seo/*.test.ts(x)` | create | tests |
| `apps/msd/.env.example` | modify | `VITE_SITE_URL` |
| `apps/msd/src/theme/theme-preference.ts` (+ test) | create | persisted light/dark/system |
| `apps/msd/src/main.tsx` | modify | apply saved theme on boot |
| `apps/msd/src/hooks/use-media-query.ts` (+ test) | create | SSR-safe media query hook |
| `apps/msd/src/app/components/site-footer/*` | create | footer parts, CSS, tests |
| `apps/msd/src/app/routes.tsx` | modify | `/category/:slug/:city` |
| `apps/msd/src/app/pages/category/category.tsx` (+ test) | modify | city filter, `Seo`, breadcrumb JSON-LD |
| `apps/msd/src/app/layouts/public-layout.tsx` | modify | `SiteFooter`, `SiteJsonLd` |
| `apps/msd/src/app/components/footer.tsx`, `footer.css`, `footer.test.tsx` | delete | replaced |

---

### Task 1: Social links, city slugs and city URLs in the catalog shell

**Files:** modify `apps/msd/src/catalog/catalog-shell.tsx`, `apps/msd/src/catalog/catalog-shell.test.tsx`.

- [ ] **Step 1: Failing tests.** Add to `catalog-shell.test.tsx` (extend the existing `vi.hoisted` mocks with `listCatalogSocialLinksMock`, mocked in the same `vi.mock('../api/catalog', ...)` factory; in `beforeEach` default it to `mockResolvedValue({ data: [] })`):

```tsx
describe('social links', () => {
  it('exposes social links and tolerates their failure', async () => {
    listCatalogCategoriesMock.mockResolvedValue({ data: [] });
    listCatalogLocationsMock.mockResolvedValue({ data: [] });
    listCatalogSocialLinksMock.mockResolvedValue({
      data: [{ id: 's1', platform: 'instagram', displayName: 'Instagram', url: 'https://instagram.com/x' }],
    });
    function SocialProbe() {
      const { socialLinks } = useCatalogShell();
      return <p>{socialLinks.map((s) => s.displayName).join(',') || '-'}</p>;
    }
    render(<CatalogShellProvider><SocialProbe /></CatalogShellProvider>);
    await waitFor(() => expect(screen.getByText('Instagram')).toBeTruthy());
    expect(listCatalogSocialLinksMock).toHaveBeenCalledTimes(1);
  });
});

describe('citySlug / cityHref', () => {
  it('slugifies city names', () => {
    expect(citySlug('Navi Mumbai')).toBe('navi-mumbai');
    expect(citySlug('  Pune ')).toBe('pune');
    expect(citySlug('Thiruvananthapuram (Trivandrum)')).toBe('thiruvananthapuram-trivandrum');
  });
  it('builds /category/<slug>/<city-slug>', () => {
    expect(cityHref('massage', 'Navi Mumbai')).toBe('/category/massage/navi-mumbai');
  });
});
```

Import `citySlug`, `cityHref` with the other imports at the top.

- [ ] **Step 2: Run, watch it fail.** `npx vitest run apps/msd/src/catalog --root apps/msd` → FAIL.

- [ ] **Step 3: Implement.** In `catalog-shell.tsx`:
  - import `listCatalogSocialLinks` and `type CatalogSocialMediaLink` from `../api/catalog`;
  - add `socialLinks: CatalogSocialMediaLink[];` to `CatalogShellValue` (doc: "fails silently to an empty array, like locations") and `socialLinks: []` to `EMPTY`;
  - fetch it in the same `Promise.allSettled([...])` as the third entry and set `socialLinks: social.status === 'fulfilled' ? (social.value.data ?? []) : []`;
  - add:

```ts
/** URL-safe city segment: "Navi Mumbai" -> "navi-mumbai". */
export function citySlug(city: string): string {
  return city
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** City landing page for a category: `/category/<slug>/<city-slug>`. */
export function cityHref(categorySlug: string, city: string): string {
  return `${categoryHref(categorySlug)}/${citySlug(city)}`;
}
```

Update the provider doc comment to say it also loads social links.

- [ ] **Step 4: Run, watch it pass.** Same command → PASS. Then `npx nx run msd:test` (known failures only). Any existing test mocking `../../../catalog/catalog-shell` with a literal object must still type-check; add `socialLinks: []` to those mock values where TypeScript or runtime needs it (`grep -rn "catalog/catalog-shell'" apps/msd/src --include=*.test.tsx`).

- [ ] **Step 5: Commit.** `git add apps/msd/src/catalog` (+ any test file you had to update) → "feat(msd): share social links and add city URL helpers in catalog shell".

---

### Task 2: Copy for footer, theme switch and city pages

**Files:** modify `apps/msd/src/content.json`.

- [ ] **Step 1: Replace `nav.footer`** with:

```json
    "footer": {
      "company": [
        { "label": "About Us", "to": "/about" },
        { "label": "How It Works", "to": "/how-it-works" },
        { "label": "Blog", "to": "/blog" },
        { "label": "Careers", "to": "/careers" },
        { "label": "Contact", "to": "/contact" }
      ],
      "discoverExtra": [
        { "label": "Therapists", "to": "/therapists" },
        { "label": "Hot Deals", "to": "/explore" }
      ],
      "help": [
        { "label": "Help Center", "to": "/help" },
        { "label": "Wishlist", "to": "/wishlist" },
        { "label": "Gifting", "to": "/gifting" }
      ],
      "partners": [
        { "label": "Partner with us", "to": "/become-vendor" },
        { "label": "Partner sign in", "to": "/sign-in" }
      ],
      "legal": [
        { "label": "Privacy Policy", "to": "/privacy" },
        { "label": "Terms of Service", "to": "/terms" },
        { "label": "Accessibility", "to": "/accessibility" },
        { "label": "Cookie Policy", "to": "/cookies" }
      ],
      "headings": {
        "company": "Company",
        "discover": "Discover",
        "help": "Help & Info",
        "partners": "Partners",
        "popularSearches": "Popular searches",
        "newsletter": "Get exclusive spa deals every week"
      },
      "newsletter": {
        "sub": "Weekly wellness deals and spa tips, delivered to your inbox.",
        "emailLabel": "Your email address",
        "submitLabel": "Subscribe",
        "successMessage": "You're subscribed! Check your inbox."
      },
      "trustLabel": "Why book with MySpaDeal",
      "trust": [
        { "icon": "verified", "text": "Verified spas and therapists" },
        { "icon": "lock", "text": "Secure payments via Razorpay" },
        { "icon": "bolt", "text": "Instant booking confirmation" }
      ],
      "popularSearchTemplate": "{category} in {city}",
      "legalLabel": "Legal",
      "socialLabel": "MySpaDeal on social media",
      "opensInNewTab": "{name} (opens in a new tab)",
      "copyright": "MySpaDeal Pvt. Ltd. All rights reserved.",
      "theme": {
        "legend": "Theme",
        "light": "Light",
        "dark": "Dark",
        "system": "System"
      }
    }
```

- [ ] **Step 2: Add to the `category` object:**

```json
    "cityTitleTemplate": "{category} in {city}",
    "cityMetaDescriptionTemplate": "Book {category} deals in {city} at verified spas. Instant confirmation and secure payment.",
```

- [ ] **Step 3: Validate.** `node -e "JSON.parse(require('fs').readFileSync('apps/msd/src/content.json','utf8'))"`. The old footer (`footer.tsx`) still reads `nav.footer.discover` until Task 8; run `grep -rn "footer.discover\b\|nav.footer.discover[^E]" apps/msd/src`. If only `footer.tsx` matches, leave it (it is deleted in Task 8); vite does not type-check JSON reads, and `npx nx run msd:test` must still pass (the old `footer.test.tsx` only checks social links).

- [ ] **Step 4: Commit.** `git add apps/msd/src/content.json` → "feat(msd): add footer, theme switch and city page copy".

---

### Task 3: `Seo`, `JsonLd`, JSON-LD builders, site URL

**Files:** create `apps/msd/src/app/seo/site-url.ts`, `jsonld.ts`, `json-ld.tsx`, `seo.tsx`, `jsonld.test.ts`, `seo.test.tsx`; modify `apps/msd/.env.example`.

- [ ] **Step 1: Failing tests.**

`apps/msd/src/app/seo/jsonld.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { breadcrumbJsonLd, organizationJsonLd, serializeJsonLd, websiteJsonLd } from './jsonld';

describe('jsonld builders', () => {
  it('builds Organization with optional logo and sameAs', () => {
    expect(organizationJsonLd({ name: 'MySpaDeal', url: 'https://x.in', logo: 'https://x.in/logo.png', sameAs: ['https://ig.com/x'] })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'MySpaDeal',
      url: 'https://x.in',
      logo: 'https://x.in/logo.png',
      sameAs: ['https://ig.com/x'],
    });
    const bare = organizationJsonLd({ name: 'MySpaDeal', url: 'https://x.in', sameAs: [] });
    expect(bare).not.toHaveProperty('sameAs');
    expect(bare).not.toHaveProperty('logo');
  });

  it('builds WebSite with a SearchAction to /explore?q=', () => {
    const site = websiteJsonLd({ name: 'MySpaDeal', url: 'https://x.in' });
    expect(site.potentialAction).toEqual({
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: 'https://x.in/explore?q={search_term_string}' },
      'query-input': 'required name=search_term_string',
    });
  });

  it('builds a BreadcrumbList with positions and absolute URLs', () => {
    const list = breadcrumbJsonLd('https://x.in', [
      { name: 'Home', path: '/' },
      { name: 'Massage', path: '/category/massage' },
    ]);
    expect(list.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://x.in/' },
      { '@type': 'ListItem', position: 2, name: 'Massage', item: 'https://x.in/category/massage' },
    ]);
  });

  it('serializes safely for an inline script', () => {
    expect(serializeJsonLd({ name: '</script><b>' })).not.toContain('</script>');
  });
});
```

`apps/msd/src/app/seo/seo.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Seo } from './seo';

vi.mock('./site-url', () => ({
  SITE_URL: 'https://www.myspadeal.in',
  absoluteUrl: (path: string) => new URL(path, 'https://www.myspadeal.in/').toString(),
}));

const q = (sel: string) => document.querySelector(sel);

describe('Seo', () => {
  it('emits title, description, canonical and Open Graph tags', () => {
    render(<Seo title="Massage in Pune | MSD" description="Book massage deals in Pune." path="/category/massage/pune" />);
    expect(document.title).toBe('Massage in Pune | MSD');
    expect(q('meta[name="description"]')?.getAttribute('content')).toBe('Book massage deals in Pune.');
    expect(q('link[rel="canonical"]')?.getAttribute('href')).toBe('https://www.myspadeal.in/category/massage/pune');
    expect(q('meta[property="og:title"]')?.getAttribute('content')).toBe('Massage in Pune | MSD');
    expect(q('meta[property="og:url"]')?.getAttribute('content')).toBe('https://www.myspadeal.in/category/massage/pune');
    expect(q('meta[name="robots"]')).toBeNull();
  });

  it('adds noindex and JSON-LD when asked', () => {
    render(<Seo title="t" description="d" path="/x" noindex jsonLd={{ '@type': 'Thing', name: 'x' }} />);
    expect(q('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    expect(JSON.parse(q('script[type="application/ld+json"]')?.textContent ?? '{}').name).toBe('x');
  });
});
```

Run: `npx vitest run apps/msd/src/app/seo --root apps/msd` → FAIL.

- [ ] **Step 2: Implement.**

`apps/msd/src/app/seo/site-url.ts`:

```ts
/** Public origin for canonical/OG/JSON-LD URLs, from `VITE_SITE_URL` (no trailing slash).
 *  Empty when unset (local dev); callers then omit absolute-URL tags instead of guessing. */
export const SITE_URL: string = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? '').replace(/\/+$/, '');

export function absoluteUrl(path: string): string | undefined {
  return SITE_URL ? new URL(path, `${SITE_URL}/`).toString() : undefined;
}
```

`apps/msd/src/app/seo/jsonld.ts`:

```ts
/** schema.org JSON-LD builders. Values always come from real data or content.json. */
export type JsonLdObject = Record<string, unknown>;

const CONTEXT = 'https://schema.org';

export function organizationJsonLd(input: { name: string; url: string; logo?: string; sameAs: string[] }): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'Organization',
    name: input.name,
    url: input.url,
    ...(input.logo ? { logo: input.logo } : {}),
    ...(input.sameAs.length > 0 ? { sameAs: input.sameAs } : {}),
  };
}

export function websiteJsonLd(input: { name: string; url: string }): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    name: input.name,
    url: input.url,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${input.url}/explore?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbJsonLd(siteUrl: string, items: { name: string; path: string }[]): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: new URL(item.path, `${siteUrl}/`).toString(),
    })),
  };
}

/** JSON for an inline <script>: escapes `<` so data can never close the script element. */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
```

`apps/msd/src/app/seo/json-ld.tsx`:

```tsx
import { serializeJsonLd, type JsonLdObject } from './jsonld';

/** Inline structured data. Content is serialized by `serializeJsonLd`, which escapes `<`. */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
```

`apps/msd/src/app/seo/seo.tsx`:

```tsx
import { JsonLd } from './json-ld';
import type { JsonLdObject } from './jsonld';
import { absoluteUrl } from './site-url';
import content from '../../content.json';

export interface SeoProps {
  title: string;
  description: string;
  /** Route path for canonical / og:url, e.g. "/category/massage". */
  path: string;
  /** Absolute image URL for social cards. */
  image?: string;
  noindex?: boolean;
  jsonLd?: JsonLdObject | JsonLdObject[];
}

/** Per-page head tags. React 19 hoists <title>, <meta> and <link> into <head>. */
export function Seo({ title, description, path, image, noindex, jsonLd }: SeoProps) {
  const url = absoluteUrl(path);
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      {url && <link rel="canonical" href={url} />}
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={content.site.fullName} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {url && <meta property="og:url" content={url} />}
      {image && <meta property="og:image" content={image} />}
      <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
      {jsonLd && <JsonLd data={jsonLd} />}
    </>
  );
}
```

`apps/msd/.env.example`: append

```
# Public site origin used for canonical URLs, Open Graph and JSON-LD (no trailing slash),
# e.g. https://www.myspadeal.in. Leave empty locally; absolute-URL tags are then omitted.
VITE_SITE_URL=
```

- [ ] **Step 3: Run, watch it pass.** `npx vitest run apps/msd/src/app/seo --root apps/msd` → PASS (6 tests). If jsdom does not hoist React 19 `<title>` into `document.head`, query `document` (as written) rather than `head`, and assert `document.title` only if jsdom supports it; do not weaken the other assertions.

- [ ] **Step 4: Commit.** `git add apps/msd/src/app/seo apps/msd/.env.example` → "feat(msd): add Seo component, JSON-LD builders and site URL config".

---

### Task 4: Theme preference (light, dark, system) with OS contrast

**Files:** create `apps/msd/src/theme/theme-preference.ts`, `apps/msd/src/theme/theme-preference.test.ts`; modify `apps/msd/src/main.tsx`.

- [ ] **Step 1: Failing test** `theme-preference.test.ts`:

```ts
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { initThemePreference, readThemePreference, setThemePreference } from './theme-preference';

const media = (active: string[]) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: active.includes(query),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  media([]);
});
afterEach(() => vi.unstubAllGlobals());

describe('theme preference', () => {
  it('defaults to light', () => {
    expect(readThemePreference()).toBe('light');
    initThemePreference();
    expect(document.documentElement.className).toBe('light');
  });

  it('persists and applies dark', () => {
    setThemePreference('dark');
    expect(localStorage.getItem('msd.theme')).toBe('dark');
    expect(document.documentElement.className).toBe('dark');
  });

  it('system follows the OS', () => {
    media(['(prefers-color-scheme: dark)']);
    setThemePreference('system');
    expect(document.documentElement.className).toBe('dark');
  });

  it('explicit modes still honour OS high contrast (AAA)', () => {
    media(['(prefers-contrast: more)']);
    setThemePreference('light');
    expect(document.documentElement.className).toBe('light-high-contrast');
  });

  it('ignores junk in storage', () => {
    localStorage.setItem('msd.theme', 'purple');
    expect(readThemePreference()).toBe('light');
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement** `apps/msd/src/theme/theme-preference.ts`:

```ts
import { applySystemTheme, applyTheme, prefersContrast } from '@skylabs-monorepo/shared-ui';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'msd.theme';
const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];
let stopSystemSync: (() => void) | null = null;

export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    return value && PREFERENCES.includes(value) ? value : 'light';
  } catch {
    return 'light';
  }
}

function apply(preference: ThemePreference) {
  stopSystemSync?.();
  stopSystemSync = null;
  if (preference === 'system') stopSystemSync = applySystemTheme();
  else applyTheme(preference, prefersContrast());
}

/** Apply and remember the visitor's choice. */
export function setThemePreference(preference: ThemePreference) {
  apply(preference);
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}

/** Apply the saved choice at startup (default light). */
export function initThemePreference() {
  apply(readThemePreference());
}
```

In `apps/msd/src/main.tsx` replace `import { applyTheme } from '@skylabs-monorepo/shared-ui';` with `import { initThemePreference } from './theme/theme-preference';` and `applyTheme('light');` with `initThemePreference();`. Update the comment above the imports: "initThemePreference applies the visitor's saved light/dark/system choice (default light) and honours OS high contrast."

- [ ] **Step 3: Run.** `npx vitest run apps/msd/src/theme --root apps/msd` → PASS (5). `npx nx build msd` → succeeds.

- [ ] **Step 4: Commit.** `git add apps/msd/src/theme apps/msd/src/main.tsx` → "feat(msd): persist light, dark or system theme with OS contrast".

---

### Task 5: `useMediaQuery`

**Files:** create `apps/msd/src/hooks/use-media-query.ts`, `apps/msd/src/hooks/use-media-query.test.tsx`.

- [ ] **Step 1: Failing test:**

```tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { useMediaQuery } from './use-media-query';

let listeners: (() => void)[] = [];
let matches = false;

function stubMedia() {
  listeners = [];
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, l: () => void) => listeners.push(l),
    removeEventListener: vi.fn(),
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('useMediaQuery', () => {
  it('reads the current match and updates on change', () => {
    matches = false;
    stubMedia();
    const { result } = renderHook(() => useMediaQuery('(min-width: 840px)'));
    expect(result.current).toBe(false);
    matches = true;
    act(() => listeners.forEach((l) => l()));
    expect(result.current).toBe(true);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement:**

```ts
import { useCallback, useSyncExternalStore } from 'react';

/** Live `matchMedia` result. `serverValue` is what prerendered HTML assumes (no window). */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
```

- [ ] **Step 3: Run → PASS. Commit.** `git add apps/msd/src/hooks/use-media-query.ts apps/msd/src/hooks/use-media-query.test.tsx` → "feat(msd): add SSR-safe useMediaQuery hook".

---

### Task 6: `SiteFooter`

**Files:** create in `apps/msd/src/app/components/site-footer/`: `social-icons.tsx`, `footer-column.tsx`, `newsletter-band.tsx`, `popular-searches.ts`, `theme-switch.tsx`, `site-footer.tsx`, `site-footer.css`, `popular-searches.test.ts`, `site-footer.test.tsx`.

- [ ] **Step 1: Move the social icons.** Create `social-icons.tsx` by moving `DEFAULT_SOCIAL_ICON` and `SOCIAL_ICONS` verbatim from `apps/msd/src/app/components/footer.tsx` (copy them; `footer.tsx` is deleted in Task 8), exported as:

```tsx
import type { ReactElement } from 'react';
// ...DEFAULT_SOCIAL_ICON and SOCIAL_ICONS copied verbatim (inline SVGs, aria-hidden, currentColor)...
export function socialIcon(platform: string): ReactElement {
  return SOCIAL_ICONS[platform.toLowerCase()] ?? DEFAULT_SOCIAL_ICON;
}
```

- [ ] **Step 2: Failing tests.**

`popular-searches.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPopularSearches } from './popular-searches';

const cats = [
  { id: 'c1', name: 'Massage', slug: 'massage', description: null, children: [] },
  { id: 'c2', name: 'Hair', slug: 'hair', description: null, children: [] },
];
const cities = [
  { state: 'Delhi', city: 'Delhi' },
  { state: 'Maharashtra', city: 'Pune' },
];

describe('buildPopularSearches', () => {
  it('pairs every category with every city as "{category} in {city}" links', () => {
    const out = buildPopularSearches(cats, cities, null);
    expect(out.map((s) => s.label)).toEqual(['Massage in Delhi', 'Hair in Delhi', 'Massage in Pune', 'Hair in Pune']);
    expect(out[2].to).toBe('/category/massage/pune');
  });

  it('puts the visitor city first', () => {
    expect(buildPopularSearches(cats, cities, 'Pune')[0].label).toBe('Massage in Pune');
  });

  it('caps the list', () => {
    expect(buildPopularSearches(cats, cities, null, 3)).toHaveLength(3);
  });
});
```

`site-footer.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { SiteFooter } from './site-footer';

const { wide, setThemePreferenceMock } = vi.hoisted(() => ({
  wide: { value: true },
  setThemePreferenceMock: vi.fn(),
}));

vi.mock('../../../hooks/use-media-query', () => ({ useMediaQuery: () => wide.value }));
vi.mock('../../../theme/theme-preference', () => ({
  readThemePreference: () => 'light',
  setThemePreference: (...a: unknown[]) => setThemePreferenceMock(...a),
}));
vi.mock('../../../location/location-context', () => ({
  useVisitorLocation: () => ({ city: 'Pune' }),
}));
vi.mock('../../../catalog/catalog-shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../catalog/catalog-shell')>()),
  useCatalogShell: () => ({
    status: 'ready',
    categories: [{ id: 'c1', name: 'Massage', slug: 'massage', description: null, children: [] }],
    locations: [
      { state: 'Delhi', city: 'Delhi' },
      { state: 'Maharashtra', city: 'Pune' },
    ],
    socialLinks: [{ id: 's1', platform: 'instagram', displayName: 'Instagram', url: 'https://instagram.com/x' }],
  }),
  useCategoryLinks: () => [{ id: 'c1', label: 'Massage', to: '/category/massage' }],
}));

const renderFooter = () => render(<MemoryRouter><SiteFooter /></MemoryRouter>);

beforeEach(() => {
  wide.value = true;
  setThemePreferenceMock.mockClear();
});

describe('SiteFooter', () => {
  it('is the contentinfo landmark with labelled link columns', () => {
    renderFooter();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    for (const name of ['Discover', 'Company', 'Help & Info', 'Partners', 'Popular searches', 'Legal']) {
      expect(screen.getByRole('navigation', { name })).toBeTruthy();
    }
    const discover = screen.getByRole('navigation', { name: 'Discover' });
    expect(within(discover).getByRole('link', { name: 'Massage' }).getAttribute('href')).toBe('/category/massage');
    expect(within(discover).getByRole('link', { name: 'Therapists' })).toBeTruthy();
  });

  it('lists popular searches with the visitor city first', () => {
    renderFooter();
    const links = within(screen.getByRole('navigation', { name: 'Popular searches' })).getAllByRole('link');
    expect(links[0].textContent).toBe('Massage in Pune');
    expect(links[0].getAttribute('href')).toBe('/category/massage/pune');
  });

  it('shows the three trust claims', () => {
    renderFooter();
    const trust = screen.getByRole('list', { name: 'Why book with MySpaDeal' });
    expect(within(trust).getAllByRole('listitem')).toHaveLength(3);
  });

  it('announces newsletter success in a live region', () => {
    renderFooter();
    const field = document.querySelector('sky-action-field') as HTMLElement;
    expect(field.getAttribute('type')).toBe('email');
    fireEvent(field, new CustomEvent('sky-submit', { detail: { value: 'a@b.in' } }));
    expect(screen.getByRole('status').textContent).toBe("You're subscribed! Check your inbox.");
  });

  it('names social links with a new-tab hint', () => {
    renderFooter();
    const link = screen.getByRole('link', { name: 'Instagram (opens in a new tab)' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('switches theme through radio buttons', () => {
    renderFooter();
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(setThemePreferenceMock).toHaveBeenCalledWith('dark');
  });

  it('collapses columns into disclosures on narrow screens', () => {
    wide.value = false;
    renderFooter();
    const toggle = screen.getByRole('button', { name: 'Company' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(list.getAttribute('data-collapsed')).toBe('true');
    expect(within(list).getByRole('link', { name: 'About Us', hidden: true })).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(list.hasAttribute('data-collapsed')).toBe(false);
  });
});
```

Run: `npx vitest run apps/msd/src/app/components/site-footer --root apps/msd` → FAIL.

- [ ] **Step 3: Implement `popular-searches.ts`:**

```ts
import { cityHref } from '../../../catalog/catalog-shell';
import type { CatalogCategoryWithChildren, CatalogLocation } from '../../../api/catalog';
import content from '../../../content.json';

export interface PopularSearch {
  id: string;
  label: string;
  to: string;
}

export const POPULAR_SEARCH_LIMIT = 40;

/** "{Category} in {City}" links for every city with partners; the visitor's city first. */
export function buildPopularSearches(
  categories: CatalogCategoryWithChildren[],
  locations: CatalogLocation[],
  visitorCity: string | null,
  limit = POPULAR_SEARCH_LIMIT,
): PopularSearch[] {
  const cities = [...locations].sort((a, b) => Number(b.city === visitorCity) - Number(a.city === visitorCity));
  const out: PopularSearch[] = [];
  for (const loc of cities) {
    for (const cat of categories) {
      if (out.length >= limit) return out;
      out.push({
        id: `${cat.id}|${loc.state}|${loc.city}`,
        label: content.nav.footer.popularSearchTemplate.replace('{category}', cat.name).replace('{city}', loc.city),
        to: cityHref(cat.slug, loc.city),
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Implement `footer-column.tsx`:**

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useMediaQuery } from '../../../hooks/use-media-query';

export const WIDE_QUERY = '(min-width: 840px)';

export interface FooterLink {
  id: string;
  label: string;
  to: string;
}

/** A headed link list. Wide screens: always open. Narrow screens: the heading becomes a
 *  disclosure button; links stay in the DOM (only hidden) so crawlers still see them. */
export function FooterColumn({ id, title, links, inline = false }: { id: string; title: string; links: FooterLink[]; inline?: boolean }) {
  const wide = useMediaQuery(WIDE_QUERY, true);
  const [open, setOpen] = useState(false);
  const headingId = `${id}-heading`;
  const listId = `${id}-list`;
  const collapsed = !wide && !open;

  return (
    <nav className={`footer-col${inline ? ' footer-col--inline' : ''}`} aria-labelledby={headingId}>
      <h2 id={headingId} className="footer-col__heading title-small">
        {wide ? (
          title
        ) : (
          <button type="button" className="footer-col__toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
            {title}
            <Icon aria-hidden="true" className="footer-col__chevron">expand_more</Icon>
          </button>
        )}
      </h2>
      <ul id={listId} className="footer-col__list" data-collapsed={collapsed ? 'true' : undefined}>
        {links.map((link) => (
          <li key={link.id}>
            <Link to={link.to} className="footer-col__link body-medium">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 5: Implement `newsletter-band.tsx`:**

```tsx
import { useState } from 'react';
import content from '../../../content.json';

const t = content.nav.footer;

/** Newsletter signup. UI only for now: no request is sent (TASK.md backlog tracks the backend).
 *  `sky-action-field` uses native email + required validation, so submit only fires when valid. */
export function NewsletterBand() {
  const [done, setDone] = useState(false);
  return (
    <section className="newsletter-band" aria-labelledby="newsletter-heading">
      <div className="newsletter-band__inner">
        <div className="newsletter-band__copy">
          <h2 id="newsletter-heading" className="title-large">{t.headings.newsletter}</h2>
          <p className="body-medium">{t.newsletter.sub}</p>
        </div>
        <div className="newsletter-band__form">
          {!done && (
            <sky-action-field
              type="email"
              name="email"
              autocomplete="email"
              required
              icon="mail"
              variant="outlined"
              label={t.newsletter.emailLabel}
              action-label={t.newsletter.submitLabel}
              onsky-submit={(e) => {
                if (e.detail.value) setDone(true);
              }}
            />
          )}
          <p role="status" className="newsletter-band__status body-large">
            {done ? t.newsletter.successMessage : ''}
          </p>
        </div>
      </div>
    </section>
  );
}
```

(`action-label` typing was added to `apps/msd/src/types/sky-elements.d.ts` in plan 1; confirm, add if missing.)

- [ ] **Step 6: Implement `theme-switch.tsx`:**

```tsx
import { useId, useState } from 'react';
import { readThemePreference, setThemePreference, type ThemePreference } from '../../../theme/theme-preference';
import content from '../../../content.json';

const t = content.nav.footer.theme;
const OPTIONS: ThemePreference[] = ['light', 'dark', 'system'];

/** Light / dark / system as a native radio group (keyboard arrows work for free). */
export function ThemeSwitch() {
  const name = useId();
  const [value, setValue] = useState<ThemePreference>(() => readThemePreference());
  return (
    <fieldset className="theme-switch">
      <legend className="label-large">{t.legend}</legend>
      {OPTIONS.map((option) => (
        <label key={option} className="theme-switch__option label-large">
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => {
              setValue(option);
              setThemePreference(option);
            }}
          />
          {t[option]}
        </label>
      ))}
    </fieldset>
  );
}
```

`readThemePreference` touches `localStorage` inside a `useState` initializer, which runs during render. It is try/catch guarded, but plan 4's server render has no `localStorage`; it throws a ReferenceError inside the try, which is caught and returns `'light'`. That is safe; keep it.

- [ ] **Step 7: Implement `site-footer.tsx`:**

```tsx
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useCatalogShell, useCategoryLinks } from '../../../catalog/catalog-shell';
import { useVisitorLocation } from '../../../location/location-context';
import { FooterColumn, type FooterLink } from './footer-column';
import { NewsletterBand } from './newsletter-band';
import { buildPopularSearches } from './popular-searches';
import { socialIcon } from './social-icons';
import { ThemeSwitch } from './theme-switch';
import content from '../../../content.json';
import logo from '../../../assets/logo.jpg';
import './site-footer.css';

const t = content.nav.footer;
const withIds = (links: { label: string; to: string }[]): FooterLink[] => links.map((l) => ({ id: l.to, ...l }));

/** Site footer: trust strip, newsletter band, brand + link columns, popular searches, legal bar. */
export function SiteFooter() {
  const { categories, locations, socialLinks } = useCatalogShell();
  const categoryLinks = useCategoryLinks();
  const { city } = useVisitorLocation();
  const popular = useMemo(() => buildPopularSearches(categories, locations, city), [categories, locations, city]);
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <ul className="trust-strip" aria-label={t.trustLabel}>
        {t.trust.map((item) => (
          <li key={item.text} className="trust-strip__item label-large">
            <Icon aria-hidden="true">{item.icon}</Icon>
            {item.text}
          </li>
        ))}
      </ul>

      <NewsletterBand />

      <div className="site-footer__main">
        <div className="site-footer__brand">
          <Link to="/" className="site-footer__logo">
            <img src={logo} alt={content.site.fullName} width={402} height={171} />
          </Link>
          <p className="title-small">{content.site.tagline}</p>
          <p className="body-medium site-footer__desc">{content.site.description}</p>
          {socialLinks.length > 0 && (
            <ul className="site-footer__social" aria-label={t.socialLabel}>
              {socialLinks.map((s) => (
                <li key={s.id}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="site-footer__social-link"
                    aria-label={t.opensInNewTab.replace('{name}', s.displayName)}
                  >
                    {socialIcon(s.platform)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <FooterColumn id="footer-discover" title={t.headings.discover} links={[...categoryLinks, ...withIds(t.discoverExtra)]} />
        <FooterColumn id="footer-company" title={t.headings.company} links={withIds(t.company)} />
        <FooterColumn id="footer-help" title={t.headings.help} links={withIds(t.help)} />
        <FooterColumn id="footer-partners" title={t.headings.partners} links={withIds(t.partners)} />
      </div>

      {popular.length > 0 && (
        <div className="site-footer__popular">
          <FooterColumn id="footer-popular" title={t.headings.popularSearches} links={popular} inline />
        </div>
      )}

      <div className="site-footer__legal">
        <p className="body-small">© {year} {t.copyright}</p>
        <nav aria-label={t.legalLabel}>
          <ul className="site-footer__legal-links">
            {t.legal.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="body-small">{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <ThemeSwitch />
      </div>
    </footer>
  );
}
```

`new Date().getFullYear()` differs between build time and a visit only across New Year; plan 4 treats the footer year as acceptable hydration drift (React patches text). Keep it.

- [ ] **Step 8: Write `site-footer.css`:**

```css
/* Site footer. Colours: app theme (--md-sys-color-*); shape/type/motion: shared-ui base.css.
   840px = M3 expanded window class. */
.site-footer {
  margin-block-start: auto;
  background-color: var(--md-sys-color-surface-container-low);
  color: var(--md-sys-color-on-surface);
  border-block-start: 1px solid var(--md-sys-color-outline-variant);
}
.site-footer :is(a, button, input):focus-visible {
  outline: 3px solid var(--md-sys-color-primary);
  outline-offset: 2px;
}

.trust-strip {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 32px;
  margin: 0;
  padding: 16px;
  list-style: none;
  background-color: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
}
.trust-strip__item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  --md-icon-size: 20px;
}

.newsletter-band {
  background-color: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
}
.newsletter-band__inner,
.site-footer__main,
.site-footer__popular,
.site-footer__legal {
  max-inline-size: 1280px;
  margin-inline: auto;
  padding-inline: 16px;
}
.newsletter-band__inner {
  display: grid;
  gap: 16px;
  padding-block: 24px;
}
.newsletter-band__copy {
  display: grid;
  gap: 4px;
}
.newsletter-band__status:empty {
  display: none;
}

.site-footer__main {
  display: grid;
  gap: 8px;
  padding-block: 32px 16px;
}
.site-footer__brand {
  display: grid;
  gap: 8px;
  padding-block-end: 16px;
}
.site-footer__logo {
  display: inline-flex;
  justify-self: start;
  border-radius: var(--md-sys-shape-corner-small);
}
.site-footer__logo img {
  block-size: 48px;
  inline-size: auto;
}
.site-footer__desc {
  color: var(--md-sys-color-on-surface-variant);
}
.site-footer__social {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.site-footer__social-link {
  display: inline-grid;
  place-items: center;
  inline-size: 48px;
  block-size: 48px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-full);
  color: var(--md-sys-color-on-surface);
}
.site-footer__social-link:hover {
  background-color: color-mix(
    in srgb,
    var(--md-sys-color-on-surface) calc(var(--md-sys-state-hover-state-layer-opacity) * 100%),
    transparent
  );
}

.footer-col {
  border-block-start: 1px solid var(--md-sys-color-outline-variant);
}
.footer-col__heading {
  margin: 0;
}
.footer-col__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  inline-size: 100%;
  min-block-size: 48px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.footer-col__chevron {
  transition: transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}
.footer-col__toggle[aria-expanded='true'] .footer-col__chevron {
  transform: rotate(180deg);
}
.footer-col__list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0 0 16px;
  list-style: none;
}
.footer-col__list[data-collapsed='true'] {
  display: none;
}
.footer-col__link {
  display: inline-flex;
  align-items: center;
  min-block-size: 40px;
  color: var(--md-sys-color-on-surface-variant);
  text-decoration: none;
}
.footer-col__link:hover {
  color: var(--md-sys-color-primary);
  text-decoration: underline;
}
.footer-col--inline .footer-col__list {
  display: flex;
  flex-wrap: wrap;
  gap: 0 16px;
}
.footer-col--inline .footer-col__list[data-collapsed='true'] {
  display: none;
}

.site-footer__legal {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  padding-block: 16px 24px;
  border-block-start: 1px solid var(--md-sys-color-outline-variant);
  color: var(--md-sys-color-on-surface-variant);
}
.site-footer__legal p {
  margin: 0;
}
.site-footer__legal-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.site-footer__legal-links a {
  display: inline-flex;
  align-items: center;
  min-block-size: 40px;
  color: inherit;
}

.theme-switch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  padding: 0;
  border: 0;
}
.theme-switch legend {
  float: inline-start;
  margin-inline-end: 8px;
  padding: 0;
}
.theme-switch__option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-block-size: 40px;
  padding-inline: 12px;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-full);
  cursor: pointer;
}
.theme-switch__option:has(input:checked) {
  background-color: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
  border-color: var(--md-sys-color-secondary-container);
}
.theme-switch__option:has(input:focus-visible) {
  outline: 3px solid var(--md-sys-color-primary);
  outline-offset: 2px;
}
.theme-switch__option input {
  accent-color: var(--md-sys-color-primary);
}

@media (min-width: 840px) {
  .newsletter-band__inner {
    grid-template-columns: 1fr minmax(0, 480px);
    align-items: center;
    gap: 32px;
  }
  .site-footer__main {
    grid-template-columns: 1.6fr repeat(4, 1fr);
    gap: 32px;
    padding-block: 48px 24px;
  }
  .footer-col {
    border-block-start: 0;
  }
  .footer-col__heading {
    margin-block-end: 8px;
  }
  .site-footer__popular .footer-col {
    padding-block: 16px;
    border-block-start: 1px solid var(--md-sys-color-outline-variant);
  }
}
```

- [ ] **Step 9: Run.** `npx vitest run apps/msd/src/app/components/site-footer --root apps/msd` → PASS (10). If `getByRole('list', { name })` does not see the `aria-label` on `<ul>`, keep the markup and query `document.querySelector('ul[aria-label="Why book with MySpaDeal"]')` instead. If jsdom reports `role="status"` more than once, scope the query to `.newsletter-band`.

- [ ] **Step 10: Checks.** `cd apps/msd && npx eslint src/app/components/site-footer` clean; `grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(|[0-9]+ms\b" apps/msd/src/app/components/site-footer/site-footer.css` → no output.

- [ ] **Step 11: Commit.** `git add apps/msd/src/app/components/site-footer` → "feat(msd): add SiteFooter with trust strip, newsletter, columns, popular searches and theme switch".

---

### Task 7: City landing route and category page `Seo`

**Files:** modify `apps/msd/src/app/routes.tsx`, `apps/msd/src/app/pages/category/category.tsx`, `apps/msd/src/app/pages/category/category.test.tsx`.

- [ ] **Step 1: Failing tests** in `category.test.tsx` (read the file first and reuse its render helper and mocks). Add a `vi.mock('../../../catalog/catalog-shell', async (importOriginal) => ({ ...(await importOriginal<...>()), useCatalogShell: () => shellState.value }))` with `shellState` from `vi.hoisted` defaulting to `{ status: 'ready', categories: [], socialLinks: [], locations: [{ state: 'Maharashtra', city: 'Pune' }] }`. Render with a route table containing both `/category/:slug` and `/category/:slug/:city` elements for `<Category />`. Tests:

```tsx
it('city route titles the page "{category} in {city}" and filters deals by that city', async () => {
  getCatalogCategoryMock.mockResolvedValue({ data: CATEGORY });
  listCatalogDealsMock.mockResolvedValue({ data: [] });
  renderAt('/category/massage/pune'); // use the file's existing render helper name/signature
  expect(await screen.findByRole('heading', { level: 1, name: 'Massage in Pune' })).toBeTruthy();
  await waitFor(() =>
    expect(listCatalogDealsMock).toHaveBeenCalledWith(expect.objectContaining({ city: 'Pune', state: 'Maharashtra' })),
  );
});

it('unknown city slug renders not found', async () => {
  getCatalogCategoryMock.mockResolvedValue({ data: CATEGORY });
  listCatalogDealsMock.mockResolvedValue({ data: [] });
  renderAt('/category/massage/atlantis');
  expect(await screen.findByText(content.category.notFound.heading)).toBeTruthy();
});

it('waits for cities before fetching city deals', async () => {
  shellState.value = { ...shellState.value, status: 'loading', locations: [] };
  getCatalogCategoryMock.mockResolvedValue({ data: CATEGORY });
  listCatalogDealsMock.mockResolvedValue({ data: [] });
  renderAt('/category/massage/pune');
  await screen.findByRole('heading', { level: 1, name: 'Massage' });
  expect(listCatalogDealsMock).not.toHaveBeenCalled();
});
```

(Import `content` from `../../../content.json` at the top if not already imported. Reset `shellState.value` in `beforeEach`. If the not-found card renders its heading inside `sky-info-card` shadow DOM, assert on the `<title>`/`Seo` output or the card's `heading` attribute instead.)

Run → FAIL.

- [ ] **Step 2: Route.** In `apps/msd/src/app/routes.tsx`, directly under `<Route path="/category/:slug" element={<Category />} />` add:

```tsx
        <Route path="/category/:slug/:city" element={<Category />} />
```

- [ ] **Step 3: Category page.** In `category.tsx`:
  - imports: `import { citySlug, cityHref, categoryHref, useCatalogShell } from '../../../catalog/catalog-shell';`, `import { Seo } from '../../seo/seo';`, `import { breadcrumbJsonLd } from '../../seo/jsonld';`, `import { SITE_URL } from '../../seo/site-url';`
  - read the param: `const { slug = '', city: citySlugParam } = useParams<{ slug: string; city?: string }>();`
  - resolve the city:

```tsx
  const { status: shellStatus, locations } = useCatalogShell();
  const cityLocation = citySlugParam ? locations.find((l) => citySlug(l.city) === citySlugParam) : undefined;
  // Locations arrive with the catalog shell; until then a city URL can't be resolved.
  const cityPending = !!citySlugParam && !cityLocation && shellStatus === 'loading';
  const cityMissing = !!citySlugParam && !cityLocation && !cityPending;
```

  - in the deals effect: `if (cityPending) return;` before `listCatalogDeals(...)`; pass `city: cityLocation?.city, state: cityLocation?.state`; add `cityPending, cityLocation?.city, cityLocation?.state` to the effect deps.
  - not-found branch: `if (categoryError || !category || cityMissing)`; replace its `<title>` with `<Seo title={content.category.notFound.metaTitle} description={content.category.notFound.subheading} path={categoryHref(slug)} noindex />`.
  - display name and head:

```tsx
  const displayName = cityLocation
    ? content.category.cityTitleTemplate.replace('{category}', category.name).replace('{city}', cityLocation.city)
    : category.name;
  const description = cityLocation
    ? content.category.cityMetaDescriptionTemplate.replace('{category}', category.name).replace('{city}', cityLocation.city)
    : (category.description ?? content.category.metaDescriptionTemplate.replace('{category}', category.name));
  const path = cityLocation ? cityHref(category.slug, cityLocation.city) : categoryHref(category.slug);
  const crumbs = [
    { name: content.category.breadcrumb.home, path: '/' },
    { name: content.category.breadcrumb.categories, path: '/categories' },
    { name: category.name, path: categoryHref(category.slug) },
    ...(cityLocation ? [{ name: cityLocation.city, path }] : []),
  ];
```

  - replace the page's `<title>` and `<meta name="description">` with `<Seo title={`${displayName}${content.category.metaTitleSuffix}`} description={description} path={path} jsonLd={SITE_URL ? breadcrumbJsonLd(SITE_URL, crumbs) : undefined} />`
  - `<Breadcrumb items>`: when `cityLocation`, make the category crumb a link (`to: categoryHref(category.slug)`) and add `{ label: cityLocation.city }` as the last item.
  - `<h1>`: `{displayName}`.
  Change nothing else in the page.

- [ ] **Step 4: Run.** `npx vitest run apps/msd/src/app/pages/category --root apps/msd` → PASS; `npx nx run msd:test` → known failures only.

- [ ] **Step 5: Commit.** `git add apps/msd/src/app/routes.tsx apps/msd/src/app/pages/category` → "feat(msd): add /category/:slug/:city landing pages with Seo and breadcrumb JSON-LD".

---

### Task 8: Swap the footer in; site-wide JSON-LD; clean up

**Files:** create `apps/msd/src/app/seo/site-json-ld.tsx` (+ test); modify `apps/msd/src/app/layouts/public-layout.tsx`, spec; delete `apps/msd/src/app/components/footer.tsx`, `footer.css`, `footer.test.tsx`.

- [ ] **Step 1: Failing test** `apps/msd/src/app/seo/site-json-ld.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SiteJsonLd } from './site-json-ld';

vi.mock('./site-url', () => ({ SITE_URL: 'https://www.myspadeal.in', absoluteUrl: (p: string) => `https://www.myspadeal.in${p}` }));
vi.mock('../../catalog/catalog-shell', () => ({
  useCatalogShell: () => ({ socialLinks: [{ id: 's1', platform: 'x', displayName: 'X', url: 'https://x.com/msd' }] }),
}));

describe('SiteJsonLd', () => {
  it('emits Organization (with sameAs) and WebSite', () => {
    render(<SiteJsonLd />);
    const data = JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent ?? '[]');
    expect(data.map((d: { '@type': string }) => d['@type'])).toEqual(['Organization', 'WebSite']);
    expect(data[0].sameAs).toEqual(['https://x.com/msd']);
  });
});
```

- [ ] **Step 2: Implement** `site-json-ld.tsx`:

```tsx
import { useCatalogShell } from '../../catalog/catalog-shell';
import { JsonLd } from './json-ld';
import { organizationJsonLd, websiteJsonLd } from './jsonld';
import { SITE_URL } from './site-url';
import content from '../../content.json';
import logo from '../../assets/logo.jpg';

/** Organization + WebSite structured data for every public page. Needs VITE_SITE_URL. */
export function SiteJsonLd() {
  const { socialLinks } = useCatalogShell();
  if (!SITE_URL) return null;
  const name = content.site.fullName;
  return (
    <JsonLd
      data={[
        organizationJsonLd({ name, url: SITE_URL, logo: new URL(logo, `${SITE_URL}/`).toString(), sameAs: socialLinks.map((s) => s.url) }),
        websiteJsonLd({ name, url: SITE_URL }),
      ]}
    />
  );
}
```

Run the test → PASS.

- [ ] **Step 3: Layout.** In `apps/msd/src/app/layouts/public-layout.tsx`: replace `import { Footer } from '../components/footer';` with `import { SiteFooter } from '../components/site-footer/site-footer';` and `import { SiteJsonLd } from '../seo/site-json-ld';`; render `<SiteFooter />` in place of `<Footer />`, and `<SiteJsonLd />` as the first child of the `app-shell` div. Update the doc comment ("The footer is replaced in plan 2" → "Organization/WebSite JSON-LD is emitted once here").

- [ ] **Step 4: Delete the old footer.** Confirm `grep -rn "components/footer'\|from './footer'\|site-footer__social-loading" apps/msd/src` only hits the files being deleted, then `git rm apps/msd/src/app/components/footer.tsx apps/msd/src/app/components/footer.css apps/msd/src/app/components/footer.test.tsx`. Check the old footer's social-link test cases are covered by `site-footer.test.tsx` (one link per row, platform icon fallback); add a test for the unknown-platform fallback icon if missing.

- [ ] **Step 5: Spec note.** In `docs/superpowers/specs/2026-09-22-msd-shell-home-design.md` section 5.4, replace the `sky-accordion` sentence with: "Phone: link columns collapse into native disclosure buttons (one list per column, links stay in the DOM); `sky-accordion` is not used here to avoid rendering links twice." Also note under 5.4 item 5: "theme choice persists as `msd.theme` (default light) and still honours OS high contrast."

- [ ] **Step 6: Verify.**
  - `npx nx run-many -t test build --projects=msd,msd-api,shared-ui` → known failures only.
  - `cd apps/msd && npx eslint src/app/components/site-footer src/app/seo src/theme src/hooks src/app/layouts src/catalog` → clean; eslint on `src/app/pages/category/category.tsx` adds no new errors (1 pre-existing `no-empty-function` at the `onFavorite` prop).
  - `npx tsc -p apps/msd/tsconfig.app.json --noEmit` → still 28 pre-existing errors, none in touched files.
  - Manual (controller): serve msd; desktop 1280px and phone widths: trust strip, newsletter success message, columns open on desktop and collapse on phone, popular searches link to working `/category/<slug>/<city>` pages with the city heading, theme switch changes and persists across reload, no horizontal scroll.

- [ ] **Step 7: TASK.md.** Mark "msd shell plan 2: SiteFooter, Seo component, JSON-LD, city landing pages" done. Add to follow-ups: "msd: set VITE_SITE_URL in Vercel (Production + Preview) so canonical/OG/JSON-LD emit absolute URLs", "msd: audit app-level CSS in dark theme now that the footer theme switch exposes it".

- [ ] **Step 8: Commits.** (a) `git add apps/msd/src/app/seo/site-json-ld.tsx apps/msd/src/app/seo/site-json-ld.test.tsx apps/msd/src/app/layouts/public-layout.tsx` + the `git rm`s (+ any footer test additions) → "feat(msd): switch to SiteFooter and emit site-wide JSON-LD; remove old footer". (b) `git add docs/superpowers/specs/2026-09-22-msd-shell-home-design.md TASK.md` → "docs: record footer deviations and plan 2 status".

---

## Self-review notes

- Spec 5.4 items 1 to 5 → Task 6 (+ Task 4 theme, Task 1 social links). Spec 8.2 → Task 3. Spec 8.3 Organization/WebSite → Task 8, BreadcrumbList → Task 7. City route (spec 3, 8.1) → Task 7. Home JSON-LD (ItemList, FAQPage) and removing home's hand-written `<title>` are plan 3; sitemap/robots/llms and prerender are plan 4.
- Type names used across tasks: `socialLinks`, `citySlug`, `cityHref`, `categoryHref`, `useVisitorLocation().city`, `buildPopularSearches`, `FooterColumn`, `WIDE_QUERY`, `readThemePreference`, `setThemePreference`, `initThemePreference`, `Seo`, `JsonLd`, `SiteJsonLd`, `SITE_URL`, `absoluteUrl`, `organizationJsonLd`, `websiteJsonLd`, `breadcrumbJsonLd`, `serializeJsonLd`: consistent.
- Brand contact details (phone, email) from spec 5.4 are not in `content.json` yet; the brand block ships without them until the owner supplies real values.
