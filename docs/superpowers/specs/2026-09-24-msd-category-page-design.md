# msd category page: align with the home page

Date: 2026-09-24
App: `apps/msd` (React 19 + Vite)
Example route: `/category/hair-nails` (also `/category/:slug/:city`)

## Problem

The category page was built separately from the redesigned home page and drifted from it:

- Gradient hero (`primary-container` → `secondary-container`) with a generic `category` icon breaks the home page's 60/30/10 split (flat M3 surfaces, primary kept for actions).
- Four stacked strips (breadcrumb, hero, tabs, search) each with its own tone and a 1px border.
- Mixed widths and gutters: 1280px vs 1200px containers, 20px vs home's 16px, so tabs, search and grid never line up.
- Hardcoded values in `category.css` (`0.8rem`, `clamp(1.6rem…)`, `72px`, `20px` radii) instead of M3 type classes and shape tokens.
- Different components from home: `OutlinedTextField` instead of `sky-action-field`, `PrimaryTab` instead of `md-secondary-tab`.
- Grid cards clip at narrow widths; a few strings are hardcoded in the TSX.

## Constraints

- `packages/shared-ui` stays common components only. mera-driver consumes it with a different design, so no msd layout goes there.
- Pages contain composition only: no page-specific CSS file, no hardcoded colors, sizes or copy.
- Layout primitives live in msd at app level (`apps/msd/src/app/components/`), next to `SectionHead`, `CardRail` and `DealCard`.
- Every visual value is an M3 system token (`--md-sys-color-*`, `--md-sys-shape-*`, typescale classes from `theme/base.css`).

## Building blocks (new or extended, msd app level)

### `PageSection` (`components/page-section/`)

Renders `<section>` → band → container.

- Container: `max-inline-size: 1280px`, `padding-inline: 16px`, centered (the values `.home-container` uses today).
- Band padding: 32px block, 48px from 840px (M3 expanded).
- Props:
  - `tone?: 'surface' | 'tint'` (default `surface`). `tint` = `--md-sys-color-surface-container`.
  - `flush?: boolean`: 16px top / 32px bottom (home's current `--flush`).
  - `stack?: boolean`: the container becomes a 16px-gap vertical stack (for a section with several direct children, e.g. breadcrumb + header).
  - `className?` (on the `<section>`), plus `aria-labelledby` / `aria-label` passed to the `<section>`.
- Stylesheet: `page-section.css`, token-only.

### `CardGrid` (`components/card-grid/`)

- `<ul role="list">` with `grid-template-columns: repeat(auto-fill, minmax(min(272px, 100%), 1fr))`, gap 16px (20px from 840px).
- 272px matches the card rail slide width, so grid cards and rail cards are the same size.
- Each child is wrapped in `<li>` that stretches its card to full height (equal-height rows, fixes clipping).
- Same shape as `CardRail`: `above?` (content between section start and the grid, e.g. tabs and cart messages), `panel?: { id, labelledBy }` (wraps the grid in a `tabpanel`), plus `fallback?` (loading / error / empty node shown instead of the list) and `children`.
- `md-tabs` placed in `above` get a transparent container so they sit on the band's tone.
- Stylesheet: `card-grid.css`, token-only.

### `SectionHead` (existing)

- Add `as?: 'h1' | 'h2'` (default `h2`), so the page title uses the same header row as home sections.
- `subheading` stays a string. The live count gets its own polite `aria-live` region on the page, placed in the `actions` slot.

## Category page composition

Top to bottom:

1. **Header** (`PageSection stack`, labelled by the h1):
   - existing `Breadcrumb`;
   - `SectionHead as="h1" titleClassName="headline-large"`: title = category name (or "{category} in {city}"), subheading = category description (when present), actions = result count (`aria-live="polite"`) + search.
   - Search: `sky-action-field` with `role="search"`, `type="search"`, `icon="search"`, `variant="outlined"`, `dense`, `action-label` from content (measured 341px wide in the actions row). It fires on `sky-submit` (Enter or button), not on every keystroke. It lives in a small local `SearchField` component so `useCustomEvent` attaches when the element mounts (the page returns early while loading).
2. **Results** (`PageSection tone="tint"`, `aria-label` = "{category} deals" as today):
   - `above`: subcategory tabs (only when the category has children), shared-ui `Tabs` with raw `md-secondary-tab` children, the same pattern as home's `DealsNearYou` (`id`/`aria-controls` rendered as attributes). "All" plus one tab per subcategory. The `?sub=<slug>` query param stays the source of truth. Cart feedback messages follow the tabs.
   - `CardGrid` of
   - SERVICE / legacy: `DealCard` with the add-to-cart dialog action (unchanged props),
   - PRODUCT: `DealCard` with the add-to-cart button (unchanged),
   - THERAPY: `SkyProductCardWC` (unchanged props).
   - The tab panel wraps the grid (`role="tabpanel"`, `aria-labelledby` = active tab id) when tabs exist.
3. **States**:
   - loading: existing global `loading-state` paragraph;
   - error: `error-state` alert (global class);
   - empty: `sky-info-card` (deals/products copy existing; therapists copy moves to `content.json`);
   - not found / unknown city: `PageSection stack` with `sky-info-card` + `FilledButton` to `/categories`, `noindex` as today.

## Content

Move to `content.json` → `category`:

- `resultCount.therapist.{singular,plural}`, `resultCount.product.{singular,plural}` (deals already have `dealCount`),
- `emptyTherapists.{heading,subheading}`,
- reuse existing `actions.addToCart` and `messages.addToCartSuccess` for the deal add-to-cart button and message (today hardcoded),
- `tabsLabel` ("Filter by sub-category"),
- `therapistPricePrefix` ("From"),
- `search.{placeholder,action}` for the action field (the existing `searchLabel` is reused as the label).

## Removals

- Remove the `category.css` import (and every `category-page__*` class) from the category page. The file itself stays: `/categories`, therapists, orders, invoices and payments still import it. Migrating those five pages to `PageSection` / `CardGrid` is a recorded follow-up in `TASK.md`, not part of this change.
- Home: replace every `home-band` / `home-container` wrapper with `PageSection` (`tint` where `home-band--tint` was, `flush` for the partner banner). Remove `.home-container`, `.home-band`, `.home-band--tint`, `.home-band--flush` from `home.css`. The hero becomes `PageSection className="home-hero"` (band padding from `PageSection`) with its `home-hero__inner` grid as the child. Home's section-specific rules (hero, spotlight, cats, steps, offers, directory, faq, skeleton) stay as they are.

## Unchanged

Data fetching and its effects, prerender payload and hydration path, background refresh, city resolution rules, SEO / canonical / `noindex` / breadcrumb JSON-LD, wishlist and cart behavior, add-to-cart dialogs.

## Testing

- `page-section.test.tsx`: renders a section with the tone class, forwards `aria-labelledby`, `stack` and `flush` classes.
- `card-grid.test.tsx`: one `li` per child, `fallback` replaces the list, `panel` wraps it in a tabpanel after `above`.
- `section-head` test: `as="h1"` renders a level-1 heading.
- `category.test.tsx`: update for `md-secondary-tab` (tab click sets `?sub=`), search fires on `sky-submit`, count text from content, empty therapist copy from content.
- Existing home tests and `hydration.test.tsx` pass unchanged (band swap must not change markup semantics: same sections, same headings, same labels).
- Visual check: `/category/hair-nails` and `/` at 1440px and 390px; tabs, search and grid share one left edge; no horizontal scroll; light and dark.
- Impeccable detector on changed files.
