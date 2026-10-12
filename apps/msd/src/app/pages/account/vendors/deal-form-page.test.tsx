import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdminDeal, AdminTherapist, Branch, BranchCategoryAccessRow, Vendor } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { DealFormPage } from './deal-form-page';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const listBranchesMock = vi.fn();
const listVendorDealsForAdminMock = vi.fn();
const listVendorTherapistsForAdminMock = vi.fn();
const createDealMock = vi.fn();
const updateDealMock = vi.fn();
const getBranchCategoryAccessMock = vi.fn();
const createVendorTherapistMock = vi.fn();
const getVendorMock = vi.fn();

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listBranches: (...args: unknown[]) => listBranchesMock(...args),
    listVendorDealsForAdmin: (...args: unknown[]) => listVendorDealsForAdminMock(...args),
    listVendorTherapistsForAdmin: (...args: unknown[]) => listVendorTherapistsForAdminMock(...args),
    createDeal: (...args: unknown[]) => createDealMock(...args),
    updateDeal: (...args: unknown[]) => updateDealMock(...args),
    getBranchCategoryAccess: (...args: unknown[]) => getBranchCategoryAccessMock(...args),
    createVendorTherapist: (...args: unknown[]) => createVendorTherapistMock(...args),
    getVendor: (...args: unknown[]) => getVendorMock(...args),
  };
});

const BRANCH_A: Branch = {
  id: 'b1',
  vendorId: 'v1',
  name: 'Lower Parel Branch',
  address: null,
  city: null,
  state: 'Maharashtra',
  country: null,
  pincode: null,
  latitude: null,
  longitude: null,
  mapLocationUrl: null,
  phone: null,
  email: null,
  openingHours: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  _count: { deals: 0 },
  categoryTypes: ['SERVICE'],
};

const CATEGORY_ACCESS: BranchCategoryAccessRow = {
  id: 'bca-1',
  branchId: 'b1',
  categoryId: 'c1',
  createdAt: '2026-01-01T00:00:00Z',
  category: { id: 'c1', name: 'Spa', slug: 'spa', parentId: null, isActive: true, type: 'SERVICE' },
  subcategories: [],
};

const THERAPIST_A: AdminTherapist = {
  id: 't1',
  vendorId: 'v1',
  branchId: 'b1',
  therapistType: 'Massage Therapist',
  personName: 'Ramesh Kumar',
  gender: null,
  specialization: null,
  bio: null,
  experienceYears: null,
  photoUrl: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  branch: { id: 'b1', name: 'Lower Parel Branch' },
};

const VENDOR: Vendor = {
  id: 'v1',
  businessName: 'Vitality Wellness & Beauty',
  slug: 'vitality',
  ownerUserId: 'u1',
  kycStatus: 'VERIFIED',
  kycRejectionReason: null,
  status: 'ACTIVE',
  statusReason: null,
  createdByUserId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  offersService: true,
  offersProduct: false,
  offersTherapy: false,
  owner: { id: 'u1', name: 'Arjun Malhotra', status: 'active', roles: [] },
};

const EXISTING_DEAL: AdminDeal = {
  id: 'd1',
  vendorId: 'v1',
  branchId: 'b1',
  categoryId: 'c1',
  subcategoryId: null,
  title: 'Deep Tissue Massage',
  slug: 'deep-tissue',
  originalPrice: '1499.00',
  salePrice: '1299.00',
  durationMinutes: 60,
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  category: { id: 'c1', name: 'Spa', slug: 'spa', parentId: null, isActive: true },
  branch: { id: 'b1', name: 'Lower Parel Branch' },
  packages: [{ id: 'pkg-1', dealId: 'd1', durationMinutes: 60, sellingPrice: '1299.00', originalPrice: '1499.00', isActive: true, sortOrder: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }],
  therapists: [{ id: 't1', personName: 'Ramesh Kumar', therapistType: 'Massage Therapist', isActive: true }],
};

function fieldByLabel(label: string): (HTMLElement & { value?: string }) | undefined {
  return Array.from(document.querySelectorAll('md-outlined-text-field')).find(
    (el) => (el as unknown as { label?: string }).label === label,
  ) as (HTMLElement & { value?: string }) | undefined;
}

