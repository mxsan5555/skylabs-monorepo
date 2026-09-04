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

import { VendorModulesAndCategoryAccess } from './vendor-wizard-modules';

/**
 * `<md-filled-button>` is a Material Web custom element — jsdom's accessibility tree doesn't
 * understand its internals-assigned role, so `getByRole('button', ...)` can't find it (same gap
 * already documented in `users.test.tsx`'s `findLoginAsButton`). Query the custom element
 * directly by its text content instead.
 */
function findSaveButton(): HTMLElement {
  const el = Array.from(document.querySelectorAll('md-filled-button')).find((node) =>
    (node.textContent ?? '').includes('Save modules & category access'),
  );
  if (!el) throw new Error('Save button not found');
  return el as HTMLElement;
}

function cat(id: string, name: string, type: Category['type'] = 'SERVICE'): Category {
  return { id, name, slug: id, parentId: null, isActive: true, type };
}

const SERVICE_CATS = [cat('svc-1', 'Massage'), cat('svc-2', 'Spa')];
const PRODUCT_CATS = [cat('prod-1', 'Oils', 'PRODUCT')];
const THERAPY_CATS = [cat('ther-1', 'Physiotherapy', 'THERAPY')];

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
      <VendorModulesAndCategoryAccess token="tok" vendorId={vendor.id} isSelf={false} vendor={vendor} access={access} onSaved={onSaved} />
    </ToastProvider>,
  );
  return { onSaved };
}

beforeEach(() => {
  vi.clearAllMocks();
  listCategoriesMock.mockImplementation((_token: string | null, opts: { type: string }) => {
    if (opts.type === 'SERVICE') return Promise.resolve({ data: SERVICE_CATS });
    if (opts.type === 'PRODUCT') return Promise.resolve({ data: PRODUCT_CATS });
    return Promise.resolve({ data: THERAPY_CATS });
  });
});

/**
 * Feature: Vendor onboarding Step 2 — Business Modules + Category Access
 * Scenario: Category checklists are scoped to enabled modules only
 *
 * Given: a vendor with no business modules enabled yet
 * When: Step 2 renders
 * Then: no category checklist is shown, only an empty-state hint
 *
 * Edge cases:
 * - enabling a module reveals only that module's categories
 * - disabling a previously-enabled module drops its granted categories from the save payload
 */
describe('VendorModulesAndCategoryAccess — module-scoped category checklists', () => {
  it('shows an empty state and no category groups when no module is enabled', async () => {
    renderModules(baseVendor());
    await waitFor(() => expect(listCategoriesMock).toHaveBeenCalled());
    expect(screen.getByText('Enable a business module above to grant it categories.')).toBeTruthy();
    expect(screen.queryByText('Massage')).toBeNull();
    expect(screen.queryByText('Oils')).toBeNull();
  });

  it('reveals only the Service category group when only Service is enabled', async () => {
    renderModules(baseVendor({ offersService: true }));
    await waitFor(() => expect(screen.getByText('Massage')).toBeTruthy());
    expect(screen.getByText('Spa')).toBeTruthy();
    // Product/Therapy categories must not leak in when their module isn't enabled.
    expect(screen.queryByText('Oils')).toBeNull();
    expect(screen.queryByText('Physiotherapy')).toBeNull();
  });

  it('reveals both Service and Product groups when both modules are enabled', async () => {
    renderModules(baseVendor({ offersService: true, offersProduct: true }));
    await waitFor(() => expect(screen.getByText('Massage')).toBeTruthy());
    expect(screen.getByText('Oils')).toBeTruthy();
    expect(screen.queryByText('Physiotherapy')).toBeNull();
  });

  it('pre-checks categories already present in the `access` prop', async () => {
    const vendor = baseVendor({ offersService: true });
    const access: VendorCategoryAccessRow[] = [
      { id: 'a1', vendorId: vendor.id, categoryId: 'svc-1', createdAt: '2026-01-01T00:00:00Z', category: SERVICE_CATS[0] },
    ];
    renderModules(vendor, access);
    await waitFor(() => expect(screen.getByText('Massage')).toBeTruthy());
    const massageCheckbox = screen.getByRole('checkbox', { name: 'Massage' }) as HTMLInputElement;
    const spaCheckbox = screen.getByRole('checkbox', { name: 'Spa' }) as HTMLInputElement;
    expect(massageCheckbox.checked).toBe(true);
    expect(spaCheckbox.checked).toBe(false);
  });

  it('turning a module off removes its categories from the checklist and drops them from the saved grant set', async () => {
    const vendor = baseVendor({ offersService: true });
    const access: VendorCategoryAccessRow[] = [
      { id: 'a1', vendorId: vendor.id, categoryId: 'svc-1', createdAt: '2026-01-01T00:00:00Z', category: SERVICE_CATS[0] },
    ];
    setVendorModulesAndCategoryAccessMock.mockResolvedValue({ data: [] });
    renderModules(vendor, access);
    await waitFor(() => expect(screen.getByText('Massage')).toBeTruthy());

    // Turn off the Service module — its checklist (and the previously-granted 'Massage') should vanish.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Service' }));
    expect(screen.queryByText('Massage')).toBeNull();
    expect(screen.getByText('Enable a business module above to grant it categories.')).toBeTruthy();

    fireEvent.click(findSaveButton());
    await waitFor(() => expect(setVendorModulesAndCategoryAccessMock).toHaveBeenCalled());
    const [, , payload] = setVendorModulesAndCategoryAccessMock.mock.calls[0];
    expect(payload.offersService).toBe(false);
    expect(payload.categoryIds).not.toContain('svc-1');
  });

  // Edge case: empty state — no active categories of an enabled module's type exist yet
  it('shows a per-module empty state when an enabled module has zero active categories', async () => {
    listCategoriesMock.mockImplementation((_token: string | null, opts: { type: string }) => {
      if (opts.type === 'THERAPY') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    renderModules(baseVendor({ offersTherapy: true }));
    await waitFor(() => expect(listCategoriesMock).toHaveBeenCalled());
    expect(await screen.findByText('No active Therapy categories exist yet.')).toBeTruthy();
  });

  // Edge case: error state — save fails
  it('shows an inline error message when saving fails', async () => {
    setVendorModulesAndCategoryAccessMock.mockRejectedValue(new Error('network down'));
    renderModules(baseVendor({ offersService: true }));
    await waitFor(() => expect(screen.getByText('Massage')).toBeTruthy());
    fireEvent.click(findSaveButton());
    expect(await screen.findByText('Could not save business modules and category access.')).toBeTruthy();
  });
});
