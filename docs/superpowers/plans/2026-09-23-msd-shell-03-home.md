# msd Shell Plan 3 of 4: Home Page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the msd home page as the approved 10 fixed sections (hero, category tiles, one "Deals near you" carousel with category tabs, How it works, therapists, offers, products, treatment directory, FAQ with FAQPage JSON-LD, partner banner), token-only styles, one data fetch that waits for the visitor location, and `Seo` + JSON-LD.

**Architecture:** `home.tsx` becomes a thin composition. Data lives in `home-data.ts` (`useHomeCatalog` + card adapters); each section is its own small component in `app/pages/home/`. The carousel header (heading, See all, prev/next) becomes a reusable `CardRail` in `app/components/card-rail/` for later pages. Categories come from the shared `CatalogShellProvider` (no second fetch). Category tiles slot a light-DOM `<h3><a>` into `sky-tile-card` (new `headline` slot) so crawlers see real links and headings.

**Tech Stack:** React 19, React Router 6.30, Vite 8, Vitest + Testing Library (jsdom), shared-ui (`sky-tile-card`, `sky-feature-card`, `sky-cta-banner`, `sky-action-field`, `sky-accordion`, Material wrappers), Swiper Element via `@skylabs-monorepo/shared-ui/carousel`.

**Spec:** `docs/superpowers/specs/2026-09-22-msd-shell-home-design.md` section 7, 8.3 (home JSON-LD). Prerender (`prerenderData`) is plan 4.

**Rules for every task:** colours only `var(--md-sys-color-*)`; shape/type/motion/state/elevation only tokens from `packages/shared-ui/src/theme/base.css`; global M3 type classes for text roles; every user-facing string in `apps/msd/src/content.json`; no em dashes in copy; test files put all imports first, then `vi.mock` (`vi.hoisted` for mock fns/state a factory references); stage only the files a task names; never `git stash`/`reset`/`checkout` other files; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Known pre-existing msd failures: `app.spec.tsx` showcase title, 2 in `otp.test.tsx` (occasional flakes: `vendor-user-picker`, `popular-tags`).

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `packages/shared-ui/src/components/sky-tile-card/sky-tile-card.ts` (+ test) | modify | `headline` slot |
| `packages/shared-ui/src/theme/base.css` | modify | display/headline-small tokens + headline/display classes |
| `apps/msd/src/app/seo/jsonld.ts` (+ test) | modify | `itemListJsonLd`, `faqPageJsonLd` |
| `apps/msd/src/app/components/card-rail/card-rail.tsx`, `.css`, `.test.tsx` | create | reusable carousel section header + track |
| `apps/msd/src/content.json` | modify | new home copy, remove dead keys |
| `apps/msd/src/app/pages/home/home-data.ts` (+ test) | create | `useHomeCatalog`, adapters |
| `apps/msd/src/app/pages/home/home-hero.tsx` | create | hero + spotlight |
| `apps/msd/src/app/pages/home/category-tiles.tsx` | create | tiles with light-DOM links |
| `apps/msd/src/app/pages/home/deals-near-you.tsx` | create | one carousel with category tabs |
| `apps/msd/src/app/pages/home/how-it-works.tsx` | create | 3 steps |
| `apps/msd/src/app/pages/home/home-offers.tsx` | create | welcome, gift card, member |
| `apps/msd/src/app/pages/home/treatment-directory.tsx` | create | popular treatments links |
| `apps/msd/src/app/pages/home/home-faq.tsx` | create | FAQ accordion |
| `apps/msd/src/app/pages/home/home.tsx` | rewrite | composition, Seo, JSON-LD |
| `apps/msd/src/app/pages/home/home.css` | rewrite | token-only styles |
| `apps/msd/src/app/pages/home/home.test.tsx` | rewrite | behaviour tests |
| `apps/msd/src/app/pages/home/home.spec.tsx` | delete | merged into home.test.tsx |

---

### Task 1: shared-ui: tile headline slot; display and headline type roles

**Files:** modify `packages/shared-ui/src/components/sky-tile-card/sky-tile-card.ts`, its test, `packages/shared-ui/src/theme/base.css`.

- [ ] **Step 1: Failing test** (append to `sky-tile-card.test.ts`):

```ts
it('renders slotted headline content in place of the headline prop', async () => {
  const el = await create();
  const h3 = document.createElement('h3');
  h3.slot = 'headline';
  h3.textContent = 'Massage';
  el.appendChild(h3);
  await el.updateComplete;
  const slot = el.shadowRoot?.querySelector('slot[name="headline"]') as HTMLSlotElement;
  expect(slot).toBeTruthy();
  expect(slot.assignedElements()[0]).toBe(h3);
});

it('still renders the headline prop as the slot fallback', async () => {
  const el = await create({ headline: 'Spa' });
  expect(el.shadowRoot?.querySelector('slot[name="headline"] h3')?.textContent).toBe('Spa');
});
```

Run `npx nx run shared-ui:test` → FAIL.

- [ ] **Step 2: Implement.** In `sky-tile-card.ts` `render()`, wrap the headline in a named slot:

```ts
        <slot name="headline">${this.headline ? html`<h3 id="headline" class="title-medium">${this.headline}</h3>` : nothing}</slot>
```

Update the class JSDoc: "Use the `headline` slot to supply light-DOM heading markup (e.g. `<h3 slot="headline"><a href>…</a></h3>`) when crawlers must see the link; omit `href` then, the slotted link is the tile's link."

- [ ] **Step 3: Type roles.** In `packages/shared-ui/src/theme/base.css` `:root`, add before the headline-large block:

```css
  --md-sys-typescale-display-medium-font: var(--md-ref-typeface-brand);
  --md-sys-typescale-display-medium-size: 2.8125rem;
  --md-sys-typescale-display-medium-line-height: 3.25rem;
  --md-sys-typescale-display-medium-weight: 400;

  --md-sys-typescale-display-small-font: var(--md-ref-typeface-brand);
  --md-sys-typescale-display-small-size: 2.25rem;
  --md-sys-typescale-display-small-line-height: 2.75rem;
  --md-sys-typescale-display-small-weight: 400;
```

and after the headline-medium block:

```css
  --md-sys-typescale-headline-small-font: var(--md-ref-typeface-brand);
  --md-sys-typescale-headline-small-size: 1.5rem;
  --md-sys-typescale-headline-small-line-height: 2rem;
  --md-sys-typescale-headline-small-weight: 400;
```

