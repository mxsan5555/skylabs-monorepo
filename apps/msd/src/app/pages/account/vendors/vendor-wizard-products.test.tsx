import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Category, VendorProduct } from '../../../../api/rbac/vendors';

const listVendorProductsMock = vi.fn();
const createVendorProductMock = vi.fn();
const updateVendorProductMock = vi.fn();
const setVendorProductStatusMock = vi.fn();
const deleteVendorProductMock = vi.fn();

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listVendorProducts: (...args: unknown[]) => listVendorProductsMock(...args),
    createVendorProduct: (...args: unknown[]) => createVendorProductMock(...args),
    updateVendorProduct: (...args: unknown[]) => updateVendorProductMock(...args),
    setVendorProductStatus: (...args: unknown[]) => setVendorProductStatusMock(...args),
    deleteVendorProduct: (...args: unknown[]) => deleteVendorProductMock(...args),
  };
});

import { VendorProductsStep } from './vendor-wizard-products';

const PRODUCT_CATEGORIES: Category[] = [
  { id: 'prod-1', name: 'Oils', slug: 'oils', parentId: null, isActive: true, type: 'PRODUCT' },
  { id: 'prod-2', name: 'Skincare', slug: 'skincare', parentId: null, isActive: true, type: 'PRODUCT' },
];

const SERVICE_CATEGORY_LOOKALIKE: Category = {
  id: 'svc-1',
  name: 'Massage',
  slug: 'massage',
  parentId: null,
  isActive: true,
  type: 'SERVICE',
};

