import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdminTherapist, Branch, Vendor, VendorCategoryAccessRow } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { TherapistFormPage } from './therapist-form-page';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const listBranchesMock = vi.fn();
const listVendorTherapistsForAdminMock = vi.fn();
const getVendorCategoryAccessMock = vi.fn();
const createVendorTherapistMock = vi.fn();
const updateVendorTherapistMock = vi.fn();
const getVendorMock = vi.fn();

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listBranches: (...args: unknown[]) => listBranchesMock(...args),
    listVendorTherapistsForAdmin: (...args: unknown[]) => listVendorTherapistsForAdminMock(...args),
    getVendorCategoryAccess: (...args: unknown[]) => getVendorCategoryAccessMock(...args),
    createVendorTherapist: (...args: unknown[]) => createVendorTherapistMock(...args),
    updateVendorTherapist: (...args: unknown[]) => updateVendorTherapistMock(...args),
    getVendor: (...args: unknown[]) => getVendorMock(...args),
  };
});

const THERAPY_BRANCH: Branch = {
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
  categoryTypes: ['THERAPY'],
};

const NON_THERAPY_BRANCH: Branch = { ...THERAPY_BRANCH, id: 'b2', name: 'Colaba Branch', categoryTypes: ['SERVICE'] };

const THERAPY_GRANT: VendorCategoryAccessRow = {
  id: 'grant-1',
  vendorId: 'v1',
  categoryId: 'c1',
  createdAt: '2026-01-01T00:00:00Z',
  category: { id: 'c1', name: 'Physiotherapy', slug: 'physiotherapy', parentId: null, isActive: true, type: 'THERAPY' },
};

const EXISTING_THERAPIST: AdminTherapist = {
  id: 't1',
  vendorId: 'v1',
  branchId: 'b1',
  therapistType: 'Massage Therapist',
  personName: 'Ramesh Kumar',
  gender: 'Male',
  specialization: null,
  specializationCategoryId: 'c1',
  bio: 'Experienced therapist',
  experienceYears: 5,
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
  offersTherapy: true,
  owner: { id: 'u1', name: 'Arjun Malhotra', status: 'active', roles: [] },
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
  listBranchesMock.mockResolvedValue({ data: [THERAPY_BRANCH, NON_THERAPY_BRANCH] });
  listVendorTherapistsForAdminMock.mockResolvedValue({ data: [EXISTING_THERAPIST] });
  getVendorCategoryAccessMock.mockResolvedValue({ data: [THERAPY_GRANT] });
  getVendorMock.mockResolvedValue({ data: VENDOR });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/account/vendors/:vendorId/therapists/new" element={<TherapistFormPage token="tok" />} />
        <Route path="/account/vendors/:vendorId/therapists/:therapistId" element={<TherapistFormPage token="tok" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TherapistFormPage — Add', () => {
  it('shows only THERAPY-eligible branches in the Branch select', async () => {
    renderAt('/account/vendors/v1/therapists/new');
    expect(await screen.findByRole('heading', { name: 'Add therapist' })).toBeTruthy();
    const branchSelect = await waitFor(() => {
      const el = selectByLabel('Branch');
      if (!el) throw new Error('not rendered yet');
      return el;
    });
    const optionLabels = Array.from(branchSelect.querySelectorAll('md-select-option [slot="headline"]')).map((o) => o.textContent);
    expect(optionLabels).toContain('Lower Parel Branch');
    expect(optionLabels).not.toContain('Colaba Branch');
  });

  it('validates branch/type/name and never calls createVendorTherapist when all are missing', async () => {
    renderAt('/account/vendors/v1/therapists/new');
    await screen.findByRole('heading', { name: 'Add therapist' });
    const save = findSaveButton() as HTMLElement;
    fireEvent.click(save);
    expect(await screen.findByText('Select a branch.')).toBeTruthy();
    expect(createVendorTherapistMock).not.toHaveBeenCalled();
  });

  it('creates the therapist with the chosen specialization, and redirects to its own edit page', async () => {
    createVendorTherapistMock.mockResolvedValue({ data: { ...EXISTING_THERAPIST, id: 'new-1' } });
    renderAt('/account/vendors/v1/therapists/new');
    await screen.findByRole('heading', { name: 'Add therapist' });

    pickOption(selectByLabel('Branch') as HTMLElement, 'b1');
    setText(fieldByLabel('Therapist Type / Service Name') as HTMLElement & { value: string }, 'Massage Therapist');
    setText(fieldByLabel('Person Name') as HTMLElement & { value: string }, 'New Therapist');
    pickOption(await waitFor(() => {
      const el = selectByLabel('Specialization');
      if (!el) throw new Error('not rendered yet');
      return el;
    }), 'c1');

    const save = findSaveButton() as HTMLElement;
    fireEvent.click(save);

    await waitFor(() =>
      expect(createVendorTherapistMock).toHaveBeenCalledWith('tok', 'v1', 'b1', expect.objectContaining({
        therapistType: 'Massage Therapist',
        personName: 'New Therapist',
        specializationCategoryId: 'c1',
      })),
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/therapists/new-1', { replace: true }));
  });
});

describe('TherapistFormPage — Edit', () => {
  it('loads the existing therapist: fields prefilled, branch shown as fixed text', async () => {
    renderAt('/account/vendors/v1/therapists/t1');
    expect(await screen.findByRole('heading', { name: 'Edit therapist' })).toBeTruthy();
    expect(selectByLabel('Branch')).toBeUndefined();
    expect(screen.getByText(/Branch: Lower Parel Branch/)).toBeTruthy();
    const name = await waitFor(() => {
      const el = fieldByLabel('Person Name');
      if (!el) throw new Error('not rendered yet');
      return el;
    });
    expect(name?.value).toBe('Ramesh Kumar');
  });

  it('a therapist id not found in the vendor\'s own list shows an error', async () => {
    listVendorTherapistsForAdminMock.mockResolvedValue({ data: [] });
    render(
      <MemoryRouter initialEntries={['/account/vendors/v1/therapists/missing']}>
        <Routes>
          <Route path="/account/vendors/:vendorId/therapists/:therapistId" element={<TherapistFormPage token="tok" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Therapist not found.')).toBeTruthy();
  });

  it('saves with updateVendorTherapist, not createVendorTherapist', async () => {
    updateVendorTherapistMock.mockResolvedValue({ data: EXISTING_THERAPIST });
    renderAt('/account/vendors/v1/therapists/t1');
    await screen.findByRole('heading', { name: 'Edit therapist' });
    await waitFor(() => expect(fieldByLabel('Person Name')?.value).toBe('Ramesh Kumar'));
    const save = findSaveButton() as HTMLElement;
    fireEvent.click(save);
    await waitFor(() => expect(updateVendorTherapistMock).toHaveBeenCalledWith('tok', 'v1', 't1', expect.objectContaining({ personName: 'Ramesh Kumar' })));
    expect(createVendorTherapistMock).not.toHaveBeenCalled();
  });

  it('shows the save error inline when updateVendorTherapist rejects', async () => {
    updateVendorTherapistMock.mockRejectedValue(new ApiRequestError('VALIDATION_ERROR', 'Could not save this therapist.', 400));
    renderAt('/account/vendors/v1/therapists/t1');
    await screen.findByRole('heading', { name: 'Edit therapist' });
    await waitFor(() => expect(fieldByLabel('Person Name')?.value).toBe('Ramesh Kumar'));
    const save = findSaveButton() as HTMLElement;
    fireEvent.click(save);
    expect(await screen.findByText('Could not save this therapist.')).toBeTruthy();
  });
});
