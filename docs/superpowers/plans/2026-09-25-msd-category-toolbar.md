# msd Category Toolbar, Lazy Loading and Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/category/:slug` a Groupon-style header (h1 + total, clamped description, subcategory pills) and toolbar (filters, location, search, map, sort), load cards 12 at a time, and add a free Leaflet map (Google kept behind an env switch) that also fixes the explore map.

**Architecture:** Small msd app-level components (`ClampText`, `ChipNav`, `ListingToolbar`, `ChoiceMenu`, `LoadMore`, `PriceFilterDialog`, `DealMap`) and one hook (`usePagedList`) built from shared-ui M3 components; the category page only composes them. Paging state lives in `usePagedList`; URL params (`sub`, `sort`, `min`, `max`) hold the view.

**Tech Stack:** React 19, React Router 6, Vitest + Testing Library (jsdom), Material Web via `@skylabs-monorepo/shared-ui/react`, Leaflet 1.9.4 (already a root dependency), `@react-google-maps/api` (kept).

**Spec:** `docs/superpowers/specs/2026-09-25-msd-category-toolbar-design.md`

**Rules for every task**
- NEVER run `git stash`, `git reset`, `git checkout -- <file>`, `git clean`, or anything that discards work. The user keeps real work in stashes.
- Do NOT edit `packages/shared-ui`.
- `git add` only the files the task names (`.gitignore` and `.impeccable/` have unrelated changes; never stage them).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` exactly.
- Commands run from the repo root `C:\Sandeep New\Projects\Professional\skylabs\internal-projects\skylabs-monorepo`. One test file: `npx vitest run --root apps/msd <path relative to apps/msd>`.
- CSS: M3 tokens only (`--md-sys-color-*`, `--md-sys-shape-*`, `--md-sys-state-*`, `--sky-elevation-*`); lengths 2/4/8/12/16/20/24/32/48px, 272px, 480px, 600px; breakpoints 600px / 840px.
- jsdom note: shared-ui React wrappers register the `md-*` elements, so React 19 may set `label`/`selected`/`value` as **properties** instead of attributes. Tests read `el.prop ?? el.getAttribute('prop')`.

## File map

| File | Action |
|---|---|
| `apps/msd/src/content.json` | modify (`category` keys) |
| `apps/msd/src/app/components/page-section/page-section.css` | modify (stack children lose outer margins) |
| `apps/msd/src/app/components/section-head/section-head.tsx` (+test) | modify (`subheading` accepts a node) |
| `apps/msd/src/app/components/clamp-text/{clamp-text.tsx,clamp-text.css,clamp-text.test.tsx}` | create |
| `apps/msd/src/app/components/chip-nav/{chip-nav.tsx,chip-nav.css,chip-nav.test.tsx}` | create |
| `apps/msd/src/app/components/listing-toolbar/{listing-toolbar.tsx,listing-toolbar.css,listing-toolbar.test.tsx}` | create |
| `apps/msd/src/app/components/choice-menu/{choice-menu.tsx,choice-menu.test.tsx}` | create |
| `apps/msd/src/hooks/{use-paged-list.ts,use-paged-list.test.tsx}` | create |
| `apps/msd/src/app/components/load-more/{load-more.tsx,load-more.css,load-more.test.tsx}` | create |
| `apps/msd/src/app/components/price-filter-dialog/{price-filter-dialog.tsx,price-filter-dialog.css,price-filter-dialog.test.tsx}` | create |
| `apps/msd/src/app/components/deal-map/{types.ts,marker-html.ts,marker-html.test.ts,deal-map.tsx,deal-map.css,deal-map.test.tsx,leaflet-map.tsx,google-map.tsx}` | create |
| `apps/msd/src/prerender-data/loaders.ts` (+test), `apps/msd/src/hydration.test.tsx` | modify (page size 12, `total`) |
| `apps/msd/src/app/pages/category/category.tsx` (+test) | modify |
| `apps/msd/src/app/pages/search/search.tsx`, `search.css` | modify (DealMap) |
| `apps/msd/src/app/components/map/*` | delete (Task 14) |
| `apps/msd/.env.example`, `DEPLOYMENT.md`, `TASK.md` | modify |

---

### Task 1: Content keys

**Files:** Modify `apps/msd/src/content.json` (top-level `"category"` object, the one containing `"searchLabel": "Search",` directly after the `"filter"` block).

- [ ] **Step 1: Edit the `category` object**

1. Replace the whole `"sortOptions": [ ... ],` array at the top of `category` (popular / rating / price-asc / price-desc / distance) with:
```json
    "sortOptions": [
      { "value": "recommended", "label": "Recommended" },
      { "value": "discount", "label": "Biggest discount" },
      { "value": "newest", "label": "Newest" }
    ],
```
2. Delete the line `"tabsLabel": "Filter by sub-category",`.
3. Directly after `"therapistPricePrefix": "From",` insert:
```json
    "description": { "more": "More", "less": "Less" },
    "pills": { "label": "Sub-categories" },
    "toolbar": {
      "label": "Listing tools",
      "filters": "Filters",
      "filtersActive": "Filters ({count})",
      "location": "Choose a city",
      "allCities": "All cities",
      "showMap": "Show on map",
      "showGrid": "Show grid",
      "sort": "Sort: {label}",
      "sortMenu": "Sort by"
    },
    "loadMore": {
      "button": "Show more",
      "loading": "Loading more",
      "retry": "Try again",
      "status": "Showing {shown} of {total}"
    },
    "filters": {
      "title": "Filters",
      "price": "Price",
      "priceValue": "{min} to {max}",
      "minLabel": "Minimum price",
      "maxLabel": "Maximum price",
      "reset": "Reset",
      "cancel": "Cancel",
      "apply": "Apply",
      "min": 0,
      "max": 10000,
      "step": 100
    },
    "map": {
      "label": "Deals on the map",
      "loading": "Loading map",
      "missingOne": "1 deal has no map location",
      "missing": "{count} deals have no map location"
    },
```
(Keep `tabs.all`: it labels the "All" pill.)

- [ ] **Step 2: Validate**

Run: `node -e "const c=require('./apps/msd/src/content.json').category; console.log(c.sortOptions.map(o=>o.value).join(','), c.toolbar.sort, c.loadMore.status, c.filters.max, c.map.missing, c.tabsLabel)"`
Expected: `recommended,discount,newest Sort: {label} Showing {shown} of {total} 10000 {count} deals have no map location undefined`

Run: `grep -rn "tabsLabel\|category.sortOptions" apps/msd/src --include=*.tsx`
Expected: only `apps/msd/src/app/pages/category/category.tsx` (uses `t.tabsLabel`; Task 6 removes it). If anything else appears, stop and report.

- [ ] **Step 3: Commit**
```bash
git add apps/msd/src/content.json
git commit -m "content(msd): category toolbar, paging, filters and map copy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `ClampText`

**Files:** Create `apps/msd/src/app/components/clamp-text/clamp-text.tsx`, `clamp-text.css`, `clamp-text.test.tsx`.

- [ ] **Step 1: Failing test** — `clamp-text.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { ClampText } from './clamp-text';

const toggle = () => document.querySelector('md-text-button') as HTMLElement | null;

describe('ClampText', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows no toggle when the text fits', () => {
    render(<ClampText text="Short" more="More" less="Less" />);
    expect(screen.getByText('Short').tagName).toBe('P');
    expect(toggle()).toBeNull();
  });

  it('shows More when the text overflows and toggles aria-expanded', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(120);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(48);
    render(<ClampText text="Long text" more="More" less="Less" />);
    const btn = toggle() as HTMLElement;
    expect(btn.textContent).toBe('More');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(toggle()?.textContent).toBe('Less');
    expect(toggle()?.getAttribute('aria-expanded')).toBe('true');
  });
});
```
- [ ] **Step 2:** Run `npx vitest run --root apps/msd src/app/components/clamp-text` → FAIL (cannot resolve `./clamp-text`).
- [ ] **Step 3: Implement** — `clamp-text.tsx`:
```tsx
import { useEffect, useId, useRef, useState } from 'react';
import { TextButton } from '@skylabs-monorepo/shared-ui/react';
import './clamp-text.css';

/** Body text clamped to two lines with a More / Less toggle, shown only when it overflows. */
export function ClampText({ text, more, less }: { text: string; more: string; less: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    // Measure only while clamped; expanded text never overflows.
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className="clamp-text">
      <p ref={ref} id={id} className={`clamp-text__body body-large${expanded ? '' : ' clamp-text__body--clamped'}`}>
        {text}
      </p>
      {(overflows || expanded) && (
        <TextButton aria-expanded={expanded ? 'true' : 'false'} aria-controls={id} onClick={() => setExpanded((e) => !e)}>
          {expanded ? less : more}
        </TextButton>
      )}
    </div>
  );
}
```
`clamp-text.css`:
```css
/* Clamped description with a More / Less toggle. */
.clamp-text {
  display: grid;
  justify-items: start;
  gap: 4px;
}
.clamp-text__body {
  margin: 0;
  max-inline-size: 72ch;
  color: var(--md-sys-color-on-surface-variant);
}
.clamp-text__body--clamped {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
```
- [ ] **Step 4:** Run the test → PASS (2). `npx eslint apps/msd/src/app/components/clamp-text` → clean.
- [ ] **Step 5: Commit**
```bash
git add apps/msd/src/app/components/clamp-text
git commit -m "feat(msd): ClampText component

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `ChipNav`

**Files:** Create `apps/msd/src/app/components/chip-nav/chip-nav.tsx`, `chip-nav.css`, `chip-nav.test.tsx`.

- [ ] **Step 1: Failing test** — `chip-nav.test.tsx`:
```tsx
import { fireEvent, render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChipNav } from './chip-nav';

type Chip = HTMLElement & { label?: string; selected?: boolean };
const chips = () => Array.from(document.querySelectorAll('md-filter-chip')) as Chip[];
const labelOf = (c: Chip) => c.label ?? c.getAttribute('label');
const isSelected = (c: Chip) => c.selected ?? c.hasAttribute('selected');

const items = [
  { value: '', label: 'All' },
  { value: 'swedish', label: 'Swedish' },
];

describe('ChipNav', () => {
  it('renders one filter chip per item inside a labelled chip set', () => {
    render(<ChipNav items={items} value="" onSelect={() => {}} ariaLabel="Sub-categories" />);
    expect(document.querySelector('md-chip-set')?.getAttribute('aria-label')).toBe('Sub-categories');
    expect(chips().map(labelOf)).toEqual(['All', 'Swedish']);
  });

  it('marks the active item selected and reports clicks', () => {
    const onSelect = vi.fn();
    render(<ChipNav items={items} value="swedish" onSelect={onSelect} ariaLabel="Sub-categories" />);
    expect(isSelected(chips()[1])).toBe(true);
    expect(isSelected(chips()[0])).toBe(false);
    fireEvent.click(chips()[0]);
    expect(onSelect).toHaveBeenCalledWith('');
  });
});
```
- [ ] **Step 2:** Run `npx vitest run --root apps/msd src/app/components/chip-nav` → FAIL.
- [ ] **Step 3: Implement** — `chip-nav.tsx`:
```tsx
import { createElement, type MouseEvent } from 'react';
import { ChipSet } from '@skylabs-monorepo/shared-ui/react';
import './chip-nav.css';

export interface ChipNavItem {
  value: string;
  label: string;
}

export interface ChipNavProps {
  items: ChipNavItem[];
  value: string;
  onSelect: (value: string) => void;
  ariaLabel: string;
}

/** Single-select pill row (M3 filter chips). Scrolls sideways on phones. */
export function ChipNav({ items, value, onSelect, ariaLabel }: ChipNavProps) {
  return (
    <ChipSet className="chip-nav" aria-label={ariaLabel}>
      {items.map((item) =>
        createElement('md-filter-chip', {
          key: item.value,
          label: item.label,
          selected: item.value === value,
          onClick: (e: MouseEvent) => {
            // md-filter-chip toggles itself on click; preventDefault keeps the state ours.
            e.preventDefault();
            onSelect(item.value);
          },
        }),
      )}
    </ChipSet>
  );
}
```
`chip-nav.css`:
```css
/* Pill row: wraps from 600px; a single scrolling row on phones. */
.chip-nav {
  max-inline-size: 100%;
}
@media (max-width: 599px) {
  .chip-nav {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-block: 2px;
    scrollbar-width: none;
  }
  .chip-nav > * {
    flex: none;
  }
}
```
- [ ] **Step 4:** Test → PASS (2). eslint clean.
- [ ] **Step 5: Commit** — `git add apps/msd/src/app/components/chip-nav` and commit `feat(msd): ChipNav pill row` (with the Co-Authored-By line).

---

### Task 4: `ListingToolbar`

**Files:** Create `apps/msd/src/app/components/listing-toolbar/listing-toolbar.tsx`, `listing-toolbar.css`, `listing-toolbar.test.tsx`.

- [ ] **Step 1: Failing test**:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ListingToolbar } from './listing-toolbar';

