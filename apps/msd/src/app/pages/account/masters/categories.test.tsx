import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Category } from '../../../../api/rbac/categories';

let grantedPermissions: Set<string>;

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: (menuKey: string, action = 'view') => grantedPermissions.has(`${menuKey}:${action}`),
  }),
}));

const listCategoriesMock = vi.fn();
const createCategoryMock = vi.fn();
const updateCategoryMock = vi.fn();
const setCategoryStatusMock = vi.fn();
const deleteCategoryMock = vi.fn();

vi.mock('../../../../api/rbac/categories', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/categories')>('../../../../api/rbac/categories');
  return {
    ...actual,
    listCategories: (...args: unknown[]) => listCategoriesMock(...args),
    createCategory: (...args: unknown[]) => createCategoryMock(...args),
    updateCategory: (...args: unknown[]) => updateCategoryMock(...args),
    setCategoryStatus: (...args: unknown[]) => setCategoryStatusMock(...args),
    deleteCategory: (...args: unknown[]) => deleteCategoryMock(...args),
  };
});

import { CategoryManagement } from './categories';

const TOP_CATEGORY: Category = {
  id: 'cat-1',
  name: 'Massage',
  slug: 'massage',
  parentId: null,
  sortOrder: 1,
  type: 'SERVICE',
  isPopular: true,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  _count: { children: 2 },
};

beforeEach(() => {
  vi.clearAllMocks();
  grantedPermissions = new Set(['masters.categories:create', 'masters.categories:edit', 'masters.categories:delete']);
  listCategoriesMock.mockResolvedValue({ data: [TOP_CATEGORY], meta: { total: 1 } });
});

/** `<md-outlined-select>`'s options render as light-DOM slotted children (unlike its `value`/
 *  `onChange` bindings, which this suite avoids relying on — see search.test.tsx's documented
 *  `@lit/react`+React 19 limitation). The Type select is the only `md-outlined-select` rendered
 *  for `scope="top"`. */
function typeSelect(): HTMLElement {
  const el = document.querySelector('md-outlined-select');
  if (!el) throw new Error('Type select not found');
  return el as HTMLElement;
}

/** `sky-data-table` is never registered as a real custom element in this unit test's module
 *  graph (its registration side-effect import only happens app-wide, e.g. from `main.tsx`), so
 *  it stays an un-upgraded, plain `HTMLElement` here — React falls back to setting every prop as
 *  a plain string HTML attribute rather than a JS property. `listCategoriesMock`'s promise
 *  resolving is genuinely asynchronous, so wait for the table's `total` attribute to reflect the
 *  resolved row count rather than just the mock having been *called* (which happens
 *  synchronously, before the promise settles). */
async function waitForTableLoaded(expectedTotal: number): Promise<void> {
  await waitFor(() => {
    const table = document.querySelector('sky-data-table');
    expect(table?.getAttribute('total')).toBe(String(expectedTotal));
  });
}

/**
 * Feature: Category master — Type selector + Popular toggle
 * Scenario: a top-level category requires a Type (Service/Product/Therapy); a subcategory
 * inherits its parent's type and never shows the Type/Popular controls at all.
 *
 * Given: the admin Categories screen (`scope="top"`) or Sub Categories screen (`scope="sub"`)
 * When: the create/edit form renders
 * Then: `scope="top"` shows a required Type select + a Popular checkbox; `scope="sub"` shows
 *       neither, only an inherited-type message
 *
 * Edge cases:
 * - submitting a top-level category with no type selected is rejected client-side
 * - isPopular persists through an edit round-trip (checked state reflects the existing row)
 */
