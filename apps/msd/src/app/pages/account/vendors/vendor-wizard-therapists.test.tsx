import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import type { Branch, BranchCategoryAccessRow, Category } from '../../../../api/rbac/vendors';

const listVendorTherapistsForAdminMock = vi.fn();
const createVendorTherapistMock = vi.fn();
const updateVendorTherapistMock = vi.fn();
const setVendorTherapistStatusMock = vi.fn();
// The Specialization picker is now branch-scoped (`getBranchCategoryAccess`), not sourced
// directly from the `specializationCategories`/`categories` prop any more (that prop now only
// backs the "stale value" name lookup) — see `WizardTherapistFormDialog`'s own doc comments.
const getBranchCategoryAccessMock = vi.fn();

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listVendorTherapistsForAdmin: (...args: unknown[]) => listVendorTherapistsForAdminMock(...args),
    createVendorTherapist: (...args: unknown[]) => createVendorTherapistMock(...args),
    updateVendorTherapist: (...args: unknown[]) => updateVendorTherapistMock(...args),
    setVendorTherapistStatus: (...args: unknown[]) => setVendorTherapistStatusMock(...args),
    getBranchCategoryAccess: (...args: unknown[]) => getBranchCategoryAccessMock(...args),
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

// This branch's own mapping — the Specialization picker is scoped to THIS (not the vendor-wide
// `categories`/`specializationCategories` prop, which now only backs the "stale value" name
// lookup — see `WizardTherapistFormDialog`'s own doc comments in vendor-wizard-therapists.tsx).
const THERAPY_BRANCH_ACCESS: BranchCategoryAccessRow[] = THERAPY_CATEGORIES.map((c) => ({
  id: `bca-${c.id}`,
  branchId: BRANCH.id,
  categoryId: c.id,
  createdAt: '2026-01-01T00:00:00Z',
  category: c,
  subcategories: [],
}));

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
  getBranchCategoryAccessMock.mockResolvedValue({ data: THERAPY_BRANCH_ACCESS });
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
 * Scenario: Specialization picker is scoped to the ACTIVE BRANCH's own `BranchCategoryAccess`
 * mapping (`getBranchCategoryAccess`), not the vendor-wide `specializationCategories`/`categories`
 * prop any more — that prop is now only a name-lookup fallback for a stale value that's fallen out
 * of the branch's current mapping (see `WizardTherapistFormDialog`'s doc comments).
 *
 * Given: the active branch's own granted THERAPY category mapping
 * When: the Add Therapist form renders
 * Then: only the branch-mapped categories appear as Specialization options
 *
 * Edge cases:
 * - zero branch-mapped Therapy categories -> no select at all, just a "map one first" hint
 * - a subcategory-tier row is never offered in the top-level Specialization Category select
 */
describe('VendorTherapistsStep — category-access-scoped Specialization picker', () => {
  it('lists exactly the branch-mapped Therapy categories in the Specialization select', async () => {
    renderStep();
    await waitFor(() => expect(getBranchCategoryAccessMock).toHaveBeenCalledWith('tok', 'vendor-1', BRANCH.id));
    const select = await waitFor(() => {
      const found = findSpecializationSelect();
      expect(found).toBeTruthy();
      return found!;
    });
    const optionLabels = Array.from(select.querySelectorAll('md-select-option')).map((o) => o.textContent?.trim());
    expect(optionLabels).toContain('Physiotherapy');
    expect(optionLabels).toContain('Sports Therapy');
    // Exactly the branch-mapped set plus the "None" option — nothing extra.
    expect(optionLabels.filter(Boolean).length).toBe(THERAPY_CATEGORIES.length + 1);
  });

  it('never offers a subcategory-tier row in the top-level Specialization Category select', async () => {
    const deepTissue: Category = { id: 'ther-1-sub', name: 'Deep Tissue', slug: 'deep-tissue', parentId: 'ther-1', isActive: true, type: 'THERAPY' };
    getBranchCategoryAccessMock.mockResolvedValue({
      data: [
        { ...THERAPY_BRANCH_ACCESS[0], subcategories: [{ id: 'bsa-1', subcategoryId: deepTissue.id, subcategory: deepTissue }] },
        THERAPY_BRANCH_ACCESS[1],
      ],
    });
    renderStep();
    await waitFor(() => expect(getBranchCategoryAccessMock).toHaveBeenCalled());
    await waitFor(() => expect(findSpecializationSelect()).toBeTruthy());
    const select = findSpecializationSelect();
    expect(select?.textContent).not.toContain('Deep Tissue');
  });

  // Edge case: no branch-mapped categories yet
  it('shows a "map a Therapy category first" hint instead of an empty select when none are branch-mapped', async () => {
    getBranchCategoryAccessMock.mockResolvedValue({ data: [] });
    renderStep();
    await waitFor(() => expect(getBranchCategoryAccessMock).toHaveBeenCalled());
    expect(
      await screen.findByText('No Therapy categories are mapped to this branch yet — map one under Business Modules & Category Access first.'),
    ).toBeTruthy();
    expect(findSpecializationSelect()).toBeUndefined();
  });

  // Edge case: a stale specializationCategoryId (branch remapped since this therapist was
  // staffed) is preserved (never silently cleared) and surfaced with a warning, rather than
  // dropped from the form — same "don't silently overwrite" contract as DealDialog.
  it('editing a therapist whose specializationCategoryId has fallen out of the branch mapping preserves it and shows a warning', async () => {
    const STALE_ID = 'ther-stale';
    const therapist = {
      id: 'therapist-1',
      vendorId: 'vendor-1',
      branchId: BRANCH.id,
      branch: { id: BRANCH.id, name: BRANCH.name },
      therapistType: 'Legs Therapist',
      personName: 'Ramesh Kumar',
      isActive: true,
      specializationCategoryId: STALE_ID,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    listVendorTherapistsForAdminMock.mockResolvedValue({ data: [therapist] });
    renderStep({
      categories: [
        ...THERAPY_CATEGORIES,
        { id: STALE_ID, name: 'Discontinued Therapy', slug: 'discontinued-therapy', parentId: null, isActive: false, type: 'THERAPY' },
      ],
    });
    await screen.findByText('Ramesh Kumar');
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() =>
      expect(
        screen.getByText(
          'This specialization is no longer mapped to this branch. Saving without changing it keeps the existing value — or pick a currently mapped option.',
        ),
      ).toBeTruthy(),
    );
  });

  it('a mis-scoped SERVICE category passed via the categories prop never leaks into the Specialization select — the picker is driven entirely by the branch mapping fetch, not this prop', async () => {
    renderStep({ categories: [...THERAPY_CATEGORIES, SERVICE_CATEGORY_LOOKALIKE] });
    await waitFor(() => expect(getBranchCategoryAccessMock).toHaveBeenCalled());
    const select = await waitFor(() => {
      const found = findSpecializationSelect();
      expect(found).toBeTruthy();
      return found!;
    });
    expect(select.textContent).not.toContain('Massage');
  });
});