describe('ListingToolbar', () => {
  it('renders a labelled group with start content before end content', () => {
    render(<ListingToolbar ariaLabel="Listing tools" start={<button type="button">Filters</button>} end={<button type="button">Sort</button>} />);
    const group = screen.getByRole('group', { name: 'Listing tools' });
    const [first, second] = Array.from(group.querySelectorAll('button'));
    expect(first.textContent).toBe('Filters');
    expect(second.textContent).toBe('Sort');
  });

  it('omits an empty start slot', () => {
    render(<ListingToolbar ariaLabel="Listing tools" end={<button type="button">Sort</button>} />);
    expect(document.querySelector('.listing-toolbar__start')).toBeNull();
  });
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** — `listing-toolbar.tsx`:
```tsx
import type { ReactNode } from 'react';
import './listing-toolbar.css';

/** Toolbar row above a listing: start controls left, end controls right; wraps on phones. */
export function ListingToolbar({ ariaLabel, start, end }: { ariaLabel: string; start?: ReactNode; end?: ReactNode }) {
  return (
    <div className="listing-toolbar" role="group" aria-label={ariaLabel}>
      {start && <div className="listing-toolbar__start">{start}</div>}
      {end && <div className="listing-toolbar__end">{end}</div>}
    </div>
  );
}
```
`listing-toolbar.css`:
```css
/* Listing toolbar. A search field in the end group takes the free space. */
.listing-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
}
.listing-toolbar__start,
.listing-toolbar__end {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
}
.listing-toolbar__end {
  flex: 1 1 auto;
  justify-content: flex-end;
}
.listing-toolbar__end > sky-action-field {
  flex: 1 1 272px;
  min-inline-size: 0;
}
```
- [ ] **Step 4:** Test → PASS (2). eslint clean.
- [ ] **Step 5: Commit** — `git add apps/msd/src/app/components/listing-toolbar`, message `feat(msd): ListingToolbar layout component`.

---

### Task 5: `ChoiceMenu`

**Files:** Create `apps/msd/src/app/components/choice-menu/choice-menu.tsx`, `choice-menu.test.tsx`.

- [ ] **Step 1: Failing test**:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChoiceMenu } from './choice-menu';

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
];

