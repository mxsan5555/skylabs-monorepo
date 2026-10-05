import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Branch } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { BranchesListPage } from './branches-list-page';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const listBranchesMock = vi.fn();
const setBranchStatusMock = vi.fn();
vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listBranches: (...args: unknown[]) => listBranchesMock(...args),
    setBranchStatus: (...args: unknown[]) => setBranchStatusMock(...args),
  };
});

const BRANCH_A: Branch = {
  id: 'b1',
  vendorId: 'v1',
  name: 'Lower Parel Branch',
  address: null,
  city: 'Mumbai',
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
  _count: { deals: 3 },
  categoryTypes: [],
};

const BRANCH_B: Branch = { ...BRANCH_A, id: 'b2', name: 'Colaba Branch', city: 'Mumbai', isActive: false, _count: { deals: 0 } };

function table(): HTMLElement {
  const el = document.querySelector('sky-data-table');
  if (!el) throw new Error('sky-data-table not found');
  return el as HTMLElement;
}

function renderPage(canEdit = true) {
  listBranchesMock.mockResolvedValue({ data: [BRANCH_A, BRANCH_B] });
  return render(
    <MemoryRouter>
      <BranchesListPage token="tok" vendorId="v1" canEdit={canEdit} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BranchesListPage', () => {
  it('loads and shows one row per branch, with its location and deal count', async () => {
    renderPage();
    await waitFor(() => expect(listBranchesMock).toHaveBeenCalledWith('tok', 'v1'));
    const rows = await waitFor(() => {
      const r = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
      if (r.length !== 2) throw new Error('not loaded yet');
      return r;
    });
    expect(rows[0]).toMatchObject({ Name: 'Lower Parel Branch', Location: 'Maharashtra, Mumbai', Deals: '3 deals', Status: 'Active' });
    expect(rows[1]).toMatchObject({ Name: 'Colaba Branch', Deals: 'No deals yet', Status: 'Inactive' });
  });

  it('shows a heading with the branch count', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Branches' })).toBeTruthy();
    expect(await screen.findByText('2 branches')).toBeTruthy();
  });

  it('shows "Add branch" only when canEdit is true, and navigates to the add page', async () => {
    renderPage(true);
    const addButton = await screen.findByText('Add branch');
    fireEvent.click(addButton);
    expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/branches/new');
  });

  it('hides "Add branch" and every row action when canEdit is false', async () => {
    renderPage(false);
    await waitFor(() => expect(listBranchesMock).toHaveBeenCalled());
    expect(screen.queryByText('Add branch')).toBeNull();
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions).toEqual([]);
  });

  it('edit row action navigates to that branch\'s edit page', async () => {
    renderPage();
    await waitFor(() => expect(JSON.parse(table().getAttribute('rows') ?? '[]')).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'edit', rowIndex: 0 } }));
    expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/branches/b1');
  });

  it('toggle-status on an active branch asks for confirmation, then calls setBranchStatus(false) and reloads', async () => {
    setBranchStatusMock.mockResolvedValue({ data: { ...BRANCH_A, isActive: false } });
    renderPage();
    await waitFor(() => expect(JSON.parse(table().getAttribute('rows') ?? '[]')).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'toggle-status', rowIndex: 0 } }));
    // useConfirmDialog renders a real <md-dialog> — confirm() only resolves once its Confirm
    // button is actually clicked, so drive that instead of stubbing window.confirm.
    fireEvent.click(await screen.findByText('Confirm'));
    await waitFor(() => expect(setBranchStatusMock).toHaveBeenCalledWith('tok', 'v1', 'b1', false));
    await waitFor(() => expect(listBranchesMock).toHaveBeenCalledTimes(2));
  });

  it('toggle-status on an inactive branch reactivates without asking for confirmation', async () => {
    setBranchStatusMock.mockResolvedValue({ data: { ...BRANCH_B, isActive: true } });
    renderPage();
    await waitFor(() => expect(JSON.parse(table().getAttribute('rows') ?? '[]')).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'toggle-status', rowIndex: 1 } }));
    await waitFor(() => expect(setBranchStatusMock).toHaveBeenCalledWith('tok', 'v1', 'b2', true));
  });

  it('shows an error when loading branches fails', async () => {
    listBranchesMock.mockRejectedValue(new ApiRequestError('INTERNAL_ERROR', 'Could not load branches.', 500));
    render(
      <MemoryRouter>
        <BranchesListPage token="tok" vendorId="v1" canEdit />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load branches.');
  });

  it('shows an error when setBranchStatus fails after confirming', async () => {
    setBranchStatusMock.mockRejectedValue(new ApiRequestError('CONFLICT', 'Could not update this branch.', 409));
    renderPage();
    await waitFor(() => expect(JSON.parse(table().getAttribute('rows') ?? '[]')).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'toggle-status', rowIndex: 0 } }));
    fireEvent.click(await screen.findByText('Confirm'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update this branch.');
  });

  it('shows an empty state with no branches yet', async () => {
    listBranchesMock.mockResolvedValue({ data: [] });
    render(
      <MemoryRouter>
        <BranchesListPage token="tok" vendorId="v1" canEdit />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/No branches yet/)).toBeTruthy();
  });
});