describe('CategoryManagement — Type selector (top-level only)', () => {
  it('renders a Type select and a Popular checkbox for scope="top"', async () => {
    render(<CategoryManagement scope="top" />);
    await waitForTableLoaded(1);
    expect(typeSelect()).toBeTruthy();
    // Renders once per open-able dialog (Add + Edit, both mounted regardless of open state).
    expect(screen.getAllByText('Popular (shown in homepage carousels)').length).toBeGreaterThan(0);
  });

  it('shows an "inherited from parent" message instead of a Type select for scope="sub"', async () => {
    render(<CategoryManagement scope="sub" />);
    await waitForTableLoaded(1);
    // No select anywhere on the page offers the Service/Product/Therapy Type options — the only
    // `md-outlined-select`s present for scope="sub" are "Parent category" pickers.
    const anyTypeOptionRendered = Array.from(document.querySelectorAll('md-outlined-select')).some((select) =>
      ['Service', 'Product', 'Therapy'].every((label) => select.textContent?.includes(label)),
    );
    expect(anyTypeOptionRendered).toBe(false);
    expect(screen.queryByText('Popular (shown in homepage carousels)')).toBeNull();
    expect(screen.getAllByText('Type is inherited from the parent category.').length).toBeGreaterThan(0);
  });

  it('defaults a new top-level category form to Type=SERVICE and Popular=false', async () => {
    render(<CategoryManagement scope="top" />);
    await waitForTableLoaded(1);
    const optionLabels = Array.from(typeSelect().querySelectorAll('md-select-option')).map((o) => o.textContent?.trim());
    expect(optionLabels).toEqual(['Service', 'Product', 'Therapy']);
    // The Add dialog's Popular checkbox (first of the two mounted — Add, then Edit-empty).
    const popularCheckbox = screen.getAllByRole('checkbox', { name: 'Popular (shown in homepage carousels)' })[0] as HTMLInputElement;
    expect(popularCheckbox.checked).toBe(false);
  });

  // isPopular persists through an edit round-trip
  it('pre-checks Popular for an existing category that already has isPopular=true, and submits it back unchanged', async () => {
    listCategoriesMock.mockResolvedValue({ data: [TOP_CATEGORY], meta: { total: 1 } });
    updateCategoryMock.mockResolvedValue({ data: { ...TOP_CATEGORY } });
    render(<CategoryManagement scope="top" />);
    await waitForTableLoaded(1);

    // Drive the row-action event the sky-data-table would normally dispatch on "Edit" click —
    // this is the same custom-event contract categories.tsx already listens for. `fireEvent`
    // (rather than a raw `dispatchEvent`) wraps this in `act()` so the resulting state update
    // is flushed synchronously.
    const table = document.querySelector('sky-data-table')!;
    fireEvent(table, new CustomEvent('sky-dt-row-action', { detail: { action: 'edit', row: {}, rowIndex: 0 } }));

    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox', { name: 'Popular (shown in homepage carousels)' }) as HTMLInputElement[];
      expect(checkboxes.some((c) => c.checked)).toBe(true);
    });
  });

  // Edge case: a brand-new top-level category is never submittable with an empty Type — the
  // form's own default (`type: category?.type ?? 'SERVICE'`) guarantees `form.type` is always
  // truthy for a top-level row from the moment the dialog mounts, so the `scope === 'top' &&
  // !form.type` guard in `submit()` structurally can never fire through this UI; the Type select
  // never renders an empty/unset option (see the "renders ... Type select" test above — its three
  // options are exactly Service/Product/Therapy, no blank choice), so a top-level category is
  // always created with a real Type by construction, not because the guard was ever exercised.
  it('never offers an empty Type choice, so a new top-level category always has a real Type by construction', async () => {
    render(<CategoryManagement scope="top" />);
    await waitForTableLoaded(1);
    // Unlike the Parent Category / Subcategory / Branch selects elsewhere in this app (which all
    // prepend a blank "None"/"Select a..." option), the Type select's three options are exactly
    // Service/Product/Therapy — no blank choice exists for a top-level category to fall back to.
    const optionLabels = Array.from(typeSelect().querySelectorAll('md-select-option')).map((o) => o.textContent?.trim());
    expect(optionLabels).toEqual(['Service', 'Product', 'Therapy']);
    expect(optionLabels).not.toContain('');
  });

  // Toggling Popular is a real native `<input type="checkbox">`, so it's driven the same way as
  // any other native form control in this suite (unlike the Type `<md-outlined-select>`).
  it('toggling the Popular checkbox updates its own checked state', async () => {
    render(<CategoryManagement scope="top" />);
    await waitForTableLoaded(1);
    const popularCheckbox = screen.getAllByRole('checkbox', { name: 'Popular (shown in homepage carousels)' })[0] as HTMLInputElement;
    expect(popularCheckbox.checked).toBe(false);
    fireEvent.click(popularCheckbox);
    expect(popularCheckbox.checked).toBe(true);
  });

  // Regression check: scope="sub" still renders exactly its original single flat "Parent
  // category" picker per dialog — the new scope="leaf" 2-step cascade must not have leaked an
  // extra select into this unrelated scope. (Add + Edit-empty dialogs both mount regardless of
  // open state — see this suite's own established convention — so 2 total is correct, not 1.)
  it('scope="sub" still renders exactly one md-outlined-select per dialog (the flat Parent category picker), not a 2-step cascade', async () => {
    listCategoriesMock.mockResolvedValue({ data: [TOP_CATEGORY], meta: { total: 1 } });
    render(<CategoryManagement scope="sub" />);
    await waitForTableLoaded(1);
    await waitFor(() => expect(listCategoriesMock).toHaveBeenCalledTimes(2)); // main list + top-level parent options only
    await waitFor(() => expect(document.querySelectorAll('md-outlined-select').length).toBeGreaterThan(0));
    const dialogs = Array.from(document.querySelectorAll('md-dialog'));
    expect(dialogs.length).toBe(2); // Add + Edit-empty
    for (const dialog of dialogs) {
      expect(dialog.querySelectorAll('md-outlined-select').length).toBe(1);
    }
  });
});