function selectByLabel(label: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll('md-outlined-select')).find(
    (el) => (el as unknown as { label?: string }).label === label,
  ) as HTMLElement | undefined;
}

// Same technique `branch-form-page.test.tsx` uses for `md-outlined-select` — defining `value` as
// an own property shadows the inherited Lit accessor for reads, so the component's `onChange`
// (reads `e.currentTarget.value`) sees the picked value deterministically under jsdom.
function pickOption(select: HTMLElement, value: string) {
  Object.defineProperty(select, 'value', { configurable: true, writable: true, enumerable: true, value });
  fireEvent.change(select);
}

function setText(field: HTMLElement & { value?: string }, value: string) {
  field.value = value;
  fireEvent.input(field);
}

function findSaveButton() {
  return Array.from(document.querySelectorAll('md-filled-button')).find((b) => b.textContent?.trim().startsWith('Save'));
}

function renderAt(url: string) {
  listBranchesMock.mockResolvedValue({ data: [BRANCH_A] });
  listVendorDealsForAdminMock.mockResolvedValue({ data: [EXISTING_DEAL] });
  listVendorTherapistsForAdminMock.mockResolvedValue({ data: [THERAPIST_A] });
  getBranchCategoryAccessMock.mockResolvedValue({ data: [CATEGORY_ACCESS] });
  getVendorMock.mockResolvedValue({ data: VENDOR });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/account/vendors/:vendorId/deals/new" element={<DealFormPage token="tok" />} />
        <Route path="/account/vendors/:vendorId/deals/:dealId" element={<DealFormPage token="tok" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DealFormPage — Add', () => {
  it('shows only the Branch select until a branch is picked — no Category select yet', async () => {
    renderAt('/account/vendors/v1/deals/new');
    expect(await screen.findByRole('heading', { name: 'Add deal' })).toBeTruthy();
    expect(selectByLabel('Branch')).toBeTruthy();
    expect(selectByLabel('Category')).toBeUndefined();
  });

  it('picking a branch fetches that branch\'s category access and shows the Category select', async () => {
    renderAt('/account/vendors/v1/deals/new');
    await screen.findByRole('heading', { name: 'Add deal' });
    pickOption(selectByLabel('Branch') as HTMLElement, 'b1');
    await waitFor(() => expect(getBranchCategoryAccessMock).toHaveBeenCalledWith('tok', 'v1', 'b1'));
    await waitFor(() => expect(selectByLabel('Category')).toBeTruthy());
  });

  it('validates branch/title/slug/category/packages and never calls createDeal when all are missing', async () => {
    renderAt('/account/vendors/v1/deals/new');
    await screen.findByRole('heading', { name: 'Add deal' });
    const save = await waitFor(() => {
      const el = findSaveButton();
      if (!el) throw new Error('Save button not found');
      return el;
    });
    fireEvent.click(save);
    expect(await screen.findByText('Select a branch.')).toBeTruthy();
    expect(createDealMock).not.toHaveBeenCalled();
  });

  it('creates the deal with the selected therapist linked, and redirects to its own edit page', async () => {
    createDealMock.mockResolvedValue({ data: { ...EXISTING_DEAL, id: 'new-1' } });
    renderAt('/account/vendors/v1/deals/new');
    await screen.findByRole('heading', { name: 'Add deal' });

    pickOption(selectByLabel('Branch') as HTMLElement, 'b1');
    await waitFor(() => expect(selectByLabel('Category')).toBeTruthy());
    pickOption(selectByLabel('Category') as HTMLElement, 'c1');

    setText(fieldByLabel('Title') as HTMLElement & { value: string }, 'New Deal');
    setText(fieldByLabel('Slug') as HTMLElement & { value: string }, 'new-deal');

    const addPackageButton = Array.from(document.querySelectorAll('md-outlined-button')).find((b) => b.textContent?.trim().includes('Add package'));
    if (!addPackageButton) throw new Error('Add package button not found');
    fireEvent.click(addPackageButton);

    setText(fieldByLabel('Duration (minutes)') as HTMLElement & { value: string }, '30');
    setText(fieldByLabel('Selling price') as HTMLElement & { value: string }, '999');

    const therapistCheckbox = await screen.findByRole('checkbox');
    fireEvent.click(therapistCheckbox);

    const save = findSaveButton() as HTMLElement;
    fireEvent.click(save);

    await waitFor(() =>
      expect(createDealMock).toHaveBeenCalledWith(
        'tok',
        'v1',
        'b1',
        expect.objectContaining({
          categoryId: 'c1',
          title: 'New Deal',
          slug: 'new-deal',
          therapistIds: ['t1'],
          packages: [expect.objectContaining({ durationMinutes: 30, sellingPrice: 999 })],
        }),
      ),
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/deals/new-1', { replace: true }));
  });

  it('adding a new therapist inline calls createVendorTherapist, scoped to the picked branch, and auto-selects it', async () => {
    createVendorTherapistMock.mockResolvedValue({ data: { id: 't2', vendorId: 'v1', branchId: 'b1', therapistType: 'Physio', personName: 'Asha Rao', isActive: true } });
    renderAt('/account/vendors/v1/deals/new');
    await screen.findByRole('heading', { name: 'Add deal' });
    pickOption(selectByLabel('Branch') as HTMLElement, 'b1');
    await waitFor(() => expect(selectByLabel('Category')).toBeTruthy());

    setText(fieldByLabel('Type (e.g. Massage Therapist)') as HTMLElement & { value: string }, 'Physio');
    setText(fieldByLabel('Name') as HTMLElement & { value: string }, 'Asha Rao');
    const addTherapistButton = Array.from(document.querySelectorAll('md-outlined-button')).find((b) => b.textContent?.trim().includes('Add therapist'));
    if (!addTherapistButton) throw new Error('Add therapist button not found');
    fireEvent.click(addTherapistButton);

    await waitFor(() => expect(createVendorTherapistMock).toHaveBeenCalledWith('tok', 'v1', 'b1', { therapistType: 'Physio', personName: 'Asha Rao' }));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBe(2));
  });
});

