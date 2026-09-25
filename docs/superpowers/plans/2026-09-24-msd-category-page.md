# msd Category Page Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/category/:slug` from shared-ui components and two new msd layout components (`PageSection`, `CardGrid`) so it matches the home page and has no page-specific CSS.

**Architecture:** Two small msd app-level React components own all page layout (band tone, 1280px container, card grid). Home switches its section wrappers to `PageSection`; the category page composes `PageSection` + `SectionHead` + `CardGrid` + `sky-action-field` + `md-secondary-tab` + existing cards. `packages/shared-ui` is not touched.

**Tech Stack:** React 19, Vite, Vitest + Testing Library (jsdom), Material Web (`md-*`), shared-ui LIT components (`sky-*`), Nx.

**Spec:** `docs/superpowers/specs/2026-09-24-msd-category-page-design.md`

**Rules for every task**
- Do NOT run `git stash`, `git reset`, `git checkout -- <file>` or any command that discards work. The user keeps real work in stashes.
- Do NOT edit anything under `packages/shared-ui`.
- CSS values are M3 tokens (`--md-sys-color-*`, `--md-sys-shape-*`) or layout lengths already used by home (16/20/32/48px, 272px, 1280px, 840px breakpoint).
- Commands run from the repo root: `C:\Sandeep New\Projects\Professional\skylabs\internal-projects\skylabs-monorepo`.
- Test command for one file: `npx vitest run --root apps/msd <path relative to apps/msd>`.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `apps/msd/src/app/components/page-section/page-section.tsx` | create | band tone + 1280px container |
| `apps/msd/src/app/components/page-section/page-section.css` | create | token-only styles for it |
| `apps/msd/src/app/components/page-section/page-section.test.tsx` | create | tests |
| `apps/msd/src/app/components/card-grid/card-grid.tsx` | create | responsive card list with `above` / `panel` / `fallback` |
| `apps/msd/src/app/components/card-grid/card-grid.css` | create | token-only styles |
| `apps/msd/src/app/components/card-grid/card-grid.test.tsx` | create | tests |
| `apps/msd/src/app/components/section-head/section-head.tsx` | modify | add `as` prop |
| `apps/msd/src/app/components/section-head/section-head.test.tsx` | modify | test `as="h1"` |
| `apps/msd/src/app/pages/home/*.tsx`, `home.css` | modify | use `PageSection`, drop band/container CSS |
| `apps/msd/src/content.json` | modify | new `category` keys |
| `apps/msd/src/app/pages/category/category.tsx` | modify | new composition, no `category.css` |
| `apps/msd/src/app/pages/category/category.test.tsx` | modify | tests for tabs, search, count, empty copy |
| `TASK.md` | modify | follow-up for the 5 pages still on `category.css` |

---

### Task 0: Commit the home 60/30/10 pass already in the working tree

The working tree already holds the earlier home color pass (home.css, home.tsx, category-tiles.tsx, home-offers.tsx, site-footer.css, content.json). Commit it first so later diffs stay readable.

- [ ] **Step 1: Check what is modified**

Run: `git status --short`
Expected: modified `apps/msd/src/app/components/site-footer/site-footer.css`, `apps/msd/src/app/pages/home/{category-tiles.tsx,home-offers.tsx,home.css,home.tsx}`, `apps/msd/src/content.json` (plus `.gitignore` and `.impeccable/`, which are NOT part of this commit).

- [ ] **Step 2: Commit only those six files**

```bash
git add apps/msd/src/app/components/site-footer/site-footer.css apps/msd/src/app/pages/home/category-tiles.tsx apps/msd/src/app/pages/home/home-offers.tsx apps/msd/src/app/pages/home/home.css apps/msd/src/app/pages/home/home.tsx apps/msd/src/content.json
git commit -m "style(msd): home 60/30/10 colour pass on M3 roles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: `PageSection`

**Files:**
- Create: `apps/msd/src/app/components/page-section/page-section.test.tsx`
- Create: `apps/msd/src/app/components/page-section/page-section.tsx`
- Create: `apps/msd/src/app/components/page-section/page-section.css`

- [ ] **Step 1: Write the failing test**

`apps/msd/src/app/components/page-section/page-section.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PageSection } from './page-section';