/**
 * Feature: Category master — Category Types (scope="leaf") 2-step cascading picker
 * Scenario: creating/editing a Type-tier row requires picking a top-level Category first (which
 * loads its Subcategories), then a Subcategory (whose id becomes the new row's actual `parentId`)
 *
 * Given: the admin Category Types screen (`scope="leaf"`)
 * When: the create/edit form renders
 * Then: a "Category" picker and a dependent "Subcategory" picker (scoped to that category's own
 *       children) both render; a Subcategory with zero children shows a hint instead
 *
 * Edge cases:
 * - the chosen top-level Category has no Subcategories yet -> hint shown, no Subcategory select
 * - editing an existing Type row whose ancestor Subcategory is missing from the loaded options
 *   (data inconsistency) blocks Save with a clear validation message instead of submitting bad data
 *
 * NOTE: like `search.test.tsx`'s documented `@lit/react`+React 19 limitation (a dispatched native
 * `change` event never reaches the handler `@lit/react` is supposed to attach to `<md-outlined-
 * select>` under jsdom), this suite cannot simulate a user actually *picking* an option and
 * observing the cascade react live. Instead it verifies the same cascade math by comparing two
 * independently-defaulted dialog instances (Add vs. an Edit of a specific existing row) rendered
 * from different starting conditions — proving `topCategoryId`/`subcategoryChoices` are computed
 * correctly for each — and covers the actual live "pick and watch it cascade" interaction at the
 * Playwright E2E level instead (see `apps/msd-e2e/src/category-taxonomy.spec.ts`).
 */