describe('DealFormPage — Edit', () => {
  it('loads the existing deal: title/slug/packages/therapists prefilled, branch shown as fixed text', async () => {
    renderAt('/account/vendors/v1/deals/d1');
    expect(await screen.findByRole('heading', { name: 'Edit deal' })).toBeTruthy();
    expect(selectByLabel('Branch')).toBeUndefined();
    expect(screen.getByText(/Branch: Lower Parel Branch/)).toBeTruthy();
    const title = await waitFor(() => {
      const el = fieldByLabel('Title');
      if (!el) throw new Error('not rendered yet');
      return el;
    });
    expect(title?.value).toBe('Deep Tissue Massage');
    const checkbox = await screen.findByRole('checkbox');
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });

  it('a deal id not found in the vendor\'s own list shows an error', async () => {
    listVendorDealsForAdminMock.mockResolvedValue({ data: [] });
    render(
      <MemoryRouter initialEntries={['/account/vendors/v1/deals/missing']}>
        <Routes>
          <Route path="/account/vendors/:vendorId/deals/:dealId" element={<DealFormPage token="tok" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Deal not found.')).toBeTruthy();
  });

  it('saves with updateDeal, not createDeal', async () => {
    updateDealMock.mockResolvedValue({ data: EXISTING_DEAL });
    renderAt('/account/vendors/v1/deals/d1');
    await screen.findByRole('heading', { name: 'Edit deal' });
    await waitFor(() => expect(fieldByLabel('Title')?.value).toBe('Deep Tissue Massage'));
    const save = findSaveButton() as HTMLElement;
    fireEvent.click(save);
    await waitFor(() => expect(updateDealMock).toHaveBeenCalledWith('tok', 'v1', 'b1', 'd1', expect.objectContaining({ title: 'Deep Tissue Massage' })));
    expect(createDealMock).not.toHaveBeenCalled();
  });

  it('shows the save error inline when updateDeal rejects', async () => {
    updateDealMock.mockRejectedValue(new ApiRequestError('VALIDATION_ERROR', 'Could not save this deal.', 400));
    renderAt('/account/vendors/v1/deals/d1');
    await screen.findByRole('heading', { name: 'Edit deal' });
    await waitFor(() => expect(fieldByLabel('Title')?.value).toBe('Deep Tissue Massage'));
    const save = findSaveButton() as HTMLElement;
    fireEvent.click(save);
    expect(await screen.findByText('Could not save this deal.')).toBeTruthy();
  });
});