describe('PageSection', () => {
  it('renders a labelled section with the surface tone and a container', () => {
    render(
      <PageSection aria-labelledby="h">
        <h2 id="h">Deals</h2>
      </PageSection>,
    );
    const section = screen.getByRole('region', { name: 'Deals' });
    expect(section.tagName).toBe('SECTION');
    expect(section.className).toBe('page-section page-section--surface');
    expect(section.firstElementChild?.className).toBe('page-section__container');
  });

  it('applies tint, flush, stack and an extra class', () => {
    render(
      <PageSection tone="tint" flush stack className="home-hero" aria-label="Results">
        <p>one</p>
      </PageSection>,
    );
    const section = screen.getByRole('region', { name: 'Results' });
    expect(section.className).toBe('page-section page-section--tint page-section--flush home-hero');
    expect(section.firstElementChild?.className).toBe('page-section__container page-section__container--stack');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --root apps/msd src/app/components/page-section`
Expected: FAIL, `Failed to resolve import "./page-section"`.

- [ ] **Step 3: Write the component**

`apps/msd/src/app/components/page-section/page-section.tsx`:

```tsx
import type { ReactNode } from 'react';
import './page-section.css';

export interface PageSectionProps {
  /** Band colour role: `surface` (60, page base) or `tint` (30, surface-container). */
  tone?: 'surface' | 'tint';
  /** Shorter top padding, for a band that follows another band closely. */
  flush?: boolean;
  /** Lays direct children out as a vertical stack with a 16px gap. */
  stack?: boolean;
  className?: string;
  'aria-labelledby'?: string;
  'aria-label'?: string;
  children: ReactNode;
}

/** Full-bleed page band with the site's 1280px content column. Every msd page section uses it. */
export function PageSection({ tone = 'surface', flush = false, stack = false, className, children, ...aria }: PageSectionProps) {
  const classes = ['page-section', `page-section--${tone}`, flush && 'page-section--flush', className]
    .filter(Boolean)
    .join(' ');
  const container = stack ? 'page-section__container page-section__container--stack' : 'page-section__container';
  return (
    <section className={classes} {...aria}>
      <div className={container}>{children}</div>
    </section>
  );
}
```

`apps/msd/src/app/components/page-section/page-section.css`:

```css
/* msd page band. Colour split: surface = 60 (page base), tint = 30 (surface-container);
   primary (10) stays on actions inside the band. 840px = M3 expanded window class. */
.page-section {
  padding-block: 32px;
}
.page-section--surface {
  background-color: var(--md-sys-color-surface);
}
.page-section--tint {
  background-color: var(--md-sys-color-surface-container);
}
.page-section--flush {
  padding-block: 16px 32px;
}
.page-section__container {
  box-sizing: border-box;
  inline-size: 100%;
  max-inline-size: 1280px;
  margin-inline: auto;
  padding-inline: 16px;
}
.page-section__container--stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
@media (min-width: 840px) {
  .page-section:not(.page-section--flush) {
    padding-block: 48px;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --root apps/msd src/app/components/page-section`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/msd/src/app/components/page-section
git commit -m "feat(msd): PageSection layout component

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `CardGrid`

**Files:**
- Create: `apps/msd/src/app/components/card-grid/card-grid.test.tsx`
- Create: `apps/msd/src/app/components/card-grid/card-grid.tsx`
- Create: `apps/msd/src/app/components/card-grid/card-grid.css`

- [ ] **Step 1: Write the failing test**

`apps/msd/src/app/components/card-grid/card-grid.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CardGrid } from './card-grid';

describe('CardGrid', () => {
  it('wraps each child in a list item', () => {
    render(
      <CardGrid>
        <article key="a">A</article>
        <article key="b">B</article>
      </CardGrid>,
    );
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('A');
  });

  it('shows the fallback instead of the list', () => {
    render(
      <CardGrid fallback={<p>Loading</p>}>
        <article key="a">A</article>
      </CardGrid>,
    );
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText('Loading')).toBeTruthy();
  });

  it('renders above content first and wraps the grid in a tabpanel', () => {
    render(
      <CardGrid above={<div role="tablist" />} panel={{ id: 'p', labelledBy: 'tab-all' }}>
        <article key="a">A</article>
      </CardGrid>,
    );
    const panel = screen.getByRole('tabpanel');
    expect(panel.id).toBe('p');
    expect(panel.getAttribute('aria-labelledby')).toBe('tab-all');
    expect(within(panel).getByRole('list')).toBeTruthy();
    const tablist = screen.getByRole('tablist');
    expect(tablist.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --root apps/msd src/app/components/card-grid`
Expected: FAIL, `Failed to resolve import "./card-grid"`.

- [ ] **Step 3: Write the component**

`apps/msd/src/app/components/card-grid/card-grid.tsx`:

```tsx
import { Children, type ReactNode } from 'react';
import './card-grid.css';

export interface CardGridProps {
  /** Content before the grid (e.g. tabs, status messages). */
  above?: ReactNode;
  /** Wraps the grid in a tabpanel when `above` holds tabs that control it. */
  panel?: { id: string; labelledBy?: string };
  /** Shown instead of the list (loading, error, empty). */
  fallback?: ReactNode;
  children?: ReactNode;
}

/** Responsive card grid: 272px minimum columns (the card rail's slide width), equal-height rows. */
export function CardGrid({ above, panel, fallback, children }: CardGridProps) {
  const body = fallback ?? (
    // list-style: none drops list semantics in Safari; the explicit role restores them.
    // eslint-disable-next-line jsx-a11y/no-redundant-roles
    <ul className="card-grid__list" role="list">
      {Children.map(children, (child) => (
        <li className="card-grid__item">{child}</li>
      ))}
    </ul>
  );
  return (
    <div className="card-grid">
      {above}
      {panel ? (
        <div role="tabpanel" id={panel.id} aria-labelledby={panel.labelledBy}>
          {body}
        </div>
      ) : (
        body
      )}
    </div>
  );
}
```

`apps/msd/src/app/components/card-grid/card-grid.css`:

```css
/* Card grid. 272px = card-rail slide width, so grid and rail cards match. 840px = M3 expanded. */
.card-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
/* Tabs above the grid sit on the band's own tone. */
.card-grid > md-tabs {
  background-color: transparent;
  --md-secondary-tab-container-color: transparent;
}
.card-grid__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(272px, 100%), 1fr));
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.card-grid__item {
  display: flex;
  min-inline-size: 0;
}
.card-grid__item > * {
  flex: 1;
  min-inline-size: 0;
}
@media (min-width: 840px) {
  .card-grid__list {
    gap: 20px;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --root apps/msd src/app/components/card-grid`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/msd/src/app/components/card-grid
git commit -m "feat(msd): CardGrid layout component

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `SectionHead` `as` prop

**Files:**
- Modify: `apps/msd/src/app/components/section-head/section-head.tsx`
- Test: `apps/msd/src/app/components/section-head/section-head.test.tsx`

- [ ] **Step 1: Add the failing test** (append inside the `describe` block, after the last `it`)

```tsx
  it('renders an h1 when as="h1"', () => {
    renderHead(<SectionHead as="h1" id="page-heading" heading="Hair & Nails" titleClassName="headline-large" />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Hair & Nails' });
    expect(h1.id).toBe('page-heading');
    expect(h1.className).toBe('section-head__title headline-large');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --root apps/msd src/app/components/section-head`
Expected: FAIL, unable to find a level-1 heading (and a TS error on the unknown `as` prop).

- [ ] **Step 3: Implement**

In `section-head.tsx`, add to `SectionHeadProps` after `id`:

```tsx
  /** Heading level; `h1` for a page header row. */
  as?: 'h1' | 'h2';
```

Change the signature and the heading line:

```tsx
export function SectionHead({ id, as: Heading = 'h2', heading, titleClassName = 'headline-small', subheading, seeAll, seeAllTo, actions }: SectionHeadProps) {
```

```tsx
        <Heading id={id} className={`section-head__title ${titleClassName}`}>{heading}</Heading>
```

Update the doc comment above the function to: `/** Section header row: h2 (or h1 via \`as\`) + optional subheading, See all link and actions. */`

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --root apps/msd src/app/components/section-head`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/msd/src/app/components/section-head
git commit -m "feat(msd): SectionHead renders an h1 via the as prop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Home uses `PageSection`

**Files:**
- Modify: `apps/msd/src/app/pages/home/home-hero.tsx`, `category-tiles.tsx`, `deals-near-you.tsx`, `how-it-works.tsx`, `home-offers.tsx`, `treatment-directory.tsx`, `home-faq.tsx`, `home.tsx`, `home.css`
- Test: existing `home.test.tsx`, `home-data.test.tsx`, `apps/msd/src/hydration.test.tsx`

This is a refactor: the existing tests are the safety net. Each file adds `import { PageSection } from '../../components/page-section/page-section';`.

- [ ] **Step 1: Run the home + hydration tests before touching anything**

Run: `npx vitest run --root apps/msd src/app/pages/home src/hydration.test.tsx`
Expected: PASS (record the count).

- [ ] **Step 2: Replace the wrappers**

`home-hero.tsx`: replace
```tsx
    <section className="home-hero" aria-labelledby="hero-heading">
      <div className="home-container home-hero__inner">
```
with
```tsx
    <PageSection className="home-hero" aria-labelledby="hero-heading">
      <div className="home-hero__inner">
```
and the matching closing `</div>\n    </section>` at the end with `</div>\n    </PageSection>`.

`category-tiles.tsx`: `<section className="home-band" aria-labelledby="category-heading">` + `<div className="home-container">` → `<PageSection aria-labelledby="category-heading">`; drop the inner `</div>` and change `</section>` to `</PageSection>`.

`deals-near-you.tsx`: `<section className="home-band home-band--tint" aria-labelledby="deals-heading">` + `<div className="home-container">` → `<PageSection tone="tint" aria-labelledby="deals-heading">`; drop the inner `</div>`, `</section>` → `</PageSection>`.

`how-it-works.tsx`: `<section className="home-band" aria-labelledby="how-heading">` + `<div className="home-container">` → `<PageSection aria-labelledby="how-heading">`; same closing change.

`treatment-directory.tsx`: `<section className="home-band" aria-labelledby="treatments-heading">` + `<div className="home-container">` → `<PageSection aria-labelledby="treatments-heading">`; same closing change.

`home-faq.tsx`: replace
```tsx
    <section className="home-band home-band--tint" aria-labelledby="faq-heading">
      <div className="home-container home-faq">
```
with
```tsx
    <PageSection tone="tint" aria-labelledby="faq-heading">
      <div className="home-faq">
```
and `</section>` → `</PageSection>` (keep the inner `</div>`).

`home-offers.tsx`: replace
```tsx
    <section className="home-band" aria-labelledby="offers-heading">
      <div className={`home-container home-offers${isAuthenticated ? ' home-offers--member' : ''}`}>
```
with
```tsx
    <PageSection aria-labelledby="offers-heading">
      <div className={`home-offers${isAuthenticated ? ' home-offers--member' : ''}`}>
```
and `</section>` → `</PageSection>` (keep the inner `</div>`).

`home.tsx`: three sections.
- `<section className="home-band home-band--tint" aria-labelledby="therapists-heading">` + `<div className="home-container">` → `<PageSection tone="tint" aria-labelledby="therapists-heading">`
- `<section className="home-band home-band--tint" aria-labelledby="products-heading">` + `<div className="home-container">` → `<PageSection tone="tint" aria-labelledby="products-heading">`
- `<section className="home-band home-band--flush" aria-labelledby="partner-heading">` + `<div className="home-container">` → `<PageSection flush aria-labelledby="partner-heading">`
For each, drop the inner `</div>` and change `</section>` → `</PageSection>`.

- [ ] **Step 3: Remove the now-unused CSS from `home.css`**

Delete these rules:
```css
.home-container {
  box-sizing: border-box;
  inline-size: 100%;
  max-inline-size: 1280px;
  margin-inline: auto;
  padding-inline: 16px;
}
.home-band {
  padding-block: 32px;
}
.home-band--tint {
  background-color: var(--md-sys-color-surface-container);
}
.home-band--flush {
  padding-block: 16px 32px;
}
```
```css
/* Hero */
.home-hero {
  padding-block: 32px;
  background-color: var(--md-sys-color-surface);
}
```
(keep the `/* Hero */` comment above `.home-hero__inner`), and inside `@media (min-width: 840px)` delete:
```css
  .home-band {
    padding-block: 48px;
  }
  .home-hero {
    padding-block: 48px;
  }
```
Replace the colour-split comment at the top of `home.css` with:
```css
   Bands, container and the 60/30/10 band tones come from PageSection (page-section.css).
   Inside bands: secondary-container = category tiles, step markers, gift card (30);
   primary = actions only (10). */
```
(keep the first two comment lines about colours/type and breakpoints).

- [ ] **Step 4: Confirm nothing still references the removed classes**

Run: `grep -rn "home-band\|home-container" apps/msd/src`
Expected: no output.

- [ ] **Step 5: Run the home + hydration tests**

Run: `npx vitest run --root apps/msd src/app/pages/home src/hydration.test.tsx`
Expected: PASS, same count as Step 1.

- [ ] **Step 6: Commit**

```bash
git add apps/msd/src/app/pages/home
git commit -m "refactor(msd): home sections use PageSection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Category copy in `content.json`

**Files:**
- Modify: `apps/msd/src/content.json` (the top-level `"category"` object, which starts with `"sortOptions"`)

- [ ] **Step 1: Add the keys**

In the top-level `category` object, directly after `"searchLabel": "Search",` insert:

```json
    "search": {
      "placeholder": "Search {category}",
      "action": "Search"
    },
    "tabsLabel": "Filter by sub-category",
    "resultCount": {
      "therapist": { "singular": "therapist", "plural": "therapists" },
      "product": { "singular": "product", "plural": "products" }
    },
    "emptyTherapists": {
      "heading": "No therapists yet",
      "subheading": "Check back soon."
    },
    "therapistPricePrefix": "From",
```

- [ ] **Step 2: Validate**

Run: `node -e "const c=require('./apps/msd/src/content.json').category; console.log(c.search.placeholder, c.tabsLabel, c.resultCount.therapist.plural, c.emptyTherapists.heading, c.therapistPricePrefix)"`
Expected: `Search {category} Filter by sub-category therapists No therapists yet From`

- [ ] **Step 3: Commit**

```bash
git add apps/msd/src/content.json
git commit -m "content(msd): category page search, tabs, counts and empty copy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Category page composition

**Files:**
- Modify: `apps/msd/src/app/pages/category/category.tsx`
- Test: `apps/msd/src/app/pages/category/category.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `category.test.tsx` (end of file):

```tsx
describe('Category page layout', () => {
  it('renders secondary tabs that control the results panel', async () => {
    renderAt('/category/massage');
    await waitFor(() => expect(document.querySelectorAll('md-secondary-tab')).toHaveLength(3));
    expect(document.getElementById('category-tab-all')).toBeTruthy();
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('category-tab-all');
  });

  it('searches on sky-submit, not on every keystroke', async () => {
    renderAt('/category/massage');
    await screen.findByRole('heading', { level: 1, name: 'Massage' });
    await waitFor(() => expect(listCatalogDealsMock).toHaveBeenCalled());
    const field = document.querySelector('sky-action-field') as HTMLElement;
    expect(field.getAttribute('role')).toBe('search');
    act(() => {
      field.dispatchEvent(new CustomEvent('sky-submit', { detail: { value: 'swedish' } }));
    });
    await waitFor(() => expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]?.search).toBe('swedish'));
  });

  it('announces the result count from content', async () => {
    renderAt('/category/massage');
    expect(await screen.findByText(`0 ${content.category.dealCount.plural}`)).toBeTruthy();
  });

  it('uses the therapist empty copy from content', async () => {
    getCatalogCategoryMock.mockResolvedValue({ data: { ...CATEGORY, type: 'THERAPY' } });
    renderAt('/category/massage');
    await waitFor(() => {
      const card = document.querySelector('sky-info-card') as (HTMLElement & { heading?: string }) | null;
      expect(card?.getAttribute('heading') ?? card?.heading).toBe(content.category.emptyTherapists.heading);
    });
    expect(await screen.findByText(`0 ${content.category.resultCount.therapist.plural}`)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --root apps/msd src/app/pages/category`
Expected: the 4 new tests FAIL (no `md-secondary-tab`, no `sky-action-field`, count text `0 deals` inside old markup may pass; the therapist heading is `No therapists yet` hardcoded so it may pass too). At least the tabs and search tests must fail. Existing tests PASS.

- [ ] **Step 3: Update imports at the top of `category.tsx`**

Replace
```tsx
import { useEffect, useRef, useState } from 'react';
```
with
```tsx
import { createElement, useEffect, useRef, useState, type ReactNode } from 'react';
```
Replace the shared-ui import block
```tsx
import {
  Icon,
  Tabs,
  PrimaryTab,
  OutlinedTextField,
  FilledButton,
  OutlinedButton,
} from '@skylabs-monorepo/shared-ui/react';
```
with
```tsx
import { Icon, Tabs, FilledButton, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
```
Delete the line `import './category.css';`. After `import { Breadcrumb } from '../../components/breadcrumb';` add:
```tsx
import { CardGrid } from '../../components/card-grid/card-grid';
import { PageSection } from '../../components/page-section/page-section';
import { SectionHead } from '../../components/section-head/section-head';
import { useCustomEvent } from '../../../hooks/use-custom-event';
```

- [ ] **Step 4: Add module-level helpers** (directly after `import content from '../../../content.json';`)

```tsx
const t = content.category;
const PANEL_ID = 'category-results';
const tabId = (id: string) => `category-tab-${id}`;

/** Raw `md-secondary-tab` so `id`/`aria-controls`/`active` render as attributes (same reason as
 *  home's DealsTab: the @lit/react wrapper sets `id` as a property only in the browser build). */
function SubcategoryTab({ id, active, children }: { id: string; active: boolean; children: ReactNode }) {
  return createElement('md-secondary-tab', { id: tabId(id), 'aria-controls': PANEL_ID, active }, children);
}

/** Search field. Its own component so `useCustomEvent` attaches when the element mounts
 *  (the page renders it only after the category loads). */
function SearchField({ placeholder, onSearch }: { placeholder: string; onSearch: (query: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  useCustomEvent<{ value: string }>(ref, 'sky-submit', (e) => onSearch(e.detail.value));
  return (
    <sky-action-field
      ref={ref}
      role="search"
      type="search"
      enterkeyhint="search"
      icon="search"
      variant="outlined"
      dense
      label={t.searchLabel}
      placeholder={placeholder}
      action-label={t.search.action}
    />
  );
}
```

Update the `Category` doc comment line `Reuses \`category.css\` and the existing` → `Composes PageSection, SectionHead and CardGrid with the existing`.

- [ ] **Step 5: Replace everything from the not-found branch to the end of the component**

Replace from the line
```tsx
  if (categoryError || !category || cityMissing) {
```
down to (and including) the component's final
```tsx
    </div>
  );
}
export default Category;
```
with:

```tsx
  if (categoryError || !category || cityMissing) {
    return (
      <PageSection stack aria-label={t.notFound.heading}>
        <Seo title={t.notFound.metaTitle} description={t.notFound.subheading} path={categoryHref(slug)} noindex />
        <sky-info-card icon="search_off" heading={t.notFound.heading} subheading={categoryError || t.notFound.subheading} />
        <div>
          <FilledButton onClick={() => navigate('/categories')}>{t.notFound.cta}</FilledButton>
        </div>
      </PageSection>
    );
  }
  // Product and therapist listings can't be filtered by city, so a city URL on those categories
  // shows the plain category page (noindexed) rather than a thin "X in City" duplicate.
  const cityFilterable = category.type !== 'PRODUCT' && category.type !== 'THERAPY';
  const activeCity = cityFilterable ? cityLocation : undefined;
  const displayName = activeCity
    ? t.cityTitleTemplate.replace('{category}', category.name).replace('{city}', activeCity.city)
    : category.name;
  const description = activeCity
    ? t.cityMetaDescriptionTemplate.replace('{category}', category.name).replace('{city}', activeCity.city)
    : (category.description ?? t.metaDescriptionTemplate.replace('{category}', category.name));
  const path = activeCity ? cityHref(category.slug, activeCity.city) : categoryHref(category.slug);
  const crumbs = [
    { name: t.breadcrumb.home, path: '/' },
    { name: t.breadcrumb.categories, path: '/categories' },
    { name: category.name, path: categoryHref(category.slug) },
    ...(activeCity ? [{ name: activeCity.city, path }] : []),
  ];

  const count = isTherapyCategory ? therapists.length : isProductCategory ? products.length : deals.length;
  const noun = isTherapyCategory ? t.resultCount.therapist : isProductCategory ? t.resultCount.product : t.dealCount;
  const countText = dealsLoading ? '' : `${count} ${count === 1 ? noun.singular : noun.plural}`;
  const empty = isTherapyCategory ? t.emptyTherapists : t.emptyDeals;
  const fallback = dealsLoading ? (
    <p className="loading-state">{t.loadingDeals}</p>
  ) : dealsError ? (
    <p className="error-state" role="alert">{dealsError}</p>
  ) : count === 0 ? (
    <sky-info-card icon="sentiment_dissatisfied" heading={empty.heading} subheading={empty.subheading} />
  ) : undefined;

  const tabs =
    category.children.length > 0 ? (
      <Tabs
        aria-label={t.tabsLabel}
        onChange={(e) => setSubcategoryIdx((e.target as unknown as { activeTabIndex: number }).activeTabIndex)}
      >
        {[{ id: 'all', name: t.tabs.all }, ...category.children].map((tab, i) => (
          <SubcategoryTab key={tab.id} id={tab.id} active={subcategoryIdx === i}>
            {tab.name}
          </SubcategoryTab>
        ))}
      </Tabs>
    ) : null;

  const cards = isTherapyCategory
    ? therapists.map((therapist) => {
        const price = therapistFromPrice(therapist);
        return (
          <SkyProductCardWC
            key={therapist.id}
            image={primaryImage(resolveTherapistMedia(therapist))}
            eyebrow={therapist.personName}
            eyebrowHref={therapist.vendor?.slug ? `/vendor/${therapist.vendor.slug}` : undefined}
            heading={therapist.therapistType}
            location={therapist.branch?.city ?? undefined}
            distance={therapist.distanceKm != null ? `${Math.round(therapist.distanceKm * 10) / 10} km` : undefined}
            tag={therapist.popularTags?.[0]?.name}
            pricePrefix={price != null ? t.therapistPricePrefix : undefined}
            price={price != null ? formatINR(price) : undefined}
            href={`/therapist/${therapist.id}`}
          />
        );
      })
    : isProductCategory
      ? products.map((product) => (
          <DealCard
            key={product.id}
            deal={{
              id: product.id,
              title: product.name,
              image: primaryImage(resolveProductMedia(product)) ?? '',
              imageAlt: product.imageAlt ?? '',
              gallery: resolveProductMedia(product).images,
              badge: t.offeringLabels.product,
              providerName: product.vendor?.businessName ?? '',
              price: Number(product.price),
              originalPrice:
                product.originalPrice && Number(product.originalPrice) !== Number(product.price)
                  ? Number(product.originalPrice)
                  : undefined,
              discount: product.discount ?? undefined,
              tag: product.popularTags?.[0]?.name,
            }}
            href={`/products/${product.id}`}
            eyebrowHref={product.vendor?.slug ? `/vendor/${product.vendor.slug}` : undefined}
            favoriteActive={false}
            onFavorite={() => {}}
            actions={
              <FilledButton onClick={() => addProductToCart(product)}>
                <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>
                {t.actions.addToCart}
              </FilledButton>
            }
          />
        ))
      : deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={{
              id: deal.id,
              title: deal.title,
              image: primaryImage(resolveDealMedia(deal)) ?? '',
              imageAlt: '',
              gallery: resolveDealMedia(deal).images,
              badge: t.offeringLabels.service,
              providerName: [deal.vendor?.businessName, deal.branch?.name].filter(Boolean).join(' · '),
              location: deal.branch?.city ?? undefined,
              distance: deal.distanceKm != null ? Math.round(deal.distanceKm * 10) / 10 : undefined,
              price: Number(deal.salePrice),
              originalPrice:
                deal.originalPrice && Number(deal.originalPrice) !== Number(deal.salePrice)
                  ? Number(deal.originalPrice)
                  : undefined,
              discount: deal.discountPercent ? Number(deal.discountPercent) : undefined,
              priceNote: deal.durationMinutes ? `${deal.durationMinutes} ${t.durationSuffix}` : undefined,
              tag: deal.popularTags?.[0]?.name,
            }}
            eyebrowHref={deal.vendor?.slug ? `/vendor/${deal.vendor.slug}` : undefined}
            favoriteActive={signedIn && isWishlisted(deal.id)}
            onFavorite={() => toggleFavorite(deal)}
            actions={
              <DealAddToCartDialog
                deal={deal}
                onAdded={(label) => setActionMessage(t.messages.addToCartSuccess.replace('{item}', label))}
                renderTrigger={(open) => (
                  <OutlinedButton
                    onClick={() => {
                      if (requireAuthOrRedirect()) open();
                    }}
                  >
                    <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>
                    {t.actions.addToCart}
                  </OutlinedButton>
                )}
              />
            }
          />
        ));

  return (
    <>
      <Seo
        title={`${displayName}${t.metaTitleSuffix}`}
        description={description}
        path={path}
        noindex={!!citySlugParam && !activeCity}
        jsonLd={SITE_URL ? breadcrumbJsonLd(SITE_URL, crumbs) : undefined}
      />
      <PageSection stack aria-labelledby="category-heading">
        <Breadcrumb
          items={[
            { label: t.breadcrumb.home, to: '/' },
            { label: t.breadcrumb.categories, to: '/categories' },
            activeCity ? { label: category.name, to: categoryHref(category.slug) } : { label: category.name },
            ...(activeCity ? [{ label: activeCity.city }] : []),
          ]}
        />
        <SectionHead
          as="h1"
          id="category-heading"
          titleClassName="headline-large"
          heading={displayName}
          subheading={category.description ?? undefined}
          actions={
            <>
              <span className="body-medium" aria-live="polite" aria-atomic="true">
                {countText}
              </span>
              <SearchField placeholder={t.search.placeholder.replace('{category}', category.name)} onSearch={setSearch} />
            </>
          }
        />
      </PageSection>
      <PageSection tone="tint" aria-label={`${category.name} ${t.dealsAriaLabelSuffix}`}>
        <CardGrid
          above={
            <>
              {tabs}
              {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}
              {actionError && <p className="error-state" role="alert">{actionError}</p>}
            </>
          }
          panel={tabs ? { id: PANEL_ID, labelledBy: tabId(activeSubcategory?.id ?? 'all') } : undefined}
          fallback={fallback}
        >
          {cards}
        </CardGrid>
      </PageSection>
    </>
  );
}
export default Category;
```

Also in the loading branch just above, change `content.category.loading` to `t.loading` (leave the element as is).

- [ ] **Step 5b: Point the existing count helper at the new markup**

In `category.test.tsx` (around line 247) replace
```tsx
  const countText = () => document.querySelector('.category-page__count')?.textContent;
```
with
```tsx
  const countText = () =>
    document.getElementById('category-heading')?.closest('.section-head')?.querySelector('[aria-live]')?.textContent;
```
If a test using `countText()` expected `'…'` while loading, change that expectation to `''` (the loading placeholder is now empty; the grid shows the loading message).

- [ ] **Step 6: Run the category tests**

Run: `npx vitest run --root apps/msd src/app/pages/category`
Expected: PASS, all tests (the 4 new ones plus every existing `?sub=`, city and prerender test).

If an existing test looked for `.category-page` or `PrimaryTab`, update only that selector to the new markup (`section[aria-labelledby="category-heading"]`, `md-secondary-tab`) and keep its assertion.

- [ ] **Step 7: Confirm the page no longer uses category.css classes**

Run: `grep -n "category-page\|category.css" apps/msd/src/app/pages/category/category.tsx`
Expected: no output.

- [ ] **Step 8: Lint the changed files**

Run: `npx eslint apps/msd/src/app/pages/category/category.tsx apps/msd/src/app/components/page-section apps/msd/src/app/components/card-grid apps/msd/src/app/components/section-head`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/msd/src/app/pages/category/category.tsx apps/msd/src/app/pages/category/category.test.tsx
git commit -m "feat(msd): category page composed from PageSection, SectionHead and CardGrid

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verify and record the follow-up

**Files:**
- Modify: `TASK.md` (section `### msd shell — follow-ups`)

- [ ] **Step 1: Full msd tests + prerender hydration**

Run: `npx nx run msd:test --skip-nx-cache`
Expected: all tests pass except the 3 known failures in `app.spec.tsx` and `otp.test.tsx` that fail on the pre-change tree too. Any other failure is a regression: fix it before continuing.

- [ ] **Step 2: Build**

Run: `npx nx build msd`
Expected: build succeeds.

- [ ] **Step 3: Visual check** (dev server on 4200 must be restarted if it was running before these changes)

Open `http://localhost:4200/category/hair-nails` and `http://localhost:4200/` at 1440×900 and at 390×844 (mobile emulation). Check:
- breadcrumb, h1, tabs and the first grid card share one left edge;
- the header band is `surface`, the results band is `surface-container`; no gradient;
- search sits right of the title on desktop and wraps under it on mobile; Enter runs the search;
- cards in a row have equal height, nothing is cut off; no horizontal scroll (`document.documentElement.scrollWidth === innerWidth`);
- home looks unchanged from before Task 4;
- dark theme (`document.documentElement.className = 'dark'`) keeps contrast.
Fix anything off in the component CSS (Tasks 1-2), never in page CSS.

- [ ] **Step 4: Impeccable detector**

Run: `"C:/Users/sande/.claude/plugins/cache/impeccable/impeccable/4.3.1/skills/impeccable/scripts/impeccable" detect --json apps/msd/src/app/pages/category apps/msd/src/app/components/page-section apps/msd/src/app/components/card-grid`
Expected: `[]`.

- [ ] **Step 5: Record the follow-up in `TASK.md`**

Append under `### msd shell — follow-ups`:

```markdown
- [ ] msd: move /categories, therapists, orders, invoices and payments off `category.css` onto PageSection/CardGrid, then delete `category.css`
```

- [ ] **Step 6: Commit**

```bash
git add TASK.md
git commit -m "docs: follow-up to retire category.css

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