function renderStep(overrides: Partial<React.ComponentProps<typeof VendorProductsStep>> = {}) {
  return render(
    <VendorProductsStep
      token="tok"
      vendorId="vendor-1"
      canEdit
      offersProduct
      categories={PRODUCT_CATEGORIES}
      onProductsChange={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listVendorProductsMock.mockResolvedValue({ data: [] });
});

/**
 * Feature: Vendor onboarding Step 5 — Products
 * Scenario: Step gating on the `offersProduct` module flag
 *
 * Given: a vendor that has not enabled the Product business module in Step 2
 * When: an admin opens Step 5
 * Then: the step shows an explanatory message and never renders product CRUD
 *
 * Edge cases:
 * - offersProduct=true but zero granted Product categories -> "Add product" hidden, hint shown
 * - offersProduct=true with granted categories -> Category select scoped to only those
 */
describe('VendorProductsStep — module gating', () => {
  it('shows a "module not enabled" message and no product CRUD when offersProduct is false', async () => {
    renderStep({ offersProduct: false });
    expect(screen.getByText('This vendor has not enabled the Product business module in Step 2.')).toBeTruthy();
    expect(screen.queryAllByText('Add product').length).toBe(0);
    await waitFor(() => expect(listVendorProductsMock).toHaveBeenCalled());
  });

  it('renders product CRUD when offersProduct is true and categories are granted', async () => {
    renderStep();
    await waitFor(() => expect(listVendorProductsMock).toHaveBeenCalled());
    expect(screen.getAllByText('Add product').length).toBeGreaterThan(0);
  });

  // Edge case: no granted category yet
  it('hides "Add product" and shows a hint when offersProduct is true but zero Product categories are granted', async () => {
    renderStep({ categories: [] });
    await waitFor(() => expect(listVendorProductsMock).toHaveBeenCalled());
    expect(screen.queryAllByText('Add product').length).toBe(0);
    expect(screen.getByText('Grant this business at least one Product category in Step 2 before adding products.')).toBeTruthy();
  });
});

/**
 * Feature: Vendor onboarding Step 5 — Products
 * Scenario: the product Category dropdown is scoped to the vendor's granted PRODUCT categories
 *
 * Given: a vendor granted specific PRODUCT categories
 * When: the Add Product form renders
 * Then: only those categories appear in the Category select
 */
describe('VendorProductsStep — category-access-scoped Category picker', () => {
  it('lists exactly the vendor-granted Product categories as Category options', async () => {
    renderStep();
    await waitFor(() => expect(listVendorProductsMock).toHaveBeenCalled());
    const select = document.querySelector('md-outlined-select');
    expect(select).toBeTruthy();
    const optionLabels = Array.from(select!.querySelectorAll('md-select-option')).map((o) => o.textContent?.trim());
    expect(optionLabels).toEqual(['Oils', 'Skincare']);
  });

  it('excludes an unrelated category not in the granted list', async () => {
    renderStep({ categories: [PRODUCT_CATEGORIES[0]] });
    await waitFor(() => expect(listVendorProductsMock).toHaveBeenCalled());
    const select = document.querySelector('md-outlined-select');
    expect(select?.textContent).not.toContain('Skincare');
  });

  it('documents that this component trusts its `categories` prop for type-scoping (a stray SERVICE row would still render)', async () => {
    renderStep({ categories: [...PRODUCT_CATEGORIES, SERVICE_CATEGORY_LOOKALIKE] });
    await waitFor(() => expect(listVendorProductsMock).toHaveBeenCalled());
    const select = document.querySelector('md-outlined-select');
    expect(select?.textContent).toContain('Massage');
  });
});

/**
 * Feature: ProductFormDialog — optional 3rd, Type-tier category select
 * Scenario: same 3-level cascade as `DealDialog` (see `vendor-branches.test.tsx`'s identical
 * suite) — a granted PRODUCT category tree may now be 3 levels deep (Category -> Subcategory ->
 * Type, e.g. "Oils" -> "Essential Oils" -> "Lavender Oil"); the Type select renders only once a
 * Subcategory with actual children is the current pick, and a 2-level-only branch (e.g.
 * "Skincare" -> "Moisturizer") keeps behaving exactly as before.
 *
 * Given: the vendor's granted PRODUCT categories include both a 3-level chain and a 2-level-only
 *        chain
 * When: the Add dialog defaults to the first granted category, or an existing Product is edited
 * Then: Subcategory renders whenever the resolved Category has children; Type renders only once a
 *       Subcategory with its own children is the resolved pick
 *
 * Edge cases:
 * - the Add dialog's own auto-selected first category never pre-picks a Subcategory, so Type
 *   never appears until a Subcategory is actually resolved (i.e. via editing an existing Product)
 * - a Product under a 2-level-only branch (Skincare -> Moisturizer) shows no Type select
 *
 * NOTE: same jsdom + `@lit/react` + React 19 select-interaction limitation documented in
 * `search.test.tsx`/`vendor-branches.test.tsx` — verified here via each dialog's already-resolved
 * initial state, not a live pick. The live interactive flow is covered at the Playwright E2E level.
 */
describe('ProductFormDialog — Type-tier select (3-level categories)', () => {
  const TOP_OILS: Category = { id: 'top-oils', name: 'Oils', slug: 'oils', parentId: null, isActive: true, type: 'PRODUCT' };
  const SUB_ESSENTIAL: Category = { id: 'sub-essential', name: 'Essential Oils', slug: 'essential-oils', parentId: 'top-oils', isActive: true };
  const TYPE_LAVENDER: Category = { id: 'type-lavender', name: 'Lavender Oil', slug: 'lavender-oil', parentId: 'sub-essential', isActive: true };
  const TOP_SKINCARE: Category = { id: 'top-skincare', name: 'Skincare', slug: 'skincare', parentId: null, isActive: true, type: 'PRODUCT' };
  const SUB_MOISTURIZER: Category = { id: 'sub-moisturizer', name: 'Moisturizer', slug: 'moisturizer', parentId: 'top-skincare', isActive: true };
  const THREE_TIER_CATEGORIES: Category[] = [TOP_OILS, SUB_ESSENTIAL, TYPE_LAVENDER, TOP_SKINCARE, SUB_MOISTURIZER];

  function optionLabelsOf(select: Element): (string | undefined)[] {
    return Array.from(select.querySelectorAll('md-select-option')).map((o) => o.textContent?.trim());
  }

  /** `<md-outlined-button>`'s Material-internals-assigned role isn't understood by jsdom's
   *  accessibility tree (same documented gap as `md-filled-button` — see
   *  `categories.test.tsx`'s `saveButtonIn`/`vendor-wizard-modules.test.tsx`'s `findSaveButton`),
   *  so `getByRole('button', ...)` can't find the row's "Edit" trigger. Query by tag + text. */
  function clickEditButton(): void {
    // The button also slots an `<md-icon>` ("edit") ahead of the text, so textContent is
    // "editEdit", not a plain "Edit" — match by suffix.
    const el = Array.from(document.querySelectorAll('md-outlined-button')).find((node) => (node.textContent ?? '').trim().endsWith('Edit'));
    if (!el) throw new Error('Edit button not found');
    fireEvent.click(el);
  }

  function productAt(overrides: Partial<VendorProduct>): VendorProduct {
    return {
      id: 'product-x',
      vendorId: 'vendor-1',
      name: 'Test product',
      slug: 'test-product',
      categoryId: TOP_OILS.id,
      subcategoryId: null,
      price: '199',
      isNew: false,
      isFeatured: false,
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      ...overrides,
    };
  }

  it('the Add dialog defaults to the first granted category and shows Subcategory (it has children), but Type stays hidden until a Subcategory is actually resolved', async () => {
    renderStep({ categories: THREE_TIER_CATEGORIES });
    await waitFor(() => expect(listVendorProductsMock).toHaveBeenCalled());
    const selects = document.querySelectorAll('md-outlined-select');
    expect(selects.length).toBe(2); // Category, Subcategory — no Type yet
    expect(optionLabelsOf(selects[0])).toEqual(['Oils', 'Skincare']);
    expect(optionLabelsOf(selects[1])).toEqual(['None', 'Essential Oils']);
    expect(screen.queryByText('Type (optional)')).toBeNull();
  });

  it('editing an existing Product whose subcategoryId is a Type-tier row (Lavender Oil) shows all 3 selects, scoped to its own Edit dialog', async () => {
    const product = productAt({ id: 'product-lavender', name: 'Lavender Oil 100ml', categoryId: TOP_OILS.id, subcategoryId: TYPE_LAVENDER.id });
    listVendorProductsMock.mockResolvedValue({ data: [product] });
    renderStep({ categories: THREE_TIER_CATEGORIES });
    await waitFor(() => expect(screen.getByText('Lavender Oil 100ml')).toBeTruthy());

    clickEditButton();

    await waitFor(() => {
      const dialogs = Array.from(document.querySelectorAll('md-dialog'));
      const editDialog = dialogs[dialogs.length - 1]; // Edit renders after Add in document order
      const selects = editDialog.querySelectorAll('md-outlined-select');
      expect(selects.length).toBe(3); // Category, Subcategory, Type
      expect(optionLabelsOf(selects[1])).toEqual(['None', 'Essential Oils']);
      expect(optionLabelsOf(selects[2])).toEqual(['None', 'Lavender Oil']);
    });
  });

  // Edge case / core regression: a Product under a 2-level-only branch (Skincare -> Moisturizer)
  // never shows a Type select — unchanged from before this feature.
  it('editing an existing Product under a 2-level-only branch (Skincare -> Moisturizer) shows no Type select', async () => {
    const product = productAt({ id: 'product-moisturizer', name: 'Daily Moisturizer', categoryId: TOP_SKINCARE.id, subcategoryId: SUB_MOISTURIZER.id });
    listVendorProductsMock.mockResolvedValue({ data: [product] });
    renderStep({ categories: THREE_TIER_CATEGORIES });
    await waitFor(() => expect(screen.getByText('Daily Moisturizer')).toBeTruthy());

    clickEditButton();

    await waitFor(() => {
      // Only the Edit dialog's own selects matter here; scope by dialog to avoid counting the
      // still-mounted Add dialog's own Category+Subcategory selects.
      const dialogs = Array.from(document.querySelectorAll('md-dialog'));
      const editDialog = dialogs[dialogs.length - 1];
      expect(editDialog.querySelectorAll('md-outlined-select').length).toBe(2); // Category, Subcategory — no Type
      expect(within(editDialog).queryByText('Type (optional)')).toBeNull();
    });
  });
});
