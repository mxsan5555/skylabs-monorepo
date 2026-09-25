import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import type { Branch, BranchCategoryAccessRow, Category, VendorProduct } from '../../../../api/rbac/vendors';

const listDealsMock = vi.fn();
const createDealMock = vi.fn();
const updateDealMock = vi.fn();
const setDealStatusMock = vi.fn();
const approveDealMock = vi.fn();
const rejectDealMock = vi.fn();
// DealDialog's Category picker is now branch-scoped (`getBranchCategoryAccess`), not sourced
// directly from the `categories` prop any more — see `DealDialog`'s own doc comment in
// vendor-branches.tsx.
const getBranchCategoryAccessMock = vi.fn();

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listDeals: (...args: unknown[]) => listDealsMock(...args),
    createDeal: (...args: unknown[]) => createDealMock(...args),
    updateDeal: (...args: unknown[]) => updateDealMock(...args),
    setDealStatus: (...args: unknown[]) => setDealStatusMock(...args),
    approveDeal: (...args: unknown[]) => approveDealMock(...args),
    rejectDeal: (...args: unknown[]) => rejectDealMock(...args),
    getBranchCategoryAccess: (...args: unknown[]) => getBranchCategoryAccessMock(...args),
  };
});

import { VendorDealsStep } from './vendor-wizard-deals';

const BRANCH: Branch = {
  id: 'branch-1',
  vendorId: 'vendor-1',
  name: 'Main Branch',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const SERVICE_CATEGORIES: Category[] = [
  { id: 'svc-1', name: 'Massage', slug: 'massage', parentId: null, isActive: true, type: 'SERVICE' },
  { id: 'svc-2', name: 'Facial', slug: 'facial', parentId: null, isActive: true, type: 'SERVICE' },
];

// This branch's own mapping — the Category picker is scoped to THIS (not the vendor-wide
// `categories` prop, which now only backs the "stale value" name lookup).
const BRANCH_CATEGORY_ACCESS: BranchCategoryAccessRow[] = SERVICE_CATEGORIES.map((c) => ({
  id: `bca-${c.id}`,
  branchId: BRANCH.id,
  categoryId: c.id,
  createdAt: '2026-01-01T00:00:00Z',
  category: c,
  subcategories: [],
}));

const PRODUCT: VendorProduct = {
  id: 'product-1',
  vendorId: 'vendor-1',
  name: 'Massage Oil',
  slug: 'massage-oil',
  categoryId: 'prod-1',
  subcategoryId: null,
  price: '199',
  isNew: false,
  isFeatured: false,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderStep(overrides: Partial<React.ComponentProps<typeof VendorDealsStep>> = {}) {
  return render(
    <ToastProvider>
      <VendorDealsStep
        token="tok"
        vendorId="vendor-1"
        canEdit
        canApprove={false}
        branches={[BRANCH]}
        categories={SERVICE_CATEGORIES}
        products={[]}
        {...overrides}
      />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listDealsMock.mockResolvedValue({ data: [] });
  getBranchCategoryAccessMock.mockResolvedValue({ data: BRANCH_CATEGORY_ACCESS });
});

/**
 * Feature: Vendor onboarding Step 3 — Deals
 * Scenario: a Deal can only be created if the vendor has a branch AND at least one granted
 * SERVICE category or one active Product to sell (the old "pick a global Service" step is gone)
 *
 * Given: a vendor with a branch and granted SERVICE categories
 * When: Step 3 renders
 * Then: "Add deal" is available and its Category select is scoped to the granted SERVICE
 *       categories only
 *
 * Edge cases:
 * - zero branches -> "Add deal" hidden entirely, hint to go back to Step 2
 * - a branch exists but zero granted SERVICE categories AND zero products -> "Add deal" hidden
 */
describe('VendorDealsStep — gating on branches + category/product availability', () => {
  it('shows a hint and no "Add deal" trigger when there are no branches yet', async () => {
    renderStep({ branches: [] });
    expect(screen.getByText('Add a branch in Step 2 before adding deals.')).toBeTruthy();
    expect(screen.queryAllByText('Add deal').length).toBe(0);
  });

  it('hides "Add deal" when a branch exists but there are zero granted SERVICE categories and zero products', async () => {
    renderStep({ categories: [], products: [] });
    await waitFor(() => expect(listDealsMock).toHaveBeenCalled());
    expect(screen.queryAllByText('Add deal').length).toBe(0);
  });

  it('shows "Add deal" once a branch exists and at least one SERVICE category is granted', async () => {
    renderStep();
    await waitFor(() => expect(listDealsMock).toHaveBeenCalled());
    expect(screen.getAllByText('Add deal').length).toBeGreaterThan(0);
  });

  it('shows "Add deal" when there are zero granted categories but at least one active product exists (product-offering path)', async () => {
    renderStep({ categories: [], products: [PRODUCT] });
    await waitFor(() => expect(listDealsMock).toHaveBeenCalled());
    expect(screen.getAllByText('Add deal').length).toBeGreaterThan(0);
  });
});

/**
 * Feature: Vendor onboarding Step 3 — Deals
 * Scenario: the Service-offering Category select in the Add Deal dialog is scoped to the ACTIVE
 * BRANCH's own `BranchCategoryAccess` mapping (`getBranchCategoryAccess`), not the vendor-wide
 * `categories` prop any more — the removed global Service master's dropdown is gone, and the
 * vendor-wide grant list is now only a name-lookup fallback for a stale value (see `DealDialog`'s
 * own doc comment in vendor-branches.tsx).
 */
describe('VendorDealsStep — category-access-scoped Deal Category picker', () => {
  it('lists exactly the branch-mapped SERVICE categories as Category options for a service deal', async () => {
    renderStep();
    await waitFor(() => expect(getBranchCategoryAccessMock).toHaveBeenCalledWith('tok', 'vendor-1', BRANCH.id));
    // The default offering type is "service", so the Category select renders immediately.
    const categorySelect = await waitFor(() => {
      const selects = Array.from(document.querySelectorAll('md-outlined-select'));
      const found = selects.find((el) => el.textContent?.includes('Massage'));
      expect(found).toBeTruthy();
      return found!;
    });
    const optionLabels = Array.from(categorySelect.querySelectorAll('md-select-option')).map((o) => o.textContent?.trim());
    expect(optionLabels).toEqual(['Select a category', 'Massage', 'Facial']);
  });

  it('shows a "map a category" hint instead of the Category select body when zero categories are mapped to the branch (product-only vendor)', async () => {
    getBranchCategoryAccessMock.mockResolvedValue({ data: [] });
    renderStep({ categories: [], products: [PRODUCT] });
    await waitFor(() => expect(getBranchCategoryAccessMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByText('No categories are mapped to this branch yet — map one under Business Modules & Category Access first.'),
      ).toBeTruthy(),
    );
  });
});