describe('ChoiceMenu', () => {
  it('text trigger opens the menu and reports the picked value', () => {
    const onChange = vi.fn();
    render(<ChoiceMenu trigger="text" icon="swap_vert" label="Sort: Alpha" menuLabel="Sort by" options={options} value="a" onChange={onChange} />);
    const trigger = document.querySelector('md-text-button') as HTMLElement;
    expect(trigger.textContent).toContain('Sort: Alpha');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByText('Beta'));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('chip trigger renders an assist chip anchored to the menu', () => {
    render(<ChoiceMenu trigger="chip" icon="location_on" label="All cities" menuLabel="Choose a city" options={options} value="a" onChange={() => {}} />);
    const chip = document.querySelector('md-assist-chip') as HTMLElement & { label?: string };
    expect(chip.label ?? chip.getAttribute('label')).toBe('All cities');
    const menu = document.querySelector('md-menu') as HTMLElement & { anchor?: string };
    expect(menu.anchor ?? menu.getAttribute('anchor')).toBe(chip.id);
  });
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** — `choice-menu.tsx`:
```tsx
import { createElement, useId, useState } from 'react';
import { Icon, Menu, MenuItem } from '@skylabs-monorepo/shared-ui/react';

export interface ChoiceOption {
  value: string;
  label: string;
}

export interface ChoiceMenuProps {
  /** `chip` = M3 assist chip (toolbar start), `text` = M3 text button (toolbar end). */
  trigger: 'chip' | 'text';
  icon: string;
  /** Visible trigger text. */
  label: string;
  /** Accessible name of the menu. */
  menuLabel: string;
  options: ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
}

/** A trigger that opens an M3 menu of single-choice options (sort, city, ...). */
export function ChoiceMenu({ trigger, icon, label, menuLabel, options, value, onChange }: ChoiceMenuProps) {
  const id = `choice-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [open, setOpen] = useState(false);
  const aria = { id, 'aria-haspopup': 'menu', 'aria-expanded': open ? 'true' : 'false', onClick: () => setOpen((o) => !o) };
  const iconEl = createElement('md-icon', { slot: 'icon', 'aria-hidden': 'true' }, icon);
  const triggerEl =
    trigger === 'chip'
      ? createElement('md-assist-chip', { ...aria, label }, iconEl)
      : createElement('md-text-button', aria, iconEl, label);

  return (
    <>
      {triggerEl}
      <Menu open={open} anchor={id} positioning="popover" aria-label={menuLabel} onClosed={() => setOpen(false)}>
        {options.map((option) => (
          <MenuItem
            key={option.value}
            selected={option.value === value}
            onClick={() => {
              setOpen(false);
              onChange(option.value);
            }}
          >
            <span slot="headline">{option.label}</span>
            {option.value === value && (
              <Icon slot="end" aria-hidden="true">
                check
              </Icon>
            )}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
```
- [ ] **Step 4:** Test → PASS (2). eslint clean. If `MenuItem` rejects `selected` in TypeScript, drop that prop (the check icon still marks the choice) and note it.
- [ ] **Step 5: Commit** — `git add apps/msd/src/app/components/choice-menu`, message `feat(msd): ChoiceMenu single-choice menu`.

---

### Task 6: Category header: description, pills, toolbar with search (build order 1)

**Files:** Modify `apps/msd/src/app/components/page-section/page-section.css`, `apps/msd/src/app/components/section-head/section-head.tsx`, `section-head.test.tsx`, `apps/msd/src/app/pages/category/category.tsx`, `category.test.tsx`.

- [ ] **Step 1: `SectionHead.subheading` accepts a node** (test first). Append to `section-head.test.tsx` inside the describe:
```tsx
  it('renders a node subheading as is (no wrapping p)', () => {
    renderHead(<SectionHead id="h" heading="Massage" subheading={<div data-testid="desc">Long text</div>} />);
    const desc = screen.getByTestId('desc');
    expect(desc.parentElement?.tagName).not.toBe('P');
  });
```
In `section-head.tsx`: change `subheading?: string;` to `subheading?: ReactNode;` (ReactNode is already imported as a type) and replace
```tsx
        {subheading && <p className="section-head__sub body-large">{subheading}</p>}
```
with
```tsx
        {typeof subheading === 'string' ? <p className="section-head__sub body-large">{subheading}</p> : subheading}
```
Run `npx vitest run --root apps/msd src/app/components/section-head` → PASS (6).

- [ ] **Step 2: Stack children own no outer margins.** Append to `page-section.css` after `.page-section__container--stack { ... }`:
```css
/* The stack gap is the only spacing between stacked children. */
.page-section__container--stack > * {
  margin-block: 0;
}
```

- [ ] **Step 3: Update category tests first.** In `category.test.tsx`:
  - Remove the `tabsStub` entry from the `vi.hoisted` return object, the whole `vi.mock('@skylabs-monorepo/shared-ui/react', ...)` block, the `pickTab` function and its doc comment. Add `fireEvent` to the `@testing-library/react` import.
  - Add below `lastSubcategoryId`:
```tsx
type Chip = HTMLElement & { label?: string; selected?: boolean };
const chip = (label: string) =>
  (Array.from(document.querySelectorAll('md-filter-chip')) as Chip[]).find((c) => (c.label ?? c.getAttribute('label')) === label) as Chip;
const isSelected = (c: Chip) => c.selected ?? c.hasAttribute('selected');
```
  - Replace the body of `it('writes the picked subcategory to ?sub= and removes it for "All"', ...)` with:
```tsx
    renderAt('/category/massage');
    await waitFor(() => expect(chip('Swedish')).toBeTruthy());

    fireEvent.click(chip('Swedish'));
    await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage?sub=swedish'));
    await waitFor(() => expect(lastSubcategoryId()).toBe('s1'));

    fireEvent.click(chip(content.category.tabs.all));
    await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage'));
    await waitFor(() => expect(lastSubcategoryId()).toBeUndefined());
```
  - Replace the test `renders secondary tabs that control the results panel` with:
```tsx
  it('renders subcategory pills with the active one selected', async () => {
    renderAt('/category/massage?sub=swedish');
    await waitFor(() => expect(document.querySelectorAll('md-filter-chip')).toHaveLength(3));
    expect(document.querySelector('md-chip-set')?.getAttribute('aria-label')).toBe(content.category.pills.label);
    expect(isSelected(chip('Swedish'))).toBe(true);
    expect(isSelected(chip(content.category.tabs.all))).toBe(false);
  });

  it('puts search in the listing toolbar', async () => {
    renderAt('/category/massage');
    const toolbar = await screen.findByRole('group', { name: content.category.toolbar.label });
    expect(toolbar.querySelector('sky-action-field')).toBeTruthy();
  });
```
  Run `npx vitest run --root apps/msd src/app/pages/category` → the pill and toolbar tests FAIL.

- [ ] **Step 4: Implement in `category.tsx`.**
  - Imports: change `import { createElement, useEffect, useRef, useState, type ReactNode } from 'react';` to `import { useEffect, useRef, useState } from 'react';`; change the shared-ui import to `import { Icon, FilledButton, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';`; after the `SectionHead` import add:
```tsx
import { ChipNav } from '../../components/chip-nav/chip-nav';
import { ClampText } from '../../components/clamp-text/clamp-text';
import { ListingToolbar } from '../../components/listing-toolbar/listing-toolbar';
```
  - Delete `const PANEL_ID = ...`, `const tabId = ...`, and the whole `SubcategoryTab` function with its doc comment.
  - Replace the `setSubcategoryIdx` function with a generic URL param setter:
```tsx
  /** Writes one query param (or removes it when empty), keeping the others. */
  const setParam = (key: string, value: string | undefined) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };
```
  (`subcategoryIdx` and `activeSubcategory` stay as they are.)
  - Replace the whole `const tabs = ...;` block with:
```tsx
  const pills =
    category.children.length > 0 ? (
      <ChipNav
        ariaLabel={t.pills.label}
        items={[{ value: '', label: t.tabs.all }, ...category.children.map((c) => ({ value: c.slug, label: c.name }))]}
        value={activeSubcategory?.slug ?? ''}
        onSelect={(value) => setParam('sub', value || undefined)}
      />
    ) : null;
```
  - Replace the header `<SectionHead ... />` element with:
```tsx
        <SectionHead
          as="h1"
          id="category-heading"
          titleClassName="headline-large"
          heading={displayName}
          subheading={category.description ? <ClampText text={category.description} more={t.description.more} less={t.description.less} /> : undefined}
          actions={
            <span className="body-medium" aria-live="polite" aria-atomic="true">
              {countText}
            </span>
          }
        />
        {pills}
```
  - Replace the results `<PageSection tone="tint" ...>...</PageSection>` with:
```tsx
      <PageSection tone="tint" stack aria-label={`${category.name} ${t.dealsAriaLabelSuffix}`}>
        <ListingToolbar
          ariaLabel={t.toolbar.label}
          end={<SearchField value={search} placeholder={t.search.placeholder.replace('{category}', category.name)} onSearch={setSearch} />}
        />
        {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}
        {actionError && <p className="error-state" role="alert">{actionError}</p>}
        <CardGrid fallback={fallback}>{cards}</CardGrid>
      </PageSection>
```
  - Update the `Category` doc comment: replace "selecting a subcategory tab narrows" with "selecting a subcategory pill narrows", and "with the existing `Tabs`/`DealCard` components" with "with the existing `DealCard` components".

- [ ] **Step 5: Run** `npx vitest run --root apps/msd src/app/pages/category src/app/components src/hydration.test.tsx src/entry-server.test.tsx` → PASS. `grep -n "Tabs\|tabId\|PANEL_ID\|SubcategoryTab\|tabsLabel" apps/msd/src/app/pages/category/category.tsx` → no output. `npx eslint apps/msd/src/app/pages/category/category.tsx` → only the pre-existing `no-empty-function` error on `onFavorite={() => {}}`.
- [ ] **Step 6: Commit** — stage `page-section.css`, `section-head.tsx`, `section-head.test.tsx`, `category.tsx`, `category.test.tsx`; message `feat(msd): category header pills, clamped description and toolbar search`.

---

### Task 7: Sort (build order 2)

**Files:** Modify `apps/msd/src/app/pages/category/category.tsx`, `category.test.tsx`.

- [ ] **Step 1: Failing test** (append inside `describe('Category page layout', ...)`):
```tsx
  it('sorts from the toolbar menu and keeps the choice in ?sort=', async () => {
    renderAt('/category/massage');
    await screen.findByRole('group', { name: content.category.toolbar.label });
    const trigger = Array.from(document.querySelectorAll('md-text-button')).find((b) => b.textContent?.includes('Sort:')) as HTMLElement;
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText('Biggest discount'));
    await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage?sort=discount'));
    await waitFor(() => expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]?.sort).toBe('discount'));
  });
```
Run the category tests → FAIL.

- [ ] **Step 2: Implement.** Add `import { ChoiceMenu } from '../../components/choice-menu/choice-menu';`. After `const activeSubcategory = ...` add:
```tsx
  const sortParam = searchParams.get('sort');
  const sort = sortParam === 'discount' || sortParam === 'newest' ? sortParam : undefined;
  const sortOption = t.sortOptions.find((o) => o.value === (sort ?? 'recommended')) ?? t.sortOptions[0];
```
In the deals effect, add `sort,` to the `listCatalogDeals({...})` call (the non-refresh call) and to `listCatalogProducts({...})`; add `sort` to the effect's dependency array. The prerendered background-refresh branch must only run for the default sort: add `&& !sort` to its `if (...)` condition.

In the results `ListingToolbar`, change `end={...}` to:
```tsx
          end={
            <>
              <SearchField value={search} placeholder={t.search.placeholder.replace('{category}', category.name)} onSearch={setSearch} />
              {!isTherapyCategory && (
                <ChoiceMenu
                  trigger="text"
                  icon="swap_vert"
                  label={t.toolbar.sort.replace('{label}', sortOption.label)}
                  menuLabel={t.toolbar.sortMenu}
                  options={t.sortOptions}
                  value={sortOption.value}
                  onChange={(value) => setParam('sort', value === 'recommended' ? undefined : value)}
                />
              )}
            </>
          }
```
- [ ] **Step 3:** Run category tests → PASS. eslint as before.
- [ ] **Step 4: Commit** — `feat(msd): category sort menu`.

---

### Task 8: `usePagedList` hook

**Files:** Create `apps/msd/src/hooks/use-paged-list.ts`, `apps/msd/src/hooks/use-paged-list.test.tsx`.

- [ ] **Step 1: Failing test** — `use-paged-list.test.tsx`:
```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { usePagedList } from './use-paged-list';

const page = (ids: string[], total: number) => Promise.resolve({ data: ids, meta: { total } });
const errorMessage = () => 'Could not load.';

describe('usePagedList', () => {
  it('loads page 1 and reports the total', async () => {
    const fetchPage = vi.fn(() => page(['a', 'b'], 3));
    const { result } = renderHook(() => usePagedList(fetchPage, 'k', { errorMessage }));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchPage).toHaveBeenCalledWith(1);
    expect(result.current.items).toEqual(['a', 'b']);
    expect(result.current.total).toBe(3);
    expect(result.current.hasMore).toBe(true);
  });

  it('appends the next page and stops at the total', async () => {
    const fetchPage = vi.fn((p: number) => (p === 1 ? page(['a', 'b'], 3) : page(['c'], 3)));
    const { result } = renderHook(() => usePagedList(fetchPage, 'k', { errorMessage }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.loadMore());
    expect(result.current.loadingMore).toBe(true);
    await waitFor(() => expect(result.current.items).toEqual(['a', 'b', 'c']));
    expect(fetchPage).toHaveBeenLastCalledWith(2);
    expect(result.current.hasMore).toBe(false);
  });

  it('resets on a key change and ignores the stale response', async () => {
    let resolveOld: (v: { data: string[]; meta: { total: number } }) => void = () => {};
    const fetchPage = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
      .mockImplementationOnce(() => page(['new'], 1));
    const { result, rerender } = renderHook(({ k }) => usePagedList(fetchPage, k, { errorMessage }), { initialProps: { k: 'one' } });
    rerender({ k: 'two' });
    await waitFor(() => expect(result.current.items).toEqual(['new']));
    await act(async () => resolveOld({ data: ['old'], meta: { total: 1 } }));
    expect(result.current.items).toEqual(['new']);
  });

  it('starts from a seeded page and refreshes it once in the background', async () => {
    const fetchPage = vi.fn(() => page(['fresh'], 1));
    const { result } = renderHook(() => usePagedList(fetchPage, 'k', { errorMessage, initial: { items: ['seed'], total: 1 } }));
    expect(result.current.status).toBe('ready');
    expect(result.current.items).toEqual(['seed']);
    await waitFor(() => expect(result.current.items).toEqual(['fresh']));
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('keeps the seeded page when the background refresh fails', async () => {
    const fetchPage = vi.fn(() => Promise.reject(new Error('down')));
    const { result } = renderHook(() => usePagedList(fetchPage, 'k', { errorMessage, initial: { items: ['seed'], total: 1 } }));
    await waitFor(() => expect(fetchPage).toHaveBeenCalled());
    expect(result.current.status).toBe('ready');
    expect(result.current.items).toEqual(['seed']);
  });

  it('reports a first-page error and retries through loadMore', async () => {
    const fetchPage = vi.fn().mockRejectedValueOnce(new Error('down')).mockImplementationOnce(() => page(['a'], 1));
    const { result } = renderHook(() => usePagedList(fetchPage, 'k', { errorMessage }));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Could not load.');
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toEqual(['a']));
  });

  it('does nothing while disabled', () => {
    const fetchPage = vi.fn(() => page([], 0));
    renderHook(() => usePagedList(fetchPage, 'k', { errorMessage, enabled: false }));
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
```
- [ ] **Step 2:** Run `npx vitest run --root apps/msd src/hooks/use-paged-list.test.tsx` → FAIL.
- [ ] **Step 3: Implement** — `use-paged-list.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PagedResponse<T> {
  data: T[];
  meta?: { total?: number };
}

export interface PagedListOptions<T> {
  /** false = do not fetch (e.g. the list is for another category type). */
  enabled?: boolean;
  /** A prerendered first page for this key: shown at once, refreshed once in the background. */
  initial?: { items: T[]; total: number };
  errorMessage: (err: unknown) => string;
}

export interface PagedList<T> {
  items: T[];
  total: number;
  status: 'loading' | 'ready' | 'error';
  error: string;
  hasMore: boolean;
  loadingMore: boolean;
  /** Next page; after a first-page error, retries page 1. */
  loadMore: () => void;
}

interface State<T> {
  key: string;
  items: T[];
  total: number;
  page: number;
  status: PagedList<T>['status'];
  error: string;
  loadingMore: boolean;
}

/** Page-by-page list for "load more" listings. A new `key` (any filter change) restarts at
 *  page 1; responses for an older key or request are dropped. */
export function usePagedList<T>(
  fetchPage: (page: number) => Promise<PagedResponse<T>>,
  key: string,
  { enabled = true, initial, errorMessage }: PagedListOptions<T>,
): PagedList<T> {
  const [state, setState] = useState<State<T>>(() =>
    initial
      ? { key, items: initial.items, total: initial.total, page: 1, status: 'ready', error: '', loadingMore: false }
      : { key: '', items: [], total: 0, page: 0, status: 'loading', error: '', loadingMore: false },
  );
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const errorRef = useRef(errorMessage);
  errorRef.current = errorMessage;
  const requestId = useRef(0);
  const refreshed = useRef(false);

  const load = useCallback(
    (page: number, mode: 'reset' | 'append' | 'refresh') => {
      const id = ++requestId.current;
      if (mode === 'reset') setState({ key, items: [], total: 0, page: 0, status: 'loading', error: '', loadingMore: false });
      if (mode === 'append') setState((s) => ({ ...s, loadingMore: true, error: '' }));
      fetchRef
        .current(page)
        .then(({ data, meta }) => {
          if (id !== requestId.current) return;
          const rows = data ?? [];
          setState((s) => {
            const items = mode === 'append' ? [...s.items, ...rows] : rows;
            return { key, items, total: meta?.total ?? items.length, page, status: 'ready', error: '', loadingMore: false };
          });
        })
        .catch((err) => {
          // A failed background refresh keeps the prerendered page on screen.
          if (id !== requestId.current || mode === 'refresh') return;
          setState((s) => ({ ...s, status: mode === 'append' ? 'ready' : 'error', error: errorRef.current(err), loadingMore: false }));
        });
    },
    [key],
  );

  useEffect(() => {
    if (!enabled) return;
    if (state.key === key && state.page > 0) {
      // Seeded page for this key: refresh it once, quietly.
      if (!refreshed.current) {
        refreshed.current = true;
        load(1, 'refresh');
      }
      return;
    }
    load(1, 'reset');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  const loadMore = useCallback(() => {
    if (state.status === 'error') {
      load(1, 'reset');
      return;
    }
    if (state.status !== 'ready' || state.loadingMore || state.items.length >= state.total) return;
    load(state.page + 1, 'append');
  }, [state, load]);

  return {
    items: state.items,
    total: state.total,
    status: state.status,
    error: state.error,
    hasMore: state.status === 'ready' && state.items.length < state.total,
    loadingMore: state.loadingMore,
    loadMore,
  };
}
```
- [ ] **Step 4:** Test → PASS (7). eslint clean.
- [ ] **Step 5: Commit** — `git add apps/msd/src/hooks/use-paged-list.ts apps/msd/src/hooks/use-paged-list.test.tsx`, message `feat(msd): usePagedList hook for load-more listings`.

---

### Task 9: `LoadMore`

**Files:** Create `apps/msd/src/app/components/load-more/load-more.tsx`, `load-more.css`, `load-more.test.tsx`.

- [ ] **Step 1: Failing test**:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { LoadMore } from './load-more';

const copy = { button: 'Show more', loading: 'Loading more', retry: 'Try again' };
const button = (text: string) =>
  Array.from(document.querySelectorAll('md-outlined-button')).find((b) => b.textContent === text) as HTMLElement | undefined;

describe('LoadMore', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the status and a Show more button while more remain', () => {
    const onLoadMore = vi.fn();
    render(<LoadMore hasMore loading={false} error="" status="Showing 12 of 24" onLoadMore={onLoadMore} copy={copy} />);
    expect(screen.getByText('Showing 12 of 24').getAttribute('aria-live')).toBe('polite');
    fireEvent.click(button('Show more') as HTMLElement);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('hides the button when everything is loaded', () => {
    render(<LoadMore hasMore={false} loading={false} error="" status="Showing 3 of 3" onLoadMore={() => {}} copy={copy} />);
    expect(button('Show more')).toBeUndefined();
  });

  it('shows the error with a retry button', () => {
    const onLoadMore = vi.fn();
    render(<LoadMore hasMore loading={false} error="Could not load." status="" onLoadMore={onLoadMore} copy={copy} />);
    expect(screen.getByRole('alert').textContent).toBe('Could not load.');
    fireEvent.click(button('Try again') as HTMLElement);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('loads more when the sentinel scrolls into view', () => {
    let fire: (entries: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: typeof fire) {
          fire = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const onLoadMore = vi.fn();
    render(<LoadMore hasMore loading={false} error="" status="" onLoadMore={onLoadMore} copy={copy} />);
    fire([{ isIntersecting: true }]);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** — `load-more.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import { CircularProgress, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import './load-more.css';

export interface LoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  error: string;
  /** e.g. "Showing 12 of 24" (polite live region). */
  status: string;
  onLoadMore: () => void;
  copy: { button: string; loading: string; retry: string };
}

/** Infinite-scroll footer: loads the next page near the viewport, with a visible button fallback. */
export function LoadMore({ hasMore, loading, error, status, onLoadMore, copy }: LoadMoreProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const latest = useRef(onLoadMore);
  latest.current = onLoadMore;
  const auto = hasMore && !loading && !error;

  useEffect(() => {
    const el = sentinel.current;
    if (!auto || !el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) latest.current();
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [auto]);

  return (
    <div className="load-more">
      <p className="load-more__status body-medium" aria-live="polite">
        {status}
      </p>
      {error ? (
        <>
          <p className="error-state" role="alert">
            {error}
          </p>
          <OutlinedButton onClick={onLoadMore}>{copy.retry}</OutlinedButton>
        </>
      ) : loading ? (
        <CircularProgress indeterminate aria-label={copy.loading} />
      ) : hasMore ? (
        <OutlinedButton onClick={onLoadMore}>{copy.button}</OutlinedButton>
      ) : null}
      <div ref={sentinel} aria-hidden="true" />
    </div>
  );
}
```
`load-more.css`:
```css
/* Load-more footer under a card grid. */
.load-more {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-block-start: 8px;
}
.load-more__status {
  margin: 0;
  color: var(--md-sys-color-on-surface-variant);
}
```
- [ ] **Step 4:** Test → PASS (4). eslint clean.
- [ ] **Step 5: Commit** — `git add apps/msd/src/app/components/load-more`, message `feat(msd): LoadMore infinite-scroll footer`.

---

### Task 10: Category paging + prerender total (build order 3)

**Files:** Modify `apps/msd/src/prerender-data/loaders.ts`, `apps/msd/src/prerender-data/loaders.test.ts`, `apps/msd/src/hydration.test.tsx`, `apps/msd/src/app/pages/category/category.tsx`, `category.test.tsx`.

- [ ] **Step 1: Loader.** In `loaders.ts`:
  - `CategoryData` gains `total: number;` after `deals` (doc: "`total` = all matching deals (API `meta.total`), `deals` = the first page").
  - Replace
```ts
/** Same deal page size the category page requests. */
export const CATEGORY_DEALS_PAGE_SIZE = 60;
```
with
```ts
/** Cards per page on the category page (and its prerendered first page). */
export const CATEGORY_PAGE_SIZE = 12;
```
  - In `loadCategoryData`: the 404 return becomes `{ category: null, deals: [], total: 0 }`; the PRODUCT/THERAPY return becomes `{ category, deals: [], total: 0 }`; the deals call uses `pageSize: CATEGORY_PAGE_SIZE` and reads `const { data, meta } = await listCatalogDeals({...});` and returns `{ category, deals: (data ?? []).map(trimDeal), total: meta?.total ?? (data ?? []).length }`.
  - `grep -rn "CATEGORY_DEALS_PAGE_SIZE" apps/msd` → update any other reference to `CATEGORY_PAGE_SIZE`.
  - `loaders.test.ts`: update the two `toEqual` expectations to include `total` (`total: 1` for the one-deal case — or whatever the mock's `meta.total` is; if the mock has no meta, `total` equals the deal count; and `total: 0` for the 404 case). If the test asserts the deals call's `pageSize`, change 60 to 12.
  - `hydration.test.tsx` line ~141: `{ category: fx.massage, deals: [fx.deal] }` → `{ category: fx.massage, deals: [fx.deal], total: 1 }`.
  Run `npx vitest run --root apps/msd src/prerender-data src/hydration.test.tsx` → PASS. Also run the prerender route tests: `npx vitest run --root apps/msd prerender` → PASS.

- [ ] **Step 2: Failing category tests** (append inside `describe('Category page layout', ...)`):
```tsx
  const deal = (id: string, extra: Record<string, unknown> = {}) =>
    ({
      id,
      title: `Deal ${id}`,
      salePrice: '999',
      originalPrice: null,
      discountPercent: null,
      durationMinutes: null,
      vendor: null,
      branch: { id: 'b1', name: 'Main', city: 'Pune', address: null, latitude: null, longitude: null },
      mediaImages: [],
      popularTags: [],
      ...extra,
    }) as unknown;

  it('loads 12 at a time and shows the API total', async () => {
    const first = Array.from({ length: 12 }, (_, i) => deal(`d${i}`));
    listCatalogDealsMock.mockImplementation((opts: { page?: number }) =>
      Promise.resolve(opts.page === 2 ? { data: [deal('d12')], meta: { total: 13 } } : { data: first, meta: { total: 13 } }),
    );
    renderAt('/category/massage');
    expect(await screen.findByText(`13 ${content.category.dealCount.plural}`)).toBeTruthy();
    expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ page: 1, pageSize: 12 }));
    expect(screen.getByText('Showing 12 of 13')).toBeTruthy();
    const more = Array.from(document.querySelectorAll('md-outlined-button')).find((b) => b.textContent === content.category.loadMore.button) as HTMLElement;
    fireEvent.click(more);
    await waitFor(() => expect(screen.getByText('Showing 13 of 13')).toBeTruthy());
    expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ page: 2 }));
  });
```
Run category tests → FAIL.

- [ ] **Step 3: Implement in `category.tsx`.**
  - Imports: add `import { usePagedList } from '../../../hooks/use-paged-list';`, `import { LoadMore } from '../../components/load-more/load-more';`, and change the loaders import to `import { CATEGORY_PAGE_SIZE, type CategoryData } from '../../../prerender-data/loaders';`. Remove `useRef` from the React import only if nothing else uses it (SearchField does, so keep it).
  - Delete these state lines: `const [deals, setDeals] ...`, `const [dealsLoading, setDealsLoading] ...`, `const [dealsError, setDealsError] ...`, the `allDealsRef` comment + line, `const dealsRefreshedRef ...`, `const [therapists, setTherapists] ...`, `const [products, setProducts] ...`.
  - Delete the entire second `useEffect` (the one starting `if (!category) return;` that fetches deals/products/therapists, through its dependency array).
  - In its place (after `const isProductCategory = ...;`, before the `// Hold the page ...` early return) add:
```tsx
  const lat = coords?.latitude ?? undefined;
  const lng = coords?.longitude ?? undefined;
  const common = {
    categoryId: category?.id,
    subcategoryId: activeSubcategory?.id,
    search: search || undefined,
    pageSize: CATEGORY_PAGE_SIZE,
  };
  // Any change here restarts the list at page 1.
  const listKey = JSON.stringify([category?.id, activeSubcategory?.id, search, sort, cityLocation?.city, lat, lng]);
  // The prerendered first page only describes the default ("All", unsorted, no search, no location) view.
  const isDefaultView = !activeSubcategory && !search && !sort && lat == null && lng == null;
  const loadError = (err: unknown) => (err instanceof ApiRequestError ? err.message : t.errors.loadDeals);
  const dealList = usePagedList<CatalogDeal>(
    (page) =>
      listCatalogDeals({ ...common, page, city: cityLocation?.city, state: cityLocation?.state, sort, latitude: lat, longitude: lng }),
    listKey,
    {
      enabled: !!category && isDealCategory(category) && !cityPending,
      errorMessage: loadError,
      initial:
        initialHasDeals && isDefaultView ? { items: initial.deals, total: initial.total ?? initial.deals.length } : undefined,
    },
  );
  const productList = usePagedList<CatalogProduct>((page) => listCatalogProducts({ ...common, page, sort }), listKey, {
    enabled: category?.type === 'PRODUCT',
    errorMessage: loadError,
  });
  const therapistList = usePagedList<CatalogTherapist>(
    (page) => listCatalogTherapists({ ...common, page, latitude: lat, longitude: lng }),
    listKey,
    { enabled: category?.type === 'THERAPY', errorMessage: loadError },
  );
  const list = isTherapyCategory ? therapistList : isProductCategory ? productList : dealList;
  const deals = dealList.items;
  const products = productList.items;
  const therapists = therapistList.items;
  const dealsLoading = list.status === 'loading';
  const dealsError = list.status === 'error' ? list.error : '';
```
  - Replace
```tsx
  const count = isTherapyCategory ? therapists.length : isProductCategory ? products.length : deals.length;
```
with
```tsx
  const count = list.total;
```
  and the empty check in `fallback` from `count === 0` to `list.items.length === 0`.
  - After `<CardGrid fallback={fallback}>{cards}</CardGrid>` add:
```tsx
        {list.status === 'ready' && list.items.length > 0 && (
          <LoadMore
            hasMore={list.hasMore}
            loading={list.loadingMore}
            error={list.error}
            status={t.loadMore.status.replace('{shown}', String(list.items.length)).replace('{total}', String(list.total))}
            onLoadMore={list.loadMore}
            copy={t.loadMore}
          />
        )}
```
- [ ] **Step 4: Run** `npx vitest run --root apps/msd src/app/pages/category src/hooks src/prerender-data src/hydration.test.tsx src/entry-server.test.tsx` → PASS. The existing prerender tests (`renders the prerendered category and deals first, then refreshes both once in the background`, `keeps the prerendered data when the refresh fails`, city-key tests) must pass unchanged in intent. If one asserted `pageSize: 60`, change it to 12. If one fails for another reason, STOP and report NEEDS_CONTEXT with the output.
- [ ] **Step 5:** `npx tsc -p apps/msd/tsconfig.app.json --noEmit 2>&1 | grep -E "pages/category|prerender-data|hooks/use-paged-list"` → no output. eslint on changed files → only the pre-existing `no-empty-function`.
- [ ] **Step 6: Commit** — stage `loaders.ts`, `loaders.test.ts`, `hydration.test.tsx`, `category.tsx`, `category.test.tsx`; message `feat(msd): category loads 12 at a time with the API total`.

---

### Task 11: Location (build order 4)

**Files:** Modify `apps/msd/src/app/pages/category/category.tsx`, `category.test.tsx`.

- [ ] **Step 1: Failing test** (append inside `describe('Category page layout', ...)`):
```tsx
  it('switches city from the location chip', async () => {
    renderAt('/category/massage');
    await screen.findByRole('group', { name: content.category.toolbar.label });
    const chip = Array.from(document.querySelectorAll('md-assist-chip')).find(
      (c) => ((c as HTMLElement & { label?: string }).label ?? c.getAttribute('label')) === content.category.toolbar.allCities,
    ) as HTMLElement;
    fireEvent.click(chip);
    fireEvent.click(screen.getByText('Pune'));
    await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage/pune'));
  });

  it('hides the location chip for product categories', async () => {
    getCatalogCategoryMock.mockResolvedValue({ data: { ...CATEGORY, type: 'PRODUCT' } });
    renderAt('/category/massage');
    await screen.findByRole('group', { name: content.category.toolbar.label });
    const labels = Array.from(document.querySelectorAll('md-assist-chip')).map(
      (c) => (c as HTMLElement & { label?: string }).label ?? c.getAttribute('label'),
    );
    expect(labels).not.toContain(content.category.toolbar.allCities);
  });
```
Run → FAIL.

- [ ] **Step 2: Implement.** `listingStart` is built after `activeCity` is known (after the `crumbs` const):
```tsx
  const locationMenu = cityFilterable ? (
    <ChoiceMenu
      trigger="chip"
      icon="location_on"
      label={activeCity?.city ?? t.toolbar.allCities}
      menuLabel={t.toolbar.location}
      options={[{ value: '', label: t.toolbar.allCities }, ...locations.map((l) => ({ value: l.city, label: l.city }))]}
      value={activeCity?.city ?? ''}
      onChange={(city) => {
        const query = searchParams.toString();
        navigate(`${city ? cityHref(category.slug, city) : categoryHref(category.slug)}${query ? `?${query}` : ''}`);
      }}
    />
  ) : null;
```
and pass `start={locationMenu}` to `ListingToolbar`. (`cityFilterable` already excludes PRODUCT and THERAPY.)
- [ ] **Step 3:** Run category tests → PASS (including the existing city-route tests).
- [ ] **Step 4: Commit** — `feat(msd): category location chip switches city pages`.

---

### Task 12: Price filter (build order 5)

**Files:** Create `apps/msd/src/app/components/price-filter-dialog/price-filter-dialog.tsx`, `price-filter-dialog.css`, `price-filter-dialog.test.tsx`; modify `category.tsx`, `category.test.tsx`.

- [ ] **Step 1: Failing component test** — `price-filter-dialog.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PriceFilterDialog } from './price-filter-dialog';

const copy = {
  title: 'Filters', price: 'Price', priceValue: '{min} to {max}', minLabel: 'Minimum price', maxLabel: 'Maximum price',
  reset: 'Reset', cancel: 'Cancel', apply: 'Apply',
};
const bounds = { min: 0, max: 10000, step: 100 };
const buttonText = (text: string) =>
  Array.from(document.querySelectorAll('md-text-button, md-filled-button')).find((b) => b.textContent === text) as HTMLElement;

describe('PriceFilterDialog', () => {
  it('applies the slider range and drops values at the bounds', () => {
    const onApply = vi.fn();
    render(<PriceFilterDialog range={{}} bounds={bounds} copy={copy} onApply={onApply} onClose={() => {}} />);
    const slider = document.querySelector('md-slider') as HTMLElement & { valueStart: number; valueEnd: number };
    slider.valueStart = 500;
    slider.valueEnd = 2000;
    fireEvent(slider, new Event('input', { bubbles: true }));
    expect(screen.getByText('₹500 to ₹2,000')).toBeTruthy();
    fireEvent.click(buttonText('Apply'));
    expect(onApply).toHaveBeenCalledWith({ min: 500, max: 2000 });
  });

  it('reset returns to the full range', () => {
    const onApply = vi.fn();
    render(<PriceFilterDialog range={{ min: 500, max: 2000 }} bounds={bounds} copy={copy} onApply={onApply} onClose={() => {}} />);
    fireEvent.click(buttonText('Reset'));
    fireEvent.click(buttonText('Apply'));
    expect(onApply).toHaveBeenCalledWith({ min: undefined, max: undefined });
  });
});
```
(If `formatINR` output differs, e.g. `₹2000`, match the actual `formatINR` output; do not change `formatINR`.)
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** — `price-filter-dialog.tsx`:
```tsx
import { useRef, useState } from 'react';
import { Dialog, FilledButton, Slider, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useCustomEvent } from '../../../hooks/use-custom-event';
import { formatINR } from '../../../utils/format';
import './price-filter-dialog.css';

export interface PriceRange {
  min?: number;
  max?: number;
}

export interface PriceFilterDialogProps {
  range: PriceRange;
  bounds: { min: number; max: number; step: number };
  copy: { title: string; price: string; priceValue: string; minLabel: string; maxLabel: string; reset: string; cancel: string; apply: string };
  onApply: (range: PriceRange) => void;
  onClose: () => void;
}

type SliderEl = HTMLElement & { valueStart: number; valueEnd: number };

/** Price range filter. Mount it only while open; it starts from `range`. */
export function PriceFilterDialog({ range, bounds, copy, onApply, onClose }: PriceFilterDialogProps) {
  const [start, setStart] = useState(range.min ?? bounds.min);
  const [end, setEnd] = useState(range.max ?? bounds.max);
  const sliderRef = useRef<SliderEl>(null);
  useCustomEvent(sliderRef, 'input', () => {
    const slider = sliderRef.current;
    if (!slider) return;
    setStart(slider.valueStart);
    setEnd(slider.valueEnd);
  });

  return (
    <Dialog open onClose={onClose}>
      <span slot="headline">{copy.title}</span>
      <div slot="content" className="price-filter">
        <p className="title-small">{copy.price}</p>
        <p className="body-large" aria-live="polite">
          {copy.priceValue.replace('{min}', formatINR(start)).replace('{max}', formatINR(end))}
        </p>
        <Slider
          ref={sliderRef}
          range
          labeled
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          valueStart={start}
          valueEnd={end}
          ariaLabelStart={copy.minLabel}
          ariaLabelEnd={copy.maxLabel}
        />
      </div>
      <div slot="actions">
        <TextButton
          onClick={() => {
            setStart(bounds.min);
            setEnd(bounds.max);
          }}
        >
          {copy.reset}
        </TextButton>
        <TextButton onClick={onClose}>{copy.cancel}</TextButton>
        <FilledButton
          onClick={() => onApply({ min: start > bounds.min ? start : undefined, max: end < bounds.max ? end : undefined })}
        >
          {copy.apply}
        </FilledButton>
      </div>
    </Dialog>
  );
}
```
(If TypeScript rejects `ariaLabelStart`/`ariaLabelEnd` or `ref` on the `Slider` wrapper, use the attribute forms `aria-label-start` / `aria-label-end`, and report it.)

`price-filter-dialog.css`:
```css
/* Price filter dialog body. */
.price-filter {
  display: grid;
  gap: 8px;
  min-inline-size: min(272px, 100%);
}
.price-filter p {
  margin: 0;
}
.price-filter md-slider {
  inline-size: 100%;
}
```
- [ ] **Step 4:** Component test → PASS (2).
- [ ] **Step 5: Failing category test** (append inside `describe('Category page layout', ...)`):
```tsx
  it('applies a price filter from the Filters dialog', async () => {
    renderAt('/category/massage');
    await screen.findByRole('group', { name: content.category.toolbar.label });
    const filters = Array.from(document.querySelectorAll('md-assist-chip')).find(
      (c) => ((c as HTMLElement & { label?: string }).label ?? c.getAttribute('label')) === content.category.toolbar.filters,
    ) as HTMLElement;
    fireEvent.click(filters);
    const slider = (await waitFor(() => document.querySelector('md-slider'))) as HTMLElement & { valueStart: number; valueEnd: number };
    slider.valueStart = 500;
    slider.valueEnd = 2000;
    fireEvent(slider, new Event('input', { bubbles: true }));
    fireEvent.click(
      Array.from(document.querySelectorAll('md-filled-button')).find((b) => b.textContent === content.category.filters.apply) as HTMLElement,
    );
    await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage?min=500&max=2000'));
    await waitFor(() => expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ minPrice: 500, maxPrice: 2000 })));
  });
```
Run → FAIL.
- [ ] **Step 6: Implement in `category.tsx`.**
  - Import `import { PriceFilterDialog, type PriceRange } from '../../components/price-filter-dialog/price-filter-dialog';` and add `createElement` back to the React import.
  - Above the component add:
```tsx
/** A non-negative number from a query param, or undefined. */
function toPrice(value: string | null): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
```
  - After the `sortOption` line add:
```tsx
  const minPrice = toPrice(searchParams.get('min'));
  const maxPrice = toPrice(searchParams.get('max'));
  const activeFilters = minPrice != null || maxPrice != null ? 1 : 0;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const applyPrice = ({ min, max }: PriceRange) => {
    setFiltersOpen(false);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of [['min', min], ['max', max]] as const) {
          if (value == null) next.delete(key);
          else next.set(key, String(value));
        }
        return next;
      },
      { replace: true },
    );
  };
```
  - Add `minPrice, maxPrice` to `listKey` (`JSON.stringify([..., sort, minPrice, maxPrice, ...])`), add `&& minPrice == null && maxPrice == null` to `isDefaultView`, pass `minPrice, maxPrice` to the `listCatalogDeals` and `listCatalogProducts` calls.
  - Build the filters chip next to `locationMenu`:
```tsx
  const filtersChip = !isTherapyCategory
    ? createElement(
        'md-assist-chip',
        {
          label: activeFilters ? t.toolbar.filtersActive.replace('{count}', String(activeFilters)) : t.toolbar.filters,
          'aria-haspopup': 'dialog',
          onClick: () => setFiltersOpen(true),
        },
        createElement('md-icon', { slot: 'icon', 'aria-hidden': 'true' }, 'tune'),
      )
    : null;
```
  - `ListingToolbar` `start={<>{filtersChip}{locationMenu}</>}` (render `start` only when either exists: `start={filtersChip || locationMenu ? <>{filtersChip}{locationMenu}</> : undefined}`).
  - At the end of the results `PageSection` add:
```tsx
        {filtersOpen && (
          <PriceFilterDialog
            range={{ min: minPrice, max: maxPrice }}
            bounds={{ min: t.filters.min, max: t.filters.max, step: t.filters.step }}
            copy={t.filters}
            onApply={applyPrice}
            onClose={() => setFiltersOpen(false)}
          />
        )}
```
  Note: hooks (`useState` for `filtersOpen`) must run before the component's early returns; the `sortOption` line is above them, so placing it there is correct.
- [ ] **Step 7:** Run category + component tests → PASS; tsc/eslint as in Task 10.
- [ ] **Step 8: Commit** — stage the new component folder + `category.tsx` + `category.test.tsx`; message `feat(msd): category price filter dialog`.

---

### Task 13: `DealMap` (Leaflet default, Google switch)

**Files:** Create in `apps/msd/src/app/components/deal-map/`: `types.ts`, `marker-html.ts`, `marker-html.test.ts`, `deal-map.tsx`, `deal-map.css`, `deal-map.test.tsx`, `leaflet-map.tsx`, `google-map.tsx`. Modify `apps/msd/.env.example`.

- [ ] **Step 1: Failing tests.**
`marker-html.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { markerHtml } from './marker-html';

describe('markerHtml', () => {
  it('renders an escaped, labelled link', () => {
    const html = markerHtml({ id: '1', lat: 0, lng: 0, label: '₹999', title: 'Spa <b>&</b> "Co"', href: '/deal/1' });
    expect(html).toBe(
      '<a class="deal-map__marker label-large" href="/deal/1" aria-label="Spa &lt;b&gt;&amp;&lt;/b&gt; &quot;Co&quot;, ₹999">₹999</a>',
    );
  });
});
```
`deal-map.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DealMap, resolveMapProvider } from './deal-map';

vi.mock('./leaflet-map', () => ({ default: ({ points }: { points: unknown[] }) => <div>leaflet {points.length}</div> }));
vi.mock('./google-map', () => ({ default: () => <div>google</div> }));

const point = { id: '1', lat: 26.76, lng: 83.37, label: '₹999', title: 'Deal', href: '/deal/1' };

describe('DealMap', () => {
  it('uses leaflet unless the provider is google', () => {
    expect(resolveMapProvider(undefined)).toBe('leaflet');
    expect(resolveMapProvider('leaflet')).toBe('leaflet');
    expect(resolveMapProvider('google')).toBe('google');
    expect(resolveMapProvider('other')).toBe('leaflet');
  });

  it('lazy-loads the engine inside a labelled region', async () => {
    render(<DealMap points={[point]} ariaLabel="Deals on the map" loadingLabel="Loading map" />);
    expect(screen.getByRole('region', { name: 'Deals on the map' })).toBeTruthy();
    expect(await screen.findByText('leaflet 1')).toBeTruthy();
  });
});
```
Run `npx vitest run --root apps/msd src/app/components/deal-map` → FAIL.

- [ ] **Step 2: Implement.**
`types.ts`:
```ts
/** One deal location on the map. `label` is the marker text (price), `title` names it for screen readers. */
export interface DealMapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title: string;
  href: string;
}
```
`marker-html.ts`:
```ts
import type { DealMapPoint } from './types';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Marker markup for Leaflet's divIcon (an HTML string): one real link per deal. */
export function markerHtml(point: DealMapPoint): string {
  const label = escapeHtml(point.label);
  return `<a class="deal-map__marker label-large" href="${escapeHtml(point.href)}" aria-label="${escapeHtml(point.title)}, ${label}">${label}</a>`;
}
```
`deal-map.tsx`:
```tsx
import { lazy, Suspense } from 'react';
import { CircularProgress } from '@skylabs-monorepo/shared-ui/react';
import type { DealMapPoint } from './types';
import './deal-map.css';

export type { DealMapPoint } from './types';

/** `VITE_MAP_PROVIDER=google` switches back to Google Maps; anything else uses Leaflet + OSM. */
export function resolveMapProvider(value: string | undefined): 'leaflet' | 'google' {
  return value === 'google' ? 'google' : 'leaflet';
}

const Engine = lazy(() =>
  resolveMapProvider(import.meta.env.VITE_MAP_PROVIDER) === 'google' ? import('./google-map') : import('./leaflet-map'),
);

/** Deal locations as price markers. The map engine loads only when this renders (browser only). */
export function DealMap({ points, ariaLabel, loadingLabel }: { points: DealMapPoint[]; ariaLabel: string; loadingLabel: string }) {
  return (
    <div className="deal-map" role="region" aria-label={ariaLabel}>
      <Suspense
        fallback={
          <div className="deal-map__loading">
            <CircularProgress indeterminate aria-label={loadingLabel} />
          </div>
        }
      >
        <Engine points={points} />
      </Suspense>
    </div>
  );
}
```
`leaflet-map.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { markerHtml } from './marker-html';
import type { DealMapPoint } from './types';

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
/** Marker box; the pill inside is centred on the point. */
const MARKER_SIZE: L.PointTuple = [96, 40];

/** Leaflet + OpenStreetMap engine (free, no key). Attribution stays visible per the OSM tile policy. */
export default function LeafletMap({ points }: { points: DealMapPoint[] }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const map = L.map(el, { scrollWheelZoom: false });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    // Marker links navigate in-app (plain clicks only; modified clicks open normally).
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element).closest<HTMLAnchorElement>('a.deal-map__marker');
      if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigateRef.current(link.getAttribute('href') ?? '/');
    };
    el.addEventListener('click', onClick);
    return () => {
      el.removeEventListener('click', onClick);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || points.length === 0) return;
    layer.clearLayers();
    for (const point of points) {
      const icon = L.divIcon({ className: 'deal-map__marker-host', html: markerHtml(point), iconSize: MARKER_SIZE });
      L.marker([point.lat, point.lng], { icon, keyboard: false, riseOnHover: true }).addTo(layer);
    }
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 14);
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as L.LatLngTuple)), { padding: [48, 48] });
  }, [points]);

  return <div ref={container} className="deal-map__canvas" />;
}
```
`google-map.tsx` (the previous `components/map` Google implementation, adapted to `DealMapPoint`; kept so `VITE_MAP_PROVIDER=google` restores it):
```tsx
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, OverlayView, useJsApiLoader } from '@react-google-maps/api';
import type { DealMapPoint } from './types';

/** Google Maps engine (needs VITE_GOOGLE_MAPS_API_KEY). */
export default function GoogleDealMap({ points }: { points: DealMapPoint[] }) {
  const navigate = useNavigate();
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY });
  const onLoad = useCallback(
    (map: google.maps.Map) => {
      const bounds = new google.maps.LatLngBounds();
      points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, 48);
    },
    [points],
  );
  if (!isLoaded || points.length === 0) return null;
  return (
    <GoogleMap
      onLoad={onLoad}
      center={{ lat: points[0].lat, lng: points[0].lng }}
      zoom={11}
      mapContainerClassName="deal-map__canvas"
      options={{ fullscreenControl: false, streetViewControl: false, mapTypeControl: false, clickableIcons: false }}
    >
      {points.map((p) => (
        <OverlayView key={p.id} position={{ lat: p.lat, lng: p.lng }} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
          <a
            className="deal-map__marker label-large"
            href={p.href}
            aria-label={`${p.title}, ${p.label}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(p.href);
            }}
          >
            {p.label}
          </a>
        </OverlayView>
      ))}
    </GoogleMap>
  );
}
```
`deal-map.css`:
```css
/* Deal map (Leaflet or Google). Markers are M3 primary pills. 840px = M3 expanded. */
.deal-map {
  position: relative;
  inline-size: 100%;
  block-size: 480px;
  overflow: hidden;
  border-radius: var(--md-sys-shape-corner-large);
  background-color: var(--md-sys-color-surface-container-high);
}
.deal-map__canvas,
.deal-map__loading {
  inline-size: 100%;
  block-size: 100%;
}
.deal-map__loading {
  display: grid;
  place-items: center;
}
.deal-map .leaflet-container {
  font: inherit;
  background-color: var(--md-sys-color-surface-container-high);
}
.deal-map__marker-host {
  display: flex;
  align-items: center;
  justify-content: center;
}
.deal-map__marker {
  display: inline-flex;
  align-items: center;
  min-block-size: 32px;
  padding-inline: 12px;
  border-radius: var(--md-sys-shape-corner-full);
  background-color: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
  box-shadow: var(--sky-elevation-2);
  white-space: nowrap;
  text-decoration: none;
}
.deal-map__marker:hover {
  background-color: color-mix(
    in srgb,
    var(--md-sys-color-on-primary) calc(var(--md-sys-state-hover-state-layer-opacity) * 100%),
    var(--md-sys-color-primary)
  );
}
.deal-map__marker:focus-visible {
  outline: 3px solid var(--md-sys-color-primary);
  outline-offset: 2px;
}
@media (min-width: 840px) {
  .deal-map {
    block-size: 600px;
  }
}
```
`apps/msd/.env.example`: directly after the `VITE_GOOGLE_MAPS_API_KEY=` line add:
```
# Map engine: leaflet (default, free OpenStreetMap tiles, no key) or google (needs VITE_GOOGLE_MAPS_API_KEY).
VITE_MAP_PROVIDER=leaflet
# Optional tile server for leaflet (default https://tile.openstreetmap.org/{z}/{x}/{y}.png). Keep the attribution visible.
VITE_MAP_TILE_URL=
VITE_MAP_TILE_ATTRIBUTION=
```
- [ ] **Step 3:** Run `npx vitest run --root apps/msd src/app/components/deal-map` → PASS (3). `npx tsc -p apps/msd/tsconfig.app.json --noEmit 2>&1 | grep deal-map` → no output. eslint clean.
- [ ] **Step 4: Commit** — `git add apps/msd/src/app/components/deal-map apps/msd/.env.example`; message `feat(msd): DealMap with Leaflet + OpenStreetMap, Google behind VITE_MAP_PROVIDER`.

---

### Task 14: Map view on category + explore switch (build order 6)

**Files:** Modify `category.tsx`, `category.test.tsx`, `apps/msd/src/app/pages/search/search.tsx`, `search.css`; delete `apps/msd/src/app/components/map/` (map.tsx, map.css, index.ts).

- [ ] **Step 1: Failing category test** (append inside `describe('Category page layout', ...)`, and at the top of the file add the mock below the other `vi.mock` calls):
```tsx
vi.mock('../../components/deal-map/deal-map', () => ({
  DealMap: ({ points }: { points: unknown[] }) => <div data-testid="deal-map">{points.length}</div>,
}));
```
```tsx
  it('toggles a map of the loaded deals that have coordinates', async () => {
    listCatalogDealsMock.mockResolvedValue({
      data: [
        deal('d1', { branch: { id: 'b1', name: 'Main', city: 'Pune', address: null, latitude: '18.52', longitude: '73.85' } }),
        deal('d2'),
      ],
      meta: { total: 2 },
    });
    renderAt('/category/massage');
    await screen.findByText(`2 ${content.category.dealCount.plural}`);
    const toggle = Array.from(document.querySelectorAll('md-text-button')).find((b) => b.textContent?.includes(content.category.toolbar.showMap)) as HTMLElement;
    fireEvent.click(toggle);
    expect((await screen.findByTestId('deal-map')).textContent).toBe('1');
    expect(screen.getByText(content.category.map.missingOne)).toBeTruthy();
  });
```
(Move the `deal` helper from Task 10 to module level if it is scoped inside the describe so both tests can use it.) Run → FAIL.

- [ ] **Step 2: Implement on the category page.**
  - Imports: add `useMemo` to the React import; add `import { TextButton } from '@skylabs-monorepo/shared-ui/react'` (merge into the existing shared-ui import) and `import { DealMap, type DealMapPoint } from '../../components/deal-map/deal-map';`.
  - With the other state near the top: `const [view, setView] = useState<'grid' | 'map'>('grid');`
  - After `const therapists = therapistList.items;` add (before the early returns):
```tsx
  const mapPoints = useMemo<DealMapPoint[]>(
    () =>
      deals.flatMap((d) =>
        d.branch?.latitude != null && d.branch?.longitude != null
          ? [{ id: d.id, lat: Number(d.branch.latitude), lng: Number(d.branch.longitude), label: formatINR(Number(d.salePrice)), title: d.title, href: `/deal/${d.id}` }]
          : [],
      ),
    [deals],
  );
  const showMapToggle = !!category && isDealCategory(category) && mapPoints.length > 0;
  const showingMap = view === 'map' && showMapToggle;
```
  - In the toolbar `end`, between `SearchField` and the sort `ChoiceMenu`, add:
```tsx
              {showMapToggle && (
                <TextButton onClick={() => setView(showingMap ? 'grid' : 'map')}>
                  <Icon slot="icon" aria-hidden="true">
                    {showingMap ? 'grid_view' : 'map'}
                  </Icon>
                  {showingMap ? t.toolbar.showGrid : t.toolbar.showMap}
                </TextButton>
              )}
```
  - Replace `<CardGrid fallback={fallback}>{cards}</CardGrid>` with:
```tsx
        {showingMap ? (
          <>
            <DealMap points={mapPoints} ariaLabel={t.map.label} loadingLabel={t.map.loading} />
            {deals.length > mapPoints.length && (
              <p className="body-medium">
                {deals.length - mapPoints.length === 1
                  ? t.map.missingOne
                  : t.map.missing.replace('{count}', String(deals.length - mapPoints.length))}
              </p>
            )}
          </>
        ) : (
          <CardGrid fallback={fallback}>{cards}</CardGrid>
        )}
```
  Run category tests → PASS.

- [ ] **Step 3: Explore page.** In `apps/msd/src/app/pages/search/search.tsx`:
  - Replace `import { Map } from '../../components/map';` with `import { DealMap } from '../../components/deal-map/deal-map';`.
  - Replace the `mappableDeals` const with (keep the name so the rest of the file still works):
```tsx
  const mappableDeals = dealsWithCoords.map((deal) => ({
    id: deal.id,
    lat: Number(deal.branch.latitude),
    lng: Number(deal.branch.longitude),
    label: formatINR(Number(deal.salePrice)),
    title: deal.title,
    href: `/deal/${deal.id}`,
  }));
```
  - Replace
```tsx
                    <div className="search-map__canvas" role="img" aria-label={searchContent.results.mapImageLabel}>
                      <Map deals={mappableDeals} />
                    </div>
```
with
```tsx
                    <div className="search-map__canvas">
                      <DealMap points={mappableDeals} ariaLabel={searchContent.results.mapImageLabel} loadingLabel={searchContent.results.mapImageLabel} />
                    </div>
```
  - If anything else in the file reads `mappableDeals[i].price`, switch it to the deal's own `salePrice` (grep `mappableDeals` and `\.price` in the file).
  - In `search.css`, replace the whole `.search-map__canvas { ... }` rule (grid-line background, border, min-height) with:
```css
.search-map__canvas {
  min-inline-size: 0;
}
```
    and delete the whole `.search-map__canvas::after { ... }` rule (the "Map · Real-time map available after API integration" placeholder text that sat on top of the map).
- [ ] **Step 4: Delete the old map component.** `grep -rn "components/map'" apps/msd/src` → no output. Then `git rm apps/msd/src/app/components/map/map.tsx apps/msd/src/app/components/map/map.css apps/msd/src/app/components/map/index.ts`.
- [ ] **Step 5:** Run `npx vitest run --root apps/msd src/app/pages/category src/app/pages/search src/app/components` → PASS. tsc grep for `pages/category|pages/search|deal-map` → no output. eslint on changed files → no new errors.
- [ ] **Step 6: Commit** — stage `category.tsx`, `category.test.tsx`, `search.tsx`, `search.css` (the `git rm` is already staged); message `feat(msd): category map view; explore uses DealMap (Leaflet)`.

---

### Task 15: Verify and document

**Files:** Modify `DEPLOYMENT.md`, `TASK.md`.

- [ ] **Step 1:** `npx nx run msd:test --skip-nx-cache` → all pass except the 3 known failures in `app.spec.tsx` and `otp.test.tsx`. Anything else is a regression: fix before continuing.
- [ ] **Step 2:** `npx nx build msd` → succeeds. Confirm Leaflet is in its own chunk: `ls dist/apps/msd/assets | grep -i leaflet` (or grep the build output for a separate `leaflet-map` chunk).
- [ ] **Step 3: Visual check** (restart `npx nx serve msd` if it was running before these changes). At 1440×900 and 390×844, light and dark:
  - `/category/massage`: h1 + total right, description with More when long, pills (scroll on phone), toolbar (Filters, All cities | search, Show on map, Sort); 12 cards then more on scroll; "Showing n of m".
  - Sort menu, city menu → `/category/massage/gorakhpur`, Filters dialog → `?min=&max=`.
  - Show on map: OpenStreetMap tiles, price pills in brand primary, attribution visible, pill click opens the deal.
  - `/category/product`: no location, no map; `/category/therapy` (or any THERAPY category): search only.
  - `/explore?q=spa` map view: real OSM map, no "can't load Google Maps" message, no placeholder text.
  - No horizontal scroll (`document.documentElement.scrollWidth === innerWidth`).
  Fix problems in component CSS, never in page CSS.
- [ ] **Step 4:** Impeccable detector: `"C:/Users/sande/.claude/plugins/cache/impeccable/impeccable/4.3.1/skills/impeccable/scripts/impeccable" detect --json apps/msd/src/app/pages/category apps/msd/src/app/components/clamp-text apps/msd/src/app/components/chip-nav apps/msd/src/app/components/listing-toolbar apps/msd/src/app/components/choice-menu apps/msd/src/app/components/load-more apps/msd/src/app/components/price-filter-dialog apps/msd/src/app/components/deal-map` → `[]` (fix real findings).
- [ ] **Step 5: Docs.** In `DEPLOYMENT.md`, next to where msd's `VITE_GOOGLE_MAPS_API_KEY` (or msd's Vercel env vars) is documented, add `VITE_MAP_PROVIDER` (`leaflet` default / `google`), `VITE_MAP_TILE_URL`, `VITE_MAP_TILE_ATTRIBUTION` with one line each; if no such section exists, add a short "msd map" subsection under msd's Vercel environment variables. In `TASK.md` under `### msd shell — follow-ups` add:
```markdown
- [ ] msd: deal page single-location map using DealMap
- [ ] msd: before traffic grows, move VITE_MAP_TILE_URL off tile.openstreetmap.org to a free-tier tile provider (OSM tile policy: no heavy commercial use)
- [ ] msd: API sorts for rating and price so the category sort menu can offer them
```
- [ ] **Step 6: Commit** — `git add DEPLOYMENT.md TASK.md`, message `docs(msd): map env vars and category follow-ups`.
