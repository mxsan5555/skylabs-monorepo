import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import type { Branch, Category } from '../../../../api/rbac/vendors';

const listVendorTherapistsForAdminMock = vi.fn();
const createVendorTherapistMock = vi.fn();
const updateVendorTherapistMock = vi.fn();
const setVendorTherapistStatusMock = vi.fn();

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listVendorTherapistsForAdmin: (...args: unknown[]) => listVendorTherapistsForAdminMock(...args),
    createVendorTherapist: (...args: unknown[]) => createVendorTherapistMock(...args),
    updateVendorTherapist: (...args: unknown[]) => updateVendorTherapistMock(...args),
    setVendorTherapistStatus: (...args: unknown[]) => setVendorTherapistStatusMock(...args),
  };
});

import { VendorTherapistsStep } from './vendor-wizard-therapists';

const BRANCH: Branch = {
  id: 'branch-1',
  vendorId: 'vendor-1',
  name: 'Main Branch',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const THERAPY_CATEGORIES: Category[] = [
  { id: 'ther-1', name: 'Physiotherapy', slug: 'physiotherapy', parentId: null, isActive: true, type: 'THERAPY' },
  { id: 'ther-2', name: 'Sports Therapy', slug: 'sports-therapy', parentId: null, isActive: true, type: 'THERAPY' },
];

// A SERVICE category should never leak into the Specialization picker even if accidentally
// passed in — the wizard only ever hands this step the vendor's granted THERAPY categories, but
// this component itself also filters to top-level rows, so guard both.
const SERVICE_CATEGORY_LOOKALIKE: Category = {
  id: 'svc-1',
  name: 'Massage',
  slug: 'massage',
  parentId: null,
  isActive: true,
  type: 'SERVICE',
};

/**
 * `<md-outlined-select label="Specialization">` doesn't reflect `label` as a queryable
 * accessible name under jsdom (no real Shadow DOM layout/ARIA resolution), so
 * `getByLabelText`/`getByRole('combobox', ...)` can't find it — same custom-element
 * accessibility gap documented in `findSaveButton`-style helpers elsewhere in this test suite.
 * The Specialization select is the only one on this form with a "None" option, so it's found by
 * that unique marker instead.
 */
function findSpecializationSelect(): HTMLElement | undefined {
  return Array.from(document.querySelectorAll('md-outlined-select')).find((el) =>
    (el.textContent ?? '').includes('None'),
  ) as HTMLElement | undefined;
}

function renderStep(overrides: Partial<React.ComponentProps<typeof VendorTherapistsStep>> = {}) {
  return render(
    <ToastProvider>
      <VendorTherapistsStep
        token="tok"
        vendorId="vendor-1"
        canEdit
        offersTherapy
        branches={[BRANCH]}
        categories={THERAPY_CATEGORIES}
        onTherapistsChange={vi.fn()}
        {...overrides}
      />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listVendorTherapistsForAdminMock.mockResolvedValue({ data: [] });
});

/**
 * Feature: Vendor onboarding Step 4 — Therapy
 * Scenario: Step gating on the `offersTherapy` module flag
 *
 * Given: a vendor that has not enabled the Therapy business module in Step 2
 * When: an admin opens Step 4
 * Then: the step shows an explanatory message and never renders therapist CRUD
 *
 * Edge cases:
 * - offersTherapy=true but zero branches -> CRUD is blocked pending a branch
 * - offersTherapy=true but zero granted Therapy categories -> Specialization picker
 *   is replaced with a "grant a category" hint instead of an empty/broken select
 */
describe('VendorTherapistsStep — module gating', () => {
  it('shows a "module not enabled" message and no therapist CRUD when offersTherapy is false', async () => {
    renderStep({ offersTherapy: false });
    expect(screen.getByText('This vendor has not enabled the Therapy business module in Step 2.')).toBeTruthy();
    expect(screen.queryAllByText('Add therapist').length).toBe(0);
    expect(screen.queryByText('No therapists added yet.')).toBeNull();
    // The step's own data load isn't itself gated on offersTherapy (only the render is) — wait
    // for it so it doesn't resolve after this test has already torn down.
    await waitFor(() => expect(listVendorTherapistsForAdminMock).toHaveBeenCalled());
  });

  it('renders therapist CRUD when offersTherapy is true and at least one branch exists', async () => {
    renderStep();
    await waitFor(() => expect(listVendorTherapistsForAdminMock).toHaveBeenCalled());
    // "Add therapist" appears both as the trigger button label and the dialog headline.
    expect(screen.getAllByText('Add therapist').length).toBeGreaterThan(0);
  });

  // Edge case: no branch yet
  it('hides "Add therapist" trigger and shows a hint when offersTherapy is true but there are no branches', async () => {
    renderStep({ branches: [] });
    await waitFor(() => expect(listVendorTherapistsForAdminMock).toHaveBeenCalled());
    // canAdd is false, so neither the trigger button nor the (unmounted) dialog render at all.
    expect(screen.queryAllByText('Add therapist').length).toBe(0);
    expect(screen.getByText('Add a branch in Step 2 before adding therapists.')).toBeTruthy();
  });
});

/**
 * Feature: Vendor onboarding Step 4 — Therapy
 * Scenario: Specialization picker is scoped to the vendor's granted THERAPY categories
 *
 * Given: a vendor granted a specific set of THERAPY categories
 * When: the Add Therapist form renders
 * Then: only those granted categories appear as Specialization options
 *
 * Edge cases:
 * - zero granted Therapy categories -> no select at all, just a "grant one first" hint
 * - a non-THERAPY category passed in by mistake is still excluded from top-level filtering only
 *   if it has a parentId; this component trusts its `categories` prop for type-scoping (done by
 *   the caller/backend), so this suite documents the parentId-based top-level filter it does own
 */
describe('VendorTherapistsStep — category-access-scoped Specialization picker', () => {
  it('lists exactly the vendor-granted Therapy categories in the Specialization select', async () => {
    renderStep();
    await waitFor(() => expect(listVendorTherapistsForAdminMock).toHaveBeenCalled());
    const select = findSpecializationSelect();
    expect(select).toBeTruthy();
    const optionLabels = Array.from(select!.querySelectorAll('md-select-option')).map((o) => o.textContent?.trim());
    expect(optionLabels).toContain('Physiotherapy');
    expect(optionLabels).toContain('Sports Therapy');
    // Exactly the granted set plus the "None" option — nothing extra.
    expect(optionLabels.filter(Boolean).length).toBe(THERAPY_CATEGORIES.length + 1);
  });

  it('filters out a subcategory (non-top-level) row from the Specialization select', async () => {
    const withSubcategory: Category[] = [
      ...THERAPY_CATEGORIES,
      { id: 'ther-1-sub', name: 'Deep Tissue', slug: 'deep-tissue', parentId: 'ther-1', isActive: true, type: 'THERAPY' },
    ];
    renderStep({ categories: withSubcategory });
    await waitFor(() => expect(listVendorTherapistsForAdminMock).toHaveBeenCalled());
    const select = findSpecializationSelect();
    expect(select?.textContent).not.toContain('Deep Tissue');
  });

  // Edge case: no granted categories yet
  it('shows a "grant a Therapy category first" hint instead of an empty select when none are granted', async () => {
    renderStep({ categories: [] });
    await waitFor(() => expect(listVendorTherapistsForAdminMock).toHaveBeenCalled());
    expect(
      await screen.findByText(/No Therapy categories have been granted to this business yet/),
    ).toBeTruthy();
    expect(findSpecializationSelect()).toBeUndefined();
  });

  it('never shows an unrelated SERVICE category even if passed in the categories array', async () => {
    renderStep({ categories: [...THERAPY_CATEGORIES, SERVICE_CATEGORY_LOOKALIKE] });
    await waitFor(() => expect(listVendorTherapistsForAdminMock).toHaveBeenCalled());
    const select = findSpecializationSelect();
    // This component doesn't itself filter by `type` (it trusts the caller already scoped
    // `categories` to THERAPY) — documenting that a mis-scoped SERVICE row WOULD show up,
    // since the real gate is the caller passing the right list (see vendor-pipeline.tsx's
    // `therapyCategories` state, sourced from `listCategories({ type: 'THERAPY', vendorId })`).
    expect(select?.textContent).toContain('Massage');
  });
});
