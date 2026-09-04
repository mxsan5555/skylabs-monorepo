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
