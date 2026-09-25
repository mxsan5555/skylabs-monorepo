import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import type { Category, Vendor, VendorCategoryAccessRow } from '../../../../api/rbac/vendors';

const listCategoriesMock = vi.fn();
const setVendorModulesAndCategoryAccessMock = vi.fn();
const setMyVendorModulesAndCategoryAccessMock = vi.fn();

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listCategories: (...args: unknown[]) => listCategoriesMock(...args),
    setVendorModulesAndCategoryAccess: (...args: unknown[]) => setVendorModulesAndCategoryAccessMock(...args),
    setMyVendorModulesAndCategoryAccess: (...args: unknown[]) => setMyVendorModulesAndCategoryAccessMock(...args),
  };
});

import { VendorProductCategoryAccess } from './vendor-wizard-modules';

/**
 * `<md-filled-button>` is a Material Web custom element — jsdom's accessibility tree doesn't
 * understand its internals-assigned role, so `getByRole('button', ...)` can't find it (same gap
 * already documented in `users.test.tsx`'s `findLoginAsButton`). Query the custom element
 * directly by its text content instead.
 */
function findSaveButton(): HTMLElement {
  const el = Array.from(document.querySelectorAll('md-filled-button')).find((node) =>
    (node.textContent ?? '').includes('Save product categories'),
  );
  if (!el) throw new Error('Save button not found');
  return el as HTMLElement;
}

function cat(id: string, name: string, type: Category['type'] = 'PRODUCT'): Category {
  return { id, name, slug: id, parentId: null, isActive: true, type };
}

const PRODUCT_CATS = [cat('prod-1', 'Oils'), cat('prod-2', 'Supplements')];

function baseVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: 'vendor-1',
    businessName: 'Test Spa',
    slug: 'test-spa',
    ownerUserId: 'user-1',
    kycStatus: 'PENDING',
    kycRejectionReason: null,
    status: 'PENDING_VERIFICATION',
    statusReason: null,
    createdByUserId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    offersService: false,
    offersProduct: false,
    offersTherapy: false,
    owner: null,
    ...overrides,
  } as Vendor;
}

function renderModules(vendor: Vendor, access: VendorCategoryAccessRow[] = []) {
  const onSaved = vi.fn();
  render(
    <ToastProvider>
      <VendorProductCategoryAccess token="tok" vendorId={vendor.id} isSelf={false} vendor={vendor} access={access} onSaved={onSaved} />
    </ToastProvider>,
  );
  return { onSaved };
}

beforeEach(() => {
  vi.clearAllMocks();
  listCategoriesMock.mockResolvedValue({ data: PRODUCT_CATS });
});

/**
 * Feature: Vendor onboarding Step 2 — Product Categories (Service/Therapy moved to per-branch)
 * Scenario: Service/Therapy category access is now managed entirely inside `BranchDialog`
 * (`vendor-branches.tsx`) — this screen only ever renders the Product module toggle and its own
 * Product category checklist.
 *
 * Given: a vendor with the Product module enabled or disabled
 * When: Step 2 renders
 * Then: only a Product checkbox and Product category checklist ever appear — never a
 *       Service/Therapy checkbox or category
 *
 * Edge cases:
 * - disabling Product drops its granted categories from the save payload
 * - any pre-existing Service/Therapy grants (created by the branch-level flow) are carried
 *   through the save payload untouched, never wiped by this Product-only screen
 */