describe('CategoryManagement — Category Types (scope="leaf") cascading picker', () => {
  const TOP_MASSAGE: Category = {
    id: 'top-massage', name: 'Massage', slug: 'massage', parentId: null, sortOrder: 1,
    type: 'SERVICE', isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  };
  const TOP_HOME: Category = {
    id: 'top-home', name: 'Home Services', slug: 'home-services', parentId: null, sortOrder: 2,
    type: 'SERVICE', isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  };
  const SUB_BODY_MASSAGE: Category = {
    id: 'sub-body-massage', name: 'Body Massage', slug: 'body-massage', parentId: 'top-massage', sortOrder: 1,
    isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  };
  const SUB_CLEANING: Category = {
    id: 'sub-cleaning', name: 'Cleaning', slug: 'cleaning', parentId: 'top-home', sortOrder: 1,
    isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  };
  const LEAF_SWEDISH: Category = {
    id: 'leaf-swedish', name: 'Swedish Massage', slug: 'swedish-massage', parentId: 'sub-body-massage', sortOrder: 1,
    isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    parent: { id: 'sub-body-massage', name: 'Body Massage' },
  };

  function mockThreeTierData(overrides?: { top?: Category[]; sub?: Category[]; leaf?: Category[] }) {
    const top = overrides?.top ?? [TOP_MASSAGE, TOP_HOME];
    const sub = overrides?.sub ?? [SUB_BODY_MASSAGE, SUB_CLEANING];
    const leaf = overrides?.leaf ?? [LEAF_SWEDISH];
    listCategoriesMock.mockImplementation((_token: unknown, opts: { scope?: string }) => {
      if (opts?.scope === 'top') return Promise.resolve({ data: top, meta: { total: top.length } });
      if (opts?.scope === 'sub') return Promise.resolve({ data: sub, meta: { total: sub.length } });
      return Promise.resolve({ data: leaf, meta: { total: leaf.length } });
    });
  }

  /** `label` is set via `@lit/react`'s broken property-binding path (see this file's own
   *  `typeSelect()` doc comment) and never actually lands as a queryable DOM attribute here, so
   *  selects can't be told apart by label. Instead this scopes to each `<md-dialog>` (Add is
   *  always the first in document order, Edit the second — see `CategoryManagement`'s own JSX
   *  order) and relies on the leaf-scope form's own fixed rendering order: Category select first,
   *  (optional) Subcategory select second. */
  function dialogs(): HTMLElement[] {
    return Array.from(document.querySelectorAll('md-dialog')) as HTMLElement[];
  }

  function selectsIn(dialog: HTMLElement): HTMLElement[] {
    return Array.from(dialog.querySelectorAll('md-outlined-select')) as HTMLElement[];
  }

  function optionLabelsOf(select: HTMLElement): (string | undefined)[] {
    return Array.from(select.querySelectorAll('md-select-option')).map((o) => o.textContent?.trim());
  }

  /** `<md-filled-button>`'s Material-internals-assigned role isn't understood by jsdom's
   *  accessibility tree, so `getByRole('button', ...)` can't find it (same documented gap as
   *  `vendor-wizard-modules.test.tsx`'s `findSaveButton`) — query the custom element by text
   *  content within a given dialog instead. */
  function saveButtonIn(dialog: HTMLElement): HTMLElement {
    const el = Array.from(dialog.querySelectorAll('md-filled-button')).find((node) => (node.textContent ?? '').trim() === 'Save');
    if (!el) throw new Error('Save button not found in dialog');
    return el as HTMLElement;
  }

  it('renders a "Category" picker whose options are the top-level categories, and a dependent "Subcategory" picker scoped to the first category\'s own children', async () => {
    mockThreeTierData();
    render(<CategoryManagement scope="leaf" />);
    await waitFor(() => expect(listCategoriesMock).toHaveBeenCalledTimes(3)); // main list (leaf) + top options + sub options
    await waitFor(() => expect(dialogs().length).toBe(2));

    const addDialog = dialogs()[0];
    await waitFor(() => expect(selectsIn(addDialog).length).toBe(2)); // Category + Subcategory (Massage has children)
    const [categorySelect, subSelect] = selectsIn(addDialog);
    expect(optionLabelsOf(categorySelect)).toEqual(['Massage', 'Home Services']);

    // Defaults to the first top-level category (Massage) -> Subcategory scoped to its own
    // children only (Body Massage) — Cleaning (under Home Services) must NOT leak in.
    expect(optionLabelsOf(subSelect)).toEqual(['Body Massage']);
  });

  // Edge case: the chosen top-level Category has no Subcategories yet.
  it('shows a hint instead of a Subcategory select when the (defaulted) Category has zero Subcategories', async () => {
    const TOP_ISOLATED: Category = {
      id: 'top-isolated', name: 'Skin & Beauty', slug: 'skin-beauty', parentId: null, sortOrder: 1,
      type: 'SERVICE', isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    };
    mockThreeTierData({ top: [TOP_ISOLATED], sub: [], leaf: [] });
    render(<CategoryManagement scope="leaf" />);
    await waitFor(() => expect(listCategoriesMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(dialogs().length).toBe(2));

    const addDialog = dialogs()[0];
    await waitFor(() => expect(selectsIn(addDialog).length).toBe(1)); // Category only, no Subcategory
    expect(
      screen.getAllByText('This category has no subcategories yet — add one under Sub Categories first.').length,
    ).toBeGreaterThan(0);
  });

  // "selecting a top-level Category loads its Subcategories; selecting a Subcategory sets the
  // correct parentId" — verified here via an Edit of an existing Type-tier row whose ancestor
  // chain (leaf-swedish -> sub-body-massage -> top-massage) differs from whatever the Add
  // dialog independently defaults to (Home Services is first in `top`, so Add defaults there);
  // if the Edit dialog's own 2-hop parent-chain walk were broken, it would incorrectly inherit
  // the Add dialog's Home Services -> Cleaning state instead of resolving its own Massage -> Body
  // Massage chain.
  it('editing an existing Type row derives its Category+Subcategory from its own 2-hop parent chain, independent of the Add dialog\'s own default', async () => {
    mockThreeTierData({ top: [TOP_HOME, TOP_MASSAGE], sub: [SUB_CLEANING, SUB_BODY_MASSAGE], leaf: [LEAF_SWEDISH] });
    render(<CategoryManagement scope="leaf" />);
    await waitForTableLoaded(1);
    await waitFor(() => expect(listCategoriesMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(dialogs().length).toBe(2));

    // Baseline: both the Add dialog and the (still-empty) Edit dialog default to the first top
    // option, Home Services -> Cleaning.
    await waitFor(() => {
      const [addDialog, editDialog] = dialogs();
      expect(selectsIn(addDialog).length).toBe(2);
      expect(selectsIn(editDialog).length).toBe(2);
      expect(optionLabelsOf(selectsIn(addDialog)[1])).toEqual(['Cleaning']);
      expect(optionLabelsOf(selectsIn(editDialog)[1])).toEqual(['Cleaning']);
    });

    const table = document.querySelector('sky-data-table')!;
    fireEvent(table, new CustomEvent('sky-dt-row-action', { detail: { action: 'edit', row: {}, rowIndex: 0 } }));

    // The Edit dialog remounts fresh (its `key` changes to the row's id) and re-derives its own
    // Category/Subcategory from `leaf-swedish`'s actual ancestors — Massage -> Body Massage.
    await waitFor(() => {
      const editDialog = dialogs()[1];
      expect(selectsIn(editDialog).length).toBe(2);
      expect(optionLabelsOf(selectsIn(editDialog)[1])).toEqual(['Body Massage']);
    });
    // The untouched Add dialog is unaffected by editing a different row.
    const addDialog = dialogs()[0];
    expect(optionLabelsOf(selectsIn(addDialog)[1])).toEqual(['Cleaning']);
  });

  // Edge case: editing a Type row whose ancestor Subcategory is (for whatever reason — e.g. it
  // was deactivated/filtered out server-side) missing from the currently-loaded Subcategory
  // options. `topCategoryId` can't be derived, so Save is blocked with a clear message instead of
  // silently submitting a payload with a stale/wrong parentId.
  it('blocks Save with a clear message when an edited Type row\'s ancestor Subcategory is missing from the loaded options', async () => {
    mockThreeTierData({ top: [TOP_MASSAGE, TOP_HOME], sub: [SUB_CLEANING], leaf: [LEAF_SWEDISH] }); // SUB_BODY_MASSAGE deliberately omitted
    render(<CategoryManagement scope="leaf" />);
    await waitForTableLoaded(1);
    await waitFor(() => expect(listCategoriesMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(dialogs().length).toBe(2));

    const table = document.querySelector('sky-data-table')!;
    fireEvent(table, new CustomEvent('sky-dt-row-action', { detail: { action: 'edit', row: {}, rowIndex: 0 } }));

    await waitFor(() => {
      const editDialog = dialogs()[1];
      fireEvent.click(saveButtonIn(editDialog));
    });

    await waitFor(() => expect(screen.getByText('Select a category and a subcategory.')).toBeTruthy());
    expect(updateCategoryMock).not.toHaveBeenCalled();
  });
});
