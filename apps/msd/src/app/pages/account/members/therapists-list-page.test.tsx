import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdminTherapist } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { TherapistsListPage } from './therapists-list-page';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const listVendorTherapistsForAdminMock = vi.fn();
const setVendorTherapistStatusMock = vi.fn();
const deleteVendorTherapistMock = vi.fn();
vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listVendorTherapistsForAdmin: (...args: unknown[]) => listVendorTherapistsForAdminMock(...args),
    setVendorTherapistStatus: (...args: unknown[]) => setVendorTherapistStatusMock(...args),
    deleteVendorTherapist: (...args: unknown[]) => deleteVendorTherapistMock(...args),
  };
});

const THERAPIST_A: AdminTherapist = {
  id: 't1',
  vendorId: 'v1',
  branchId: 'b1',
  therapistType: 'Massage Therapist',
  personName: 'Ramesh Kumar',
  gender: null,
  specialization: 'Deep tissue',
  bio: null,
  experienceYears: 5,
  photoUrl: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  branch: { id: 'b1', name: 'Lower Parel Branch' },
};

const THERAPIST_B: AdminTherapist = { ...THERAPIST_A, id: 't2', personName: 'Asha Rao', specialization: null, experienceYears: null, isActive: false };

function table(): HTMLElement {
  const el = document.querySelector('sky-data-table');
  if (!el) throw new Error('sky-data-table not found');
  return el as HTMLElement;
}

function renderPage(canEdit = true, canDelete = true) {
  listVendorTherapistsForAdminMock.mockResolvedValue({ data: [THERAPIST_A, THERAPIST_B] });
  return render(
    <MemoryRouter>
      <TherapistsListPage token="tok" vendorId="v1" canEdit={canEdit} canDelete={canDelete} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TherapistsListPage', () => {
  it('loads every therapist for the vendor (across branches) and shows one row each', async () => {
    renderPage();
    await waitFor(() => expect(listVendorTherapistsForAdminMock).toHaveBeenCalledWith('tok', 'v1'));
    const rows = await waitFor(() => {
      const r = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
      if (r.length !== 2) throw new Error('not loaded yet');
      return r;
    });
    expect(rows[0]).toMatchObject({ Type: 'Massage Therapist', Name: 'Ramesh Kumar', Branch: 'Lower Parel Branch', Specialization: 'Deep tissue', Experience: '5 yrs', Status: 'Active' });
    expect(rows[1]).toMatchObject({ Name: 'Asha Rao', Specialization: '—', Experience: '—', Status: 'Inactive' });
  });

  it('shows a heading with the therapist count', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Therapists' })).toBeTruthy();
    expect(await screen.findByText('2 therapists')).toBeTruthy();
  });

  it('shows "Add therapist" only when canEdit is true, and navigates to the add page', async () => {
    renderPage(true);
    const addButton = await screen.findByText('Add therapist');
    fireEvent.click(addButton);
    expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/therapists/new');
  });

  it('hides "Add therapist" and row edit/status actions when canEdit is false', async () => {
    renderPage(false, true);
    await waitFor(() => expect(listVendorTherapistsForAdminMock).toHaveBeenCalled());
    expect(screen.queryByText('Add therapist')).toBeNull();
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions.map((a) => a.event)).toEqual(['delete']);
  });

  it('hides the delete action when canDelete is false', async () => {
    renderPage(true, false);
    await waitFor(() => expect(listVendorTherapistsForAdminMock).toHaveBeenCalled());
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions.map((a) => a.event)).toEqual(['edit', 'toggle-status']);
  });

  it('edit row action navigates to that therapist\'s edit page', async () => {
    renderPage();
    await waitFor(() => expect(JSON.parse(table().getAttribute('rows') ?? '[]')).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'edit', rowIndex: 0 } }));
    expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/therapists/t1');
  });

  it('toggle-status flips an active therapist to inactive and reloads', async () => {
    setVendorTherapistStatusMock.mockResolvedValue({ data: { ...THERAPIST_A, isActive: false } });
    renderPage();
    await waitFor(() => expect(JSON.parse(table().getAttribute('rows') ?? '[]')).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'toggle-status', rowIndex: 0 } }));
    await waitFor(() => expect(setVendorTherapistStatusMock).toHaveBeenCalledWith('tok', 'v1', 't1', false));
    await waitFor(() => expect(listVendorTherapistsForAdminMock).toHaveBeenCalledTimes(2));
  });

  it('delete asks for confirmation, then calls deleteVendorTherapist and reloads the list', async () => {
    deleteVendorTherapistMock.mockResolvedValue({ data: null });
    renderPage();
    await waitFor(() => expect(JSON.parse(table().getAttribute('rows') ?? '[]')).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'delete', rowIndex: 0 } }));
    fireEvent.click(await screen.findByText('Confirm'));
    await waitFor(() => expect(deleteVendorTherapistMock).toHaveBeenCalledWith('tok', 'v1', 't1'));
    await waitFor(() => expect(listVendorTherapistsForAdminMock).toHaveBeenCalledTimes(2));
  });

  it('shows an error when loading therapists fails', async () => {
    listVendorTherapistsForAdminMock.mockRejectedValue(new ApiRequestError('INTERNAL_ERROR', 'Could not load therapists.', 500));
    render(
      <MemoryRouter>
        <TherapistsListPage token="tok" vendorId="v1" canEdit canDelete />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load therapists.');
  });

  it('shows an empty state with no therapists yet', async () => {
    listVendorTherapistsForAdminMock.mockResolvedValue({ data: [] });
    render(
      <MemoryRouter>
        <TherapistsListPage token="tok" vendorId="v1" canEdit canDelete />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/No therapists yet/)).toBeTruthy();
  });
});