describe('VendorProductCategoryAccess — Product-only scope', () => {
  it('fetches only PRODUCT categories, never SERVICE/THERAPY', async () => {
    renderModules(baseVendor({ offersProduct: true }));
    await waitFor(() => expect(listCategoriesMock).toHaveBeenCalledWith('tok', { type: 'PRODUCT' }));
    expect(listCategoriesMock).toHaveBeenCalledTimes(1);
  });

  it('never renders a Service or Therapy checkbox', async () => {
    renderModules(baseVendor({ offersProduct: true }));
    await waitFor(() => expect(screen.getByText('Oils')).toBeTruthy());
    expect(screen.queryByRole('checkbox', { name: 'Service' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Therapy' })).toBeNull();
  });

  it('shows an empty state and no category checklist when Product is not enabled', async () => {
    renderModules(baseVendor());
    await waitFor(() => expect(listCategoriesMock).toHaveBeenCalled());
    expect(screen.getByText('Enable the Product module above to grant it categories.')).toBeTruthy();
    expect(screen.queryByText('Oils')).toBeNull();
  });

  it('reveals the Product category checklist once the Product module is enabled', async () => {
    renderModules(baseVendor({ offersProduct: true }));
    await waitFor(() => expect(screen.getByText('Oils')).toBeTruthy());
    expect(screen.getByText('Supplements')).toBeTruthy();
  });

  it('pre-checks Product categories already present in the `access` prop', async () => {
    const vendor = baseVendor({ offersProduct: true });
    const access: VendorCategoryAccessRow[] = [
      { id: 'a1', vendorId: vendor.id, categoryId: 'prod-1', createdAt: '2026-01-01T00:00:00Z', category: PRODUCT_CATS[0] },
    ];
    renderModules(vendor, access);
    await waitFor(() => expect(screen.getByText('Oils')).toBeTruthy());
    const oilsCheckbox = screen.getByRole('checkbox', { name: 'Oils' }) as HTMLInputElement;
    const supplementsCheckbox = screen.getByRole('checkbox', { name: 'Supplements' }) as HTMLInputElement;
    expect(oilsCheckbox.checked).toBe(true);
    expect(supplementsCheckbox.checked).toBe(false);
  });

  it('turning Product off removes its checklist and drops its granted categories from the save payload', async () => {
    const vendor = baseVendor({ offersProduct: true });
    const access: VendorCategoryAccessRow[] = [
      { id: 'a1', vendorId: vendor.id, categoryId: 'prod-1', createdAt: '2026-01-01T00:00:00Z', category: PRODUCT_CATS[0] },
    ];
    setVendorModulesAndCategoryAccessMock.mockResolvedValue({ data: [] });
    renderModules(vendor, access);
    await waitFor(() => expect(screen.getByText('Oils')).toBeTruthy());

    fireEvent.click(screen.getByRole('checkbox', { name: 'Product' }));
    expect(screen.queryByText('Oils')).toBeNull();
    expect(screen.getByText('Enable the Product module above to grant it categories.')).toBeTruthy();

    fireEvent.click(findSaveButton());
    await waitFor(() => expect(setVendorModulesAndCategoryAccessMock).toHaveBeenCalled());
    const [, , payload] = setVendorModulesAndCategoryAccessMock.mock.calls[0];
    expect(payload.offersProduct).toBe(false);
    expect(payload.categoryIds).not.toContain('prod-1');
  });

  // Regression guard: `setVendorModulesAndCategoryAccess` is a replace-the-full-set call across
  // EVERY category type, not just Product (see msd-api's own doc comment on that function) — a
  // vendor's Service/Therapy grants are now created by the branch-level flow
  // (`setBranchCategoryAccess`), and this Product-only screen must never wipe them by omitting
  // them from the payload.
  it('carries pre-existing Service/Therapy grants through the save payload untouched', async () => {
    const vendor = baseVendor({ offersProduct: true, offersService: true, offersTherapy: true });
    const access: VendorCategoryAccessRow[] = [
      { id: 'a1', vendorId: vendor.id, categoryId: 'prod-1', createdAt: '2026-01-01T00:00:00Z', category: PRODUCT_CATS[0] },
      { id: 'a2', vendorId: vendor.id, categoryId: 'svc-branch-granted', createdAt: '2026-01-01T00:00:00Z', category: cat('svc-branch-granted', 'Massage', 'SERVICE') },
      { id: 'a3', vendorId: vendor.id, categoryId: 'ther-branch-granted', createdAt: '2026-01-01T00:00:00Z', category: cat('ther-branch-granted', 'Physiotherapy', 'THERAPY') },
    ];
    setVendorModulesAndCategoryAccessMock.mockResolvedValue({ data: [] });
    renderModules(vendor, access);
    await waitFor(() => expect(screen.getByText('Oils')).toBeTruthy());

    fireEvent.click(findSaveButton());
    await waitFor(() => expect(setVendorModulesAndCategoryAccessMock).toHaveBeenCalled());
    const [, , payload] = setVendorModulesAndCategoryAccessMock.mock.calls[0];
    expect(payload.offersService).toBe(true);
    expect(payload.offersTherapy).toBe(true);
    expect(payload.categoryIds).toEqual(expect.arrayContaining(['prod-1', 'svc-branch-granted', 'ther-branch-granted']));
  });

  // Edge case: empty state — no active Product categories exist yet
  it('shows an empty state when Product is enabled but zero active Product categories exist', async () => {
    listCategoriesMock.mockResolvedValue({ data: [] });
    renderModules(baseVendor({ offersProduct: true }));
    expect(await screen.findByText('No active Product categories exist yet.')).toBeTruthy();
  });

  // Edge case: error state — save fails
  it('shows an inline error message when saving fails', async () => {
    setVendorModulesAndCategoryAccessMock.mockRejectedValue(new Error('network down'));
    renderModules(baseVendor({ offersProduct: true }));
    await waitFor(() => expect(screen.getByText('Oils')).toBeTruthy());
    fireEvent.click(findSaveButton());
    expect(await screen.findByText('Could not save product categories.')).toBeTruthy();
  });

  it('isSelf routes the save through setMyVendorModulesAndCategoryAccess, never the admin-scoped function', async () => {
    setMyVendorModulesAndCategoryAccessMock.mockResolvedValue({ data: [] });
    const vendor = baseVendor({ offersProduct: true });
    render(
      <ToastProvider>
        <VendorProductCategoryAccess token="tok" vendorId={vendor.id} isSelf vendor={vendor} access={[]} onSaved={vi.fn()} />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByText('Oils')).toBeTruthy());
    fireEvent.click(findSaveButton());
    await waitFor(() => expect(setMyVendorModulesAndCategoryAccessMock).toHaveBeenCalled());
    expect(setVendorModulesAndCategoryAccessMock).not.toHaveBeenCalled();
  });
});