Extend the light-DOM class list (`:where(...)` margin reset and the per-class rules) with:

```css
.display-medium { font: var(--md-sys-typescale-display-medium-weight) var(--md-sys-typescale-display-medium-size) / var(--md-sys-typescale-display-medium-line-height) var(--md-sys-typescale-display-medium-font); }
.display-small { font: var(--md-sys-typescale-display-small-weight) var(--md-sys-typescale-display-small-size) / var(--md-sys-typescale-display-small-line-height) var(--md-sys-typescale-display-small-font); }
.headline-large { font: var(--md-sys-typescale-headline-large-weight) var(--md-sys-typescale-headline-large-size) / var(--md-sys-typescale-headline-large-line-height) var(--md-sys-typescale-headline-large-font); }
.headline-medium { font: var(--md-sys-typescale-headline-medium-weight) var(--md-sys-typescale-headline-medium-size) / var(--md-sys-typescale-headline-medium-line-height) var(--md-sys-typescale-headline-medium-font); }
.headline-small { font: var(--md-sys-typescale-headline-small-weight) var(--md-sys-typescale-headline-small-size) / var(--md-sys-typescale-headline-small-line-height) var(--md-sys-typescale-headline-small-font); }
```

(add the five class names to the `:where(...)` list too). Grep for collisions first: `grep -rnE "class(Name)?=\"[^\"]*\b(display|headline)-(large|medium|small)\b" apps packages --include=*.tsx --include=*.ts --include=*.html`; report hits.

- [ ] **Step 4: Run.** `npx nx run shared-ui:test` → PASS; `npx nx build msd` → OK.

- [ ] **Step 5: Commit.** `git add packages/shared-ui/src/components/sky-tile-card packages/shared-ui/src/theme/base.css` → "feat(shared-ui): tile headline slot and display/headline type roles".

---

### Task 2: JSON-LD for the home page

**Files:** modify `apps/msd/src/app/seo/jsonld.ts`, `apps/msd/src/app/seo/jsonld.test.ts`.

- [ ] **Step 1: Failing tests** (append):

```ts
describe('home builders', () => {
  it('builds an ItemList of INR offers with absolute URLs', () => {
    const list = itemListJsonLd('https://x.in', [
      { name: 'Swedish Massage', path: '/deal/d1', price: 1499 },
      { name: 'Hair Spa', path: '/deal/d2', price: 799 },
    ]);
    expect(list['@type']).toBe('ItemList');
    expect(list.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, item: { '@type': 'Offer', name: 'Swedish Massage', url: 'https://x.in/deal/d1', price: 1499, priceCurrency: 'INR' } },
      { '@type': 'ListItem', position: 2, item: { '@type': 'Offer', name: 'Hair Spa', url: 'https://x.in/deal/d2', price: 799, priceCurrency: 'INR' } },
    ]);
    expect(JSON.stringify(list)).not.toContain('aggregateRating');
  });

  it('builds a FAQPage', () => {
    expect(faqPageJsonLd([{ question: 'Can I cancel?', answer: 'Yes, 24 hours before.' }])).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [{ '@type': 'Question', name: 'Can I cancel?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, 24 hours before.' } }],
    });
  });
});
```

(add `itemListJsonLd`, `faqPageJsonLd` to the import at the top). Run → FAIL.

- [ ] **Step 2: Implement** (append to `jsonld.ts`):

```ts
/** Carousel deals as a list of INR offers. No ratings: real reviews don't exist yet. */
export function itemListJsonLd(siteUrl: string, items: { name: string; path: string; price: number }[]): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'ItemList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Offer',
        name: item.name,
        url: new URL(item.path, `${siteUrl}/`).toString(),
        price: item.price,
        priceCurrency: 'INR',
      },
    })),
  };
}

export function faqPageJsonLd(faqs: { question: string; answer: string }[]): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}
```

- [ ] **Step 3: Run → PASS. Commit.** `git add apps/msd/src/app/seo/jsonld.ts apps/msd/src/app/seo/jsonld.test.ts` → "feat(msd): ItemList and FAQPage JSON-LD builders".

---

### Task 3: `CardRail` and home copy

**Files:** create `apps/msd/src/app/components/card-rail/card-rail.tsx`, `card-rail.css`, `card-rail.test.tsx`; modify `apps/msd/src/content.json`.

- [ ] **Step 1: Copy.** In `content.json`:
  - add top-level `"cardRail": { "previous": "Previous: {heading}", "next": "Next: {heading}", "seeAllLabel": "{seeAll}: {heading}" }`
  - in `home.sections` add `"dealsNearYou": { "heading": "Deals near you", "seeAll": "See all deals", "seeAllTo": "/explore", "allTab": "All", "tabsLabel": "Filter deals by category", "empty": "No deals in this category yet." }`
  - in `home` add:

```json
    "howItWorks": {
      "heading": "How it works",
      "subheading": "Book a spa, massage or beauty treatment in three steps.",
      "steps": [
        { "icon": "search", "title": "Find", "text": "Search or browse verified spas and therapists near you." },
        { "icon": "event_available", "title": "Book", "text": "Pick a deal and a time, then pay securely with Razorpay." },
        { "icon": "spa", "title": "Relax", "text": "Get instant confirmation and enjoy your treatment." }
      ]
    },
    "categoryIcons": {
      "massage": "self_improvement",
      "spa-retreats": "hot_tub",
      "skin-beauty": "face_retouching_natural",
      "hair-nails": "content_cut",
      "health-wellness": "favorite",
      "therapy": "healing",
      "product": "shopping_bag",
      "default": "spa"
    },
    "categoryTileText": "{count} treatments",
```

  - in `home.hero` keep existing keys.
  Validate JSON. Do not remove anything in this task (Task 5 removes dead keys after the rewrite).

- [ ] **Step 2: Failing test** `card-rail.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { CardRail } from './card-rail';

const renderRail = () =>
  render(
    <MemoryRouter>
      <CardRail id="rail-heading" heading="Deals near you" seeAll="See all deals" seeAllTo="/explore">
        <swiper-slide>one</swiper-slide>
      </CardRail>
    </MemoryRouter>,
  );

describe('CardRail', () => {
  it('renders an h2 with the given id and a See all link named with its heading', () => {
    renderRail();
    expect(screen.getByRole('heading', { level: 2, name: 'Deals near you' }).id).toBe('rail-heading');
    const link = screen.getByRole('link', { name: 'See all deals: Deals near you' });
    expect(link.getAttribute('href')).toBe('/explore');
    expect(link.textContent).toContain('See all deals');
  });

  it('names the previous/next buttons from content', () => {
    renderRail();
    expect(document.querySelector('[aria-label="Previous: Deals near you"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Next: Deals near you"]')).toBeTruthy();
  });
});
```

Run → FAIL.

- [ ] **Step 3: Implement** `card-rail.tsx` (moved from home.tsx's `Rail`):

```tsx
import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, OutlinedIconButton } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import content from '../../../content.json';
import './card-rail.css';

type SwiperHost = HTMLElement & { swiper?: { slidePrev(): void; slideNext(): void } };

const t = content.cardRail;
const fill = (template: string, values: Record<string, string>) =>
  Object.entries(values).reduce((s, [k, v]) => s.replace(`{${k}}`, v), template);

export interface CardRailProps {
  /** Id of the rendered h2; the parent <section aria-labelledby> points at it. */
  id: string;
  heading: string;
  seeAll: string;
  seeAllTo: string;
  /** Remounts the carousel when the slide set is swapped wholesale (e.g. a tab change). */
  railKey?: string;
  /** Content between the header row and the track (e.g. tabs). */
  above?: ReactNode;
  children: ReactNode;
}

/** Carousel section: heading, "See all" link and prev/next buttons in one row (so arrows never
 *  cover cards), then a Swiper track of `<swiper-slide className="card-rail__slide">` children. */
export function CardRail({ id, heading, seeAll, seeAllTo, railKey, above, children }: CardRailProps) {
  const swiperRef = useRef<SwiperHost>(null);
  return (
    <div className="card-rail">
      <div className="card-rail__head">
        <h2 id={id} className="card-rail__title headline-small">{heading}</h2>
        <div className="card-rail__actions">
          <Link className="card-rail__link label-large" to={seeAllTo} aria-label={fill(t.seeAllLabel, { seeAll, heading })}>
            {seeAll}
            <Icon aria-hidden="true">arrow_forward</Icon>
          </Link>
          <OutlinedIconButton className="card-rail__nav" aria-label={fill(t.previous, { heading })} onClick={() => swiperRef.current?.swiper?.slidePrev()}>
            <Icon>chevron_left</Icon>
          </OutlinedIconButton>
          <OutlinedIconButton className="card-rail__nav" aria-label={fill(t.next, { heading })} onClick={() => swiperRef.current?.swiper?.slideNext()}>
            <Icon>chevron_right</Icon>
          </OutlinedIconButton>
        </div>
      </div>
      {above}
      <div className="card-rail__track">
        <swiper-container key={railKey} ref={swiperRef} slides-per-view="auto" space-between={16} grab-cursor="true">
          {children}
        </swiper-container>
      </div>
    </div>
  );
}
```

`card-rail.css`:

```css
/* Carousel section. 840px = M3 expanded window class. */
.card-rail__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  margin-block-end: 16px;
}
.card-rail__title {
  margin: 0;
  color: var(--md-sys-color-on-surface);
}
.card-rail__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.card-rail__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-block-size: 48px;
  padding-inline: 12px;
  border-radius: var(--md-sys-shape-corner-full);
  color: var(--md-sys-color-primary);
  text-decoration: none;
  --md-icon-size: 20px;
}
.card-rail__link:hover {
  background-color: color-mix(
    in srgb,
    var(--md-sys-color-primary) calc(var(--md-sys-state-hover-state-layer-opacity) * 100%),
    transparent
  );
}
.card-rail__link:focus-visible {
  outline: 3px solid var(--md-sys-color-primary);
  outline-offset: 2px;
}
.card-rail__nav {
  display: none;
}
.card-rail__track swiper-container {
  padding-block: 4px 8px;
}
.card-rail__slide {
  display: flex;
  inline-size: min(272px, 80vw);
  block-size: auto;
}
.card-rail__slide > * {
  flex: 1;
}
@media (min-width: 840px) {
  .card-rail__nav {
    display: inline-flex;
  }
}
```

- [ ] **Step 4: Run → PASS.** `npx vitest run apps/msd/src/app/components/card-rail --root apps/msd`. If `getByRole('link', { name })` sees the text content instead of `aria-label`, keep the aria-label and query by `document.querySelector('a[href="/explore"]')` checking its `aria-label`.

- [ ] **Step 5: Commit.** `git add apps/msd/src/app/components/card-rail apps/msd/src/content.json` → "feat(msd): reusable CardRail and new home copy".

---

### Task 4: Home data hook and adapters

**Files:** create `apps/msd/src/app/pages/home/home-data.ts`, `apps/msd/src/app/pages/home/home-data.test.tsx`.

- [ ] **Step 1: Failing test** `home-data.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { useHomeCatalog } from './home-data';

const m = vi.hoisted(() => ({
  deals: vi.fn(),
  products: vi.fn(),
  therapists: vi.fn(),
  faqs: vi.fn(),
}));

vi.mock('../../../api/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/catalog')>()),
  listCatalogDeals: (...a: unknown[]) => m.deals(...a),
  listCatalogProducts: (...a: unknown[]) => m.products(...a),
  listCatalogTherapists: (...a: unknown[]) => m.therapists(...a),
  listCatalogFaqs: (...a: unknown[]) => m.faqs(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
  m.deals.mockResolvedValue({ data: [{ id: 'd1' }] });
  m.products.mockResolvedValue({ data: [] });
  m.therapists.mockResolvedValue({ data: [] });
  m.faqs.mockResolvedValue({ data: [{ id: 'f1', question: 'Q', answer: 'A' }] });
});

describe('useHomeCatalog', () => {
  it('waits while location is unresolved (undefined coords)', async () => {
    renderHook(() => useHomeCatalog(undefined));
    await Promise.resolve();
    expect(m.deals).not.toHaveBeenCalled();
  });

  it('fetches once with coordinates when resolved', async () => {
    const { result } = renderHook(() => useHomeCatalog({ latitude: 26.7, longitude: 83.4 }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(m.deals).toHaveBeenCalledTimes(1);
    expect(m.deals).toHaveBeenCalledWith(expect.objectContaining({ latitude: 26.7, longitude: 83.4, pageSize: 24 }));
    expect(result.current.deals).toHaveLength(1);
    await waitFor(() => expect(result.current.faqs).toHaveLength(1));
  });

  it('fetches without coordinates when location is none (null)', async () => {
    const { result } = renderHook(() => useHomeCatalog(null));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(m.deals).toHaveBeenCalledWith(expect.objectContaining({ latitude: undefined, longitude: undefined }));
  });

  it('reports an error without throwing', async () => {
    m.deals.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useHomeCatalog(null));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBeTruthy();
  });

  it('a FAQ failure just leaves faqs empty', async () => {
    m.faqs.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useHomeCatalog(null));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.faqs).toEqual([]);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement** `home-data.ts`. Move `toDealCardDeal` and `toProductCardDeal` verbatim from the current `home.tsx` (keep their doc comments), then add:

```ts
import { useEffect, useState } from 'react';
import {
  listCatalogDeals,
  listCatalogFaqs,
  listCatalogProducts,
  listCatalogTherapists,
  type CatalogDeal,
  type CatalogFaq,
  type CatalogProduct,
  type CatalogTherapist,
} from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import type { Coordinates } from '../../../location/geo';
import content from '../../../content.json';

export const HOME_DEALS_PAGE_SIZE = 24;
export const HOME_RAIL_SIZE = 12;

export interface HomeCatalog {
  status: 'loading' | 'ready' | 'error';
  error: string;
  deals: CatalogDeal[];
  products: CatalogProduct[];
  therapists: CatalogTherapist[];
  faqs: CatalogFaq[];
}

/**
 * One batched fetch for the home page. `coords === undefined` means the visitor location is
 * still resolving, so the fetch waits (one request, already nearest-first); `null` means no
 * location, so it fetches without coordinates. Categories come from `CatalogShellProvider`.
 * FAQs are CMS-managed and non-critical: a failure just leaves them empty.
 */
export function useHomeCatalog(coords: Coordinates | null | undefined): HomeCatalog {
  const [state, setState] = useState<Omit<HomeCatalog, 'faqs'>>({
    status: 'loading',
    error: '',
    deals: [],
    products: [],
    therapists: [],
  });
  const [faqs, setFaqs] = useState<CatalogFaq[]>([]);
  const resolved = coords !== undefined;
  const latitude = coords?.latitude;
  const longitude = coords?.longitude;

  useEffect(() => {
    if (!resolved) return;
    let cancelled = false;
    setState((s) => ({ ...s, status: 'loading', error: '' }));
    Promise.all([
      listCatalogDeals({ pageSize: HOME_DEALS_PAGE_SIZE, latitude, longitude }),
      listCatalogProducts({ pageSize: HOME_RAIL_SIZE, sort: 'newest' }),
      listCatalogTherapists({ pageSize: HOME_RAIL_SIZE, latitude, longitude }),
    ])
      .then(([deals, products, therapists]) => {
        if (cancelled) return;
        setState({ status: 'ready', error: '', deals: deals.data ?? [], products: products.data ?? [], therapists: therapists.data ?? [] });
      })
      .catch((err) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          status: 'error',
          error: err instanceof ApiRequestError ? err.message : content.home.ui.messages.loadError,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [resolved, latitude, longitude]);

  useEffect(() => {
    listCatalogFaqs()
      .then(({ data }) => setFaqs(data ?? []))
      .catch(() => setFaqs([]));
  }, []);

  return { ...state, faqs };
}
```

(If `listCatalogProducts`/`listCatalogTherapists` option types differ, match their signatures in `apps/msd/src/api/catalog.ts`; report any mismatch.)

- [ ] **Step 3: Run → PASS. Commit.** `git add apps/msd/src/app/pages/home/home-data.ts apps/msd/src/app/pages/home/home-data.test.tsx` → "feat(msd): home catalog hook that waits for visitor location".

---

### Task 5: Home sections, composition, styles, tests

**Files:** create the section components listed in the file map; rewrite `home.tsx`, `home.css`, `home.test.tsx`; delete `home.spec.tsx`; modify `content.json` (dead keys).

- [ ] **Step 1: Failing tests.** Rewrite `apps/msd/src/app/pages/home/home.test.tsx`. Reuse the `cat()` and `deal()` fixture helpers from the current file (copy them). Mocks:

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { CatalogCategoryWithChildren, CatalogDeal } from '../../../api/catalog';
import content from '../../../content.json';
import { Home } from './home';

const m = vi.hoisted(() => ({
  deals: vi.fn(),
  products: vi.fn(),
  therapists: vi.fn(),
  faqs: vi.fn(),
  categories: [] as unknown[],
  location: { status: 'ready', coords: null as null | { latitude: number; longitude: number } },
}));

vi.mock('../../../api/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/catalog')>()),
  listCatalogDeals: (...a: unknown[]) => m.deals(...a),
  listCatalogProducts: (...a: unknown[]) => m.products(...a),
  listCatalogTherapists: (...a: unknown[]) => m.therapists(...a),
  listCatalogFaqs: (...a: unknown[]) => m.faqs(...a),
}));
vi.mock('../../../catalog/catalog-shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../catalog/catalog-shell')>()),
  useCatalogShell: () => ({ status: 'ready', locationsStatus: 'ready', categories: m.categories, locations: [], socialLinks: [] }),
}));
vi.mock('../../../location/location-context', () => ({ useVisitorLocation: () => m.location }));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ isAuthenticated: false, token: null }) }));
vi.mock('../../../wishlist/wishlist-context', () => ({ useWishlist: () => ({ toggle: vi.fn(), has: () => false }) }));
vi.mock('../../seo/site-url', () => ({
  SITE_URL: 'https://example.test',
  absoluteUrl: (p: string) => new URL(p, 'https://example.test/').toString(),
}));
```

`beforeEach`: categories Massage (`c-m`, slug massage, 2 children), Spa (`c-s`, slug spa-retreats), Hair (`c-h`, slug hair-nails, no deals); deals: two Massage deals, one Spa deal (via `deal({ category: ... })`); products/therapists `{ data: [] }`; faqs one item; `m.location = { status: 'ready', coords: null }`.

Tests (each renders `<MemoryRouter><Home /></MemoryRouter>`):
1. **Loading then content:** while deals pending (`m.deals.mockReturnValue(new Promise(() => {}))`), a `role="status"` with `aria-busy="true"` shows.
2. **Error:** deals reject → `role="alert"` with `content.home.ui.messages.loadError` (or the ApiRequestError message).
3. **Waits for location:** `m.location = { status: 'locating', coords: null }` → after a flush, `m.deals` not called; with `{ status: 'ready', coords: { latitude: 26.7, longitude: 83.4 } }` → called with those coords.
4. **One h1 and section order:** exactly one `h1`; the h2 texts include, in this order: `content.home.sections.browseByCategory.heading`, `content.home.sections.dealsNearYou.heading`, `content.home.howItWorks.heading`, `content.home.searchByDestination.heading`, `content.home.faq.heading` (assert each index > previous).
5. **Category tiles are real links:** within the list under the category heading's section, a link named "Massage" has href `/category/massage`, and there's no link for a category not in data.
6. **Deals tabs:** tabs are `md-secondary-tab` elements with text: exactly `All`, `Massage`, `Spa` (Hair has no deals). Initially 3 cards in the deals section (`section[aria-labelledby="deals-heading"] sky-product-card`); click the `Spa` tab → 1 card.
7. **How it works:** the section's `<ol>` has 3 `<li>` with the step titles from content.
8. **JSON-LD:** among `script[type="application/ld+json"]`, one parses to `@type: 'ItemList'` with 3 items whose urls start with `https://example.test/deal/`, and one to `FAQPage` with the FAQ question.
9. **Seo:** `document.title === content.meta.home.title`, and `link[rel="canonical"]` href is `https://example.test/`.

Delete `home.spec.tsx` (its loading/error cases are tests 1-2). Run → FAIL.

- [ ] **Step 2: Section components.** Create:

`home-hero.tsx`: the current hero `<section className="home-hero">` JSX moved verbatim, as `export function HomeHero({ spotlight }: { spotlight?: CatalogDeal })`, using `toDealCardDeal` from `./home-data`, `useNavigate` for search, and `formatINR`. Changes: `sky-action-field` uses the attribute `action-label={home.hero.ctaLabel}` (SSR-safe) instead of `actionLabel`; the `h1` gets `className="home-hero__title"`; the spotlight thumbnail keeps `alt=""` (decorative, title is in text).

`category-tiles.tsx`:

```tsx
import { Link } from 'react-router-dom';
import type { CatalogCategoryWithChildren } from '../../../api/catalog';
import { categoryHref } from '../../../catalog/catalog-shell';
import content from '../../../content.json';

const { home } = content;
const icons = home.categoryIcons as Record<string, string>;

/** Category tiles. The heading + link are slotted light DOM so crawlers see real links. */
export function CategoryTiles({ categories }: { categories: CatalogCategoryWithChildren[] }) {
  return (
    <section className="home-band" aria-labelledby="category-heading">
      <div className="home-container">
        <div className="home-head">
          <h2 id="category-heading" className="headline-small">{home.sections.browseByCategory.heading}</h2>
          <Link className="home-head__link label-large" to={home.sections.browseByCategory.seeAllTo}>
            {home.sections.browseByCategory.seeAll}
          </Link>
        </div>
        <ul className="home-cats" role="list">
          {categories.map((cat) => (
            <li key={cat.id}>
              <sky-tile-card
                icon={icons[cat.slug] ?? icons.default}
                text={home.categoryTileText.replace('{count}', String(cat.children.length))}
              >
                <h3 slot="headline" className="home-cats__name title-medium">
                  <Link to={categoryHref(cat.slug)} className="home-cats__link">{cat.name}</Link>
                </h3>
              </sky-tile-card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```

(The "See all" link: give it an accessible name via `aria-label` = `content.cardRail.seeAllLabel` filled with seeAll + heading, same as CardRail.)

`deals-near-you.tsx`:

```tsx
import { useMemo, useState, type ReactNode } from 'react';
import { SecondaryTab, Tabs } from '@skylabs-monorepo/shared-ui/react';
import type { CatalogCategoryWithChildren, CatalogDeal } from '../../../api/catalog';
import { CardRail } from '../../components/card-rail/card-rail';
import content from '../../../content.json';

const t = content.home.sections.dealsNearYou;
const ALL = 'all';

/** One carousel for every deal (nearest-first when the visitor location is known), filtered by
 *  category tabs. Replaces the old Featured / Biggest savings / per-category carousels. */
export function DealsNearYou({
  deals,
  categories,
  renderDeal,
}: {
  deals: CatalogDeal[];
  categories: CatalogCategoryWithChildren[];
  renderDeal: (deal: CatalogDeal) => ReactNode;
}) {
  const [active, setActive] = useState(ALL);
  const tabs = useMemo(
    () => [
      { id: ALL, label: t.allTab },
      ...categories.filter((c) => deals.some((d) => d.category?.id === c.id)).map((c) => ({ id: c.id, label: c.name })),
    ],
    [categories, deals],
  );
  const shown = active === ALL ? deals : deals.filter((d) => d.category?.id === active);

  return (
    <section className="home-band home-band--tint" aria-labelledby="deals-heading">
      <div className="home-container">
        <CardRail
          id="deals-heading"
          heading={t.heading}
          seeAll={t.seeAll}
          seeAllTo={t.seeAllTo}
          railKey={active}
          above={
            tabs.length > 1 ? (
              <Tabs className="home-tabs" aria-label={t.tabsLabel}>
                {tabs.map((tab) => (
                  <SecondaryTab key={tab.id} active={active === tab.id} onClick={() => setActive(tab.id)}>
                    {tab.label}
                  </SecondaryTab>
                ))}
              </Tabs>
            ) : null
          }
        >
          {shown.map(renderDeal)}
        </CardRail>
        {shown.length === 0 && <p className="home-empty body-large">{t.empty}</p>}
      </div>
    </section>
  );
}
```

`how-it-works.tsx`:

```tsx
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import content from '../../../content.json';

const t = content.home.howItWorks;

/** Three short steps: plain, quotable answer content for AI answer engines (AEO). */
export function HowItWorks() {
  return (
    <section className="home-band" aria-labelledby="how-heading">
      <div className="home-container">
        <div className="home-head home-head--stack">
          <h2 id="how-heading" className="headline-small">{t.heading}</h2>
          <p className="home-head__sub body-large">{t.subheading}</p>
        </div>
        <ol className="home-steps">
          {t.steps.map((step) => (
            <li key={step.title} className="home-steps__item">
              <span className="home-steps__icon" aria-hidden="true">
                <Icon>{step.icon}</Icon>
              </span>
              <h3 className="title-medium">{step.title}</h3>
              <p className="body-medium">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
```

`home-offers.tsx`: the current offers `<section>` (welcome `<article>`, gift `sky-feature-card`, member `sky-feature-card` when signed out) moved verbatim as `export function HomeOffers({ isAuthenticated }: { isAuthenticated: boolean })`. Change the welcome CTA from `FilledButton onClick={navigate}` to `<FilledButton href="/explore">` (a real link). Give the section `aria-labelledby` pointing at the welcome `h2` (add `id="offers-heading"`) instead of `aria-label`.

`treatment-directory.tsx`: the current directory section moved verbatim as `export function TreatmentDirectory()`; heading class `headline-small`, links `body-medium`.

`home-faq.tsx`: the current FAQ section moved verbatim as `export function HomeFaq({ faqs }: { faqs: CatalogFaq[] })`, returning `null` when empty; heading class `headline-small`. Answers stay slotted light DOM (crawlable).

- [ ] **Step 3: Compose `home.tsx`** (replace the file):

```tsx
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import type { CatalogDeal } from '../../../api/catalog';
import { useCatalogShell } from '../../../catalog/catalog-shell';
import { useVisitorLocation } from '../../../location/location-context';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { formatINR } from '../../../utils/format';
import { primaryImage, resolveTherapistMedia } from '../../../utils/media';
import { CardRail } from '../../components/card-rail/card-rail';
import { DealCard } from '../../components/deal-card';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { Seo } from '../../seo/seo';
import { faqPageJsonLd, itemListJsonLd, type JsonLdObject } from '../../seo/jsonld';
import { SITE_URL } from '../../seo/site-url';
import { CategoryTiles } from './category-tiles';
import { DealsNearYou } from './deals-near-you';
import { HomeFaq } from './home-faq';
import { HomeHero } from './home-hero';
import { HomeOffers } from './home-offers';
import { HowItWorks } from './how-it-works';
import { TreatmentDirectory } from './treatment-directory';
import { HOME_RAIL_SIZE, toDealCardDeal, toProductCardDeal, useHomeCatalog } from './home-data';
import content from '../../../content.json';
import './home.css';

const { home } = content;

function HomeSkeleton() {
  // move the current HomeSkeleton body verbatim
}

export function Home() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { toggle, has } = useWishlist();
  const { categories } = useCatalogShell();
  const { status: locationStatus, coords } = useVisitorLocation();
  const catalog = useHomeCatalog(locationStatus === 'locating' ? undefined : coords);

  const spotlight = useMemo(
    () => [...catalog.deals].sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0))[0],
    [catalog.deals],
  );

  const jsonLd = useMemo(() => {
    const blocks: JsonLdObject[] = [];
    if (SITE_URL && catalog.deals.length > 0) {
      blocks.push(
        itemListJsonLd(
          SITE_URL,
          catalog.deals.slice(0, HOME_RAIL_SIZE).map((d) => ({ name: d.title, path: `/deal/${d.id}`, price: Number(d.salePrice) })),
        ),
      );
    }
    if (catalog.faqs.length > 0) blocks.push(faqPageJsonLd(catalog.faqs));
    return blocks.length > 0 ? blocks : undefined;
  }, [catalog.deals, catalog.faqs]);

  const handleFavorite = (id: string) => {
    if (!isAuthenticated) {
      navigate('/sign-in');
      return;
    }
    toggle(id);
  };

  const renderDeal = (deal: CatalogDeal) => (
    <swiper-slide key={deal.id} className="card-rail__slide">
      <DealCard
        deal={toDealCardDeal(deal)}
        eyebrowHref={deal.vendor?.slug ? `/vendor/${deal.vendor.slug}` : undefined}
        favoriteActive={isAuthenticated && has(deal.id)}
        onFavorite={() => handleFavorite(deal.id)}
      />
    </swiper-slide>
  );

  const seo = <Seo title={content.meta.home.title} description={content.meta.home.description} path="/" jsonLd={jsonLd} />;

  if (catalog.status === 'loading') return <>{seo}<HomeSkeleton /></>;
  if (catalog.status === 'error') {
    return (
      <>
        {seo}
        <p className="error-state" role="alert">{catalog.error}</p>
      </>
    );
  }

  return (
    <div className="home">
      {seo}
      <HomeHero spotlight={spotlight} />
      <CategoryTiles categories={categories} />
      {catalog.deals.length > 0 && <DealsNearYou deals={catalog.deals} categories={categories} renderDeal={renderDeal} />}
      <HowItWorks />
      {catalog.therapists.length > 0 && (
        <section className="home-band" aria-labelledby="therapists-heading">
          <div className="home-container">
            <CardRail id="therapists-heading" heading={home.sections.therapists.heading} seeAll={home.sections.therapists.seeAll} seeAllTo={home.sections.therapists.seeAllTo}>
              {/* move the current therapist <swiper-slide> mapping verbatim, with className="card-rail__slide" */}
            </CardRail>
          </div>
        </section>
      )}
      <HomeOffers isAuthenticated={isAuthenticated} />
      {catalog.products.length > 0 && (
        <section className="home-band home-band--tint" aria-labelledby="products-heading">
          <div className="home-container">
            <CardRail id="products-heading" heading={home.sections.featuredProducts.heading} seeAll={home.sections.featuredProducts.seeAll} seeAllTo={home.sections.featuredProducts.seeAllTo}>
              {/* move the current product <swiper-slide> mapping verbatim, with className="card-rail__slide" */}
            </CardRail>
          </div>
        </section>
      )}
      <TreatmentDirectory />
      <HomeFaq faqs={catalog.faqs} />
      <section className="home-band home-band--flush" aria-label={home.partnerBanner.heading}>
        <div className="home-container">
          {/* move the current <sky-cta-banner> verbatim, switching ctaLabel to the attribute form cta-label=... only if typings allow; otherwise keep */}
        </div>
      </section>
    </div>
  );
}

export default Home;
```

Fill the three "move verbatim" comments with the current code from `home.tsx` (therapist slides use `formatINR`, `primaryImage`, `resolveTherapistMedia`, `SkyProductCardWC`; product slides use `DealCard` + `toProductCardDeal`). Remove imports that end up unused.

- [ ] **Step 4: Rewrite `home.css`** (token-only; replace the file):

```css
/* Home page. Colours: app theme; type/shape/motion/state/elevation: shared-ui base.css.
   Carousel header styles live in card-rail.css. 840px = M3 expanded window class. */
.home {
  display: flex;
  flex-direction: column;
}
.home-container {
  max-inline-size: 1280px;
  margin-inline: auto;
  padding-inline: 16px;
}
.home-band {
  padding-block: 32px;
}
.home-band--tint {
  background-color: var(--md-sys-color-surface-container-low);
}
.home-band--flush {
  padding-block: 16px 32px;
}
.home :is(a):focus-visible {
  outline: 3px solid var(--md-sys-color-primary);
  outline-offset: 2px;
}

.home-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  margin-block-end: 16px;
}
.home-head--stack {
  flex-direction: column;
  align-items: flex-start;
}
.home-head h2 {
  margin: 0;
  color: var(--md-sys-color-on-surface);
}
.home-head__sub {
  max-inline-size: 60ch;
  color: var(--md-sys-color-on-surface-variant);
}
.home-head__link {
  display: inline-flex;
  align-items: center;
  min-block-size: 48px;
  padding-inline: 12px;
  border-radius: var(--md-sys-shape-corner-full);
  color: var(--md-sys-color-primary);
  text-decoration: none;
}

/* Hero */
.home-hero {
  padding-block: 32px;
  background-color: var(--md-sys-color-surface);
}
.home-hero__inner {
  display: grid;
  gap: 24px;
}
.home-hero__copy {
  display: grid;
  gap: 16px;
  align-content: center;
  min-inline-size: 0;
}
.home-hero__title {
  margin: 0;
  font-family: var(--md-sys-typescale-display-medium-font);
  font-size: clamp(var(--md-sys-typescale-headline-large-size), 1.6rem + 2.6vw, var(--md-sys-typescale-display-medium-size));
  line-height: 1.15;
  font-weight: 700;
  color: var(--md-sys-color-on-surface);
}
.home-hero__sub {
  margin: 0;
  max-inline-size: 44ch;
  font-size: var(--md-sys-typescale-body-large-size);
  line-height: var(--md-sys-typescale-body-large-line-height);
  color: var(--md-sys-color-on-surface-variant);
}
.home-hero__search {
  max-inline-size: 560px;
}
.home-hero__visual {
  position: relative;
  min-inline-size: 0;
}
.home-hero__img {
  display: block;
  inline-size: 100%;
  block-size: auto;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--md-sys-shape-corner-extra-large);
}
.home-spotlight {
  position: absolute;
  inset-inline-start: 16px;
  inset-block-end: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  max-inline-size: min(380px, calc(100% - 32px));
  padding: 8px 12px 8px 8px;
  border-radius: var(--md-sys-shape-corner-large);
  background-color: var(--md-sys-color-surface-container-lowest);
  color: var(--md-sys-color-on-surface);
  box-shadow: var(--sky-elevation-2);
  text-decoration: none;
}
.home-spotlight__thumb {
  inline-size: 64px;
  block-size: 64px;
  flex: none;
  object-fit: cover;
  border-radius: var(--md-sys-shape-corner-medium);
}
.home-spotlight__body {
  display: grid;
  gap: 2px;
  min-inline-size: 0;
}
.home-spotlight__label {
  font-size: var(--md-sys-typescale-label-medium-size);
  line-height: var(--md-sys-typescale-label-medium-line-height);
  font-weight: var(--md-sys-typescale-label-medium-weight);
  color: var(--md-sys-color-primary);
}
.home-spotlight__title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: var(--md-sys-typescale-title-small-size);
  line-height: var(--md-sys-typescale-title-small-line-height);
  font-weight: var(--md-sys-typescale-title-small-weight);
}
.home-spotlight__price {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: var(--md-sys-typescale-body-medium-size);
}
.home-spotlight__price s {
  color: var(--md-sys-color-on-surface-variant);
}
.home-spotlight__off {
  color: var(--md-sys-color-primary);
  font-weight: 600;
}
.home-spotlight__arrow {
  flex: none;
  color: var(--md-sys-color-primary);
}

/* Category tiles (tile surface is sky-tile-card; the slotted link stretches over it). */
.home-cats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.home-cats__name {
  color: inherit;
}
.home-cats__link {
  color: inherit;
  text-decoration: none;
}
.home-cats__link::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--md-sys-shape-corner-large);
}
.home-cats__link:focus-visible {
  outline: none;
}
.home-cats sky-tile-card:has(.home-cats__link:focus-visible) {
  outline: 3px solid var(--md-sys-color-primary);
  outline-offset: 2px;
  border-radius: var(--md-sys-shape-corner-large);
}

/* Deals tabs */
.home-tabs {
  margin-block-end: 16px;
  --md-secondary-tab-container-color: transparent;
}
.home-empty {
  color: var(--md-sys-color-on-surface-variant);
}

/* How it works */
.home-steps {
  display: grid;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}
.home-steps__item {
  display: grid;
  gap: 8px;
  padding: 20px;
  border-radius: var(--md-sys-shape-corner-large);
  background-color: var(--md-sys-color-surface-container);
  color: var(--md-sys-color-on-surface);
}
.home-steps__item p {
  color: var(--md-sys-color-on-surface-variant);
}
.home-steps__icon {
  display: inline-grid;
  place-items: center;
  inline-size: 48px;
  block-size: 48px;
  border-radius: var(--md-sys-shape-corner-medium);
  background-color: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
}

/* Offers bento: keep the current .home-offers / .home-offer* rules from the old home.css,
   converting every literal font size, radius and duration to the matching token
   (see the rule table in Step 5). */

/* Treatment directory */
.home-directory {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 24px;
}
.home-directory__title {
  margin: 0 0 8px;
}
.home-directory__links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.home-directory__links a {
  display: inline-flex;
  align-items: center;
  min-block-size: 40px;
  color: var(--md-sys-color-on-surface-variant);
}
.home-directory__links a:hover {
  color: var(--md-sys-color-primary);
}

/* FAQ */
.home-faq {
  display: grid;
  gap: 24px;
}
.home-faq__intro {
  display: grid;
  gap: 8px;
  align-content: start;
}

/* Skeleton */
.home-skeleton {
  display: grid;
  gap: 24px;
  padding-block: 32px;
}
.home-skeleton__hero,
.home-skeleton__row {
  display: grid;
  gap: 16px;
}
.home-skeleton__block {
  border-radius: var(--md-sys-shape-corner-large);
  background-color: var(--md-sys-color-surface-container);
}
.home-skeleton__block--copy {
  min-block-size: 200px;
}
.home-skeleton__block--media {
  aspect-ratio: 4 / 3;
}
.home-skeleton__block--card {
  aspect-ratio: 3 / 4;
}

@media (min-width: 600px) {
  .home-skeleton__row {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (min-width: 840px) {
  .home-band {
    padding-block: 48px;
  }
  .home-hero {
    padding-block: 48px;
  }
  .home-hero__inner,
  .home-skeleton__hero {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    gap: 48px;
  }
  .home-steps {
    grid-template-columns: repeat(3, 1fr);
  }
  .home-faq {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.7fr);
    gap: 48px;
  }
  .home-skeleton__row {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

- [ ] **Step 5: Offers CSS conversion.** Copy the old `.home-offers`, `.home-offer`, `.home-offer--welcome`, `.home-offers--member`, `.home-offer__bg`, `.home-offer--welcome:hover .home-offer__bg`, `.home-offer--welcome::after`, `.home-offer__content`, `.home-offer__badge`, `.home-offer__title`, `.home-offer__subtitle`, `.home-offer__text` rules and their responsive overrides into the placeholder comment in `home.css`, converting: font sizes → the nearest typescale size token (title clamp → `clamp(var(--md-sys-typescale-headline-large-size), 1.5rem + 2vw, var(--md-sys-typescale-display-medium-size))`); radii → `--md-sys-shape-corner-*`; transition durations → `--md-sys-motion-duration-*` + `--md-sys-motion-easing-standard`; any hex/rgb → the matching `--md-sys-color-*` role (text on the photo scrim uses `--sky-color-on-scrim` over `color-mix(in srgb, var(--md-sys-color-scrim) 70%, transparent)`); `max-width`/`width` → logical `max-inline-size`/`inline-size`; the old `@media (max-width: 1023px)` offers override becomes the mobile default with the desktop grid inside `@media (min-width: 840px)`. Drop the old entrance-animation `@keyframes` block for the hero (motion tokens already zero under reduced motion; no replacement animation).

- [ ] **Step 6: Remove dead copy.** In `content.json`, for each of these keys, `grep -rn "<key>" apps/msd/src apps/mera-driver/src --include=*.ts --include=*.tsx` and delete only those with no remaining reference: `home.spaFinderHero`, `home.premiumHero`, `home.heroImages`, `home.vacationStays`, `home.trustSection`, `home.sections.featuredDeals`, `home.sections.hotRightNow`, `home.sections.massageTherapy`, `home.sections.facialSkin`, `home.sections.nailCare`, `home.sections.spasRetreats`, `home.sections.healthWellness`, `home.giftCard.chip`, `home.giftCard.image`, `home.giftCard.features`, `home.welcomeOffer.offerCard`, `home.ui.accessibility.*` entries no longer used, unused `home.ui.labels.*` entries, top-level `dealOfTheDay`. List what you removed and the grep evidence in your report. Validate JSON.

- [ ] **Step 7: Run.**
  - `npx vitest run apps/msd/src/app/pages/home --root apps/msd` → PASS.
  - `npx nx run msd:test` → known failures only.
  - `cd apps/msd && npx eslint src/app/pages/home src/app/components/card-rail` → clean.
  - `grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(|[0-9]+ms\b|font-size: [0-9]|border-radius: [0-9]" apps/msd/src/app/pages/home/home.css apps/msd/src/app/components/card-rail/card-rail.css` → no output.
  - `npx nx build msd` → OK.

- [ ] **Step 8: Commit.** `git add apps/msd/src/app/pages/home apps/msd/src/content.json` (+ `git rm apps/msd/src/app/pages/home/home.spec.tsx`) → "feat(msd): rebuild home page as 10 fixed sections with Seo and JSON-LD".

---

### Task 6: Verify, spec note, TASK.md

- [ ] **Step 1: Full checks.** `npx nx run-many -t lint test build --projects=msd,shared-ui` (msd lint has pre-existing errors; report the count before/after, which must not grow), tsc baseline unchanged.
- [ ] **Step 2: Manual (controller):** dev server on 4200 (msd-api only allows that origin): desktop 1280 and phone widths; one h1; hero search goes to `/explore?q=`; tiles link to categories; deals tabs filter; How it works shows 3 steps; FAQ opens; no horizontal scroll; dark theme via the footer switch keeps text readable.
- [ ] **Step 3: Spec + TASK.md.** In the spec section 7, record: category tile text is "{n} treatments" (subcategory count) instead of a deal count (the home fetch is capped at 24 deals, so counts would be wrong); the offers welcome CTA is a link. Mark "msd shell plan 3: home page" done in TASK.md; add "msd: migrate remaining useCurrentLocation callers (category, search, therapists, vendor) to useVisitorLocation" if any remain (`grep -rn useCurrentLocation apps/msd/src`).
- [ ] **Step 4: Commit.** `git add docs/superpowers/specs/2026-09-22-msd-shell-home-design.md TASK.md` → "docs: record home page decisions and plan 3 status".

---

## Self-review notes

- Spec 7 sections 1-10 → Task 5 (hero, tiles, deals, how it works, therapists, offers, products, directory, FAQ, partner). Spec 8.3 home ItemList + FAQPage → Tasks 2 and 5. `prerenderData()` is plan 4.
- Names used across tasks: `CardRail` (`id`, `heading`, `seeAll`, `seeAllTo`, `railKey`, `above`), `card-rail__slide`, `useHomeCatalog`, `HOME_DEALS_PAGE_SIZE`, `HOME_RAIL_SIZE`, `toDealCardDeal`, `toProductCardDeal`, `itemListJsonLd`, `faqPageJsonLd`, `content.cardRail.*`, `content.home.sections.dealsNearYou.*`, `content.home.howItWorks.*`, `content.home.categoryIcons`, `content.home.categoryTileText`: consistent.
- The home page no longer uses `useCurrentLocation`; `useVisitorLocation` status `locating` holds the fetch, avoiding the double fetch noted in plan 1's review.
