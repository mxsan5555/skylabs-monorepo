import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdminDeal } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { DealsListPage } from './deals-list-page';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const listVendorDealsForAdminMock = vi.fn();
const setDealStatusMock = vi.fn();
const deleteDealMock = vi.fn();
vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listVendorDealsForAdmin: (...args: unknown[]) => listVendorDealsForAdminMock(...args),
    setDealStatus: (...args: unknown[]) => setDealStatusMock(...args),
    deleteDeal: (...args: unknown[]) => deleteDealMock(...args),
  };
});

const DEAL_A: AdminDeal = {
  id: 'd1',
  vendorId: 'v1',
  branchId: 'b1',
  categoryId: 'c1',
  subcategoryId: null,
  title: 'Deep Tissue Massage',
  slug: 'deep-tissue',
  originalPrice: '1499.00',
  salePrice: '1299.00',
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  category: { id: 'c1', name: 'Spa', slug: 'spa', parentId: null, isActive: true },
  branch: { id: 'b1', name: 'Lower Parel Branch' },
  therapists: [{ id: 't1', personName: 'Ramesh Kumar', therapistType: 'Massage Therapist', isActive: true }],
};

const DEAL_B: AdminDeal = {
  ...DEAL_A,
  id: 'd2',
  title: 'Foot Reflexology',
  slug: 'foot-reflexology',
  status: 'DRAFT',
  therapists: [],
};

function table(): HTMLElement {
  const el = document.querySelector('sky-data-table');
  if (!el) throw new Error('sky-data-table not found');
  return el as HTMLElement;
}

function renderPage(canEdit = true, canDelete = true) {
  listVendorDealsForAdminMock.mockResolvedValue({ data: [DEAL_A, DEAL_B] });
  return render(
    <MemoryRouter>
      <DealsListPage token="tok" vendorId="v1" canEdit={canEdit} canDelete={canDelete} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DealsListPage', () => {
  it('loads every deal for the vendor (across branches) and shows one row each', async () => {
    renderPage();
    await waitFor(() => expect(listVendorDealsForAdminMock).toHaveBeenCalledWith('tok', 'v1'));
    await waitFor(() => expect(JSON.parse(table().getAttribute('rows') ?? '[]')).toHaveLength(2));
    const rows = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
    expect(rows[0]).toMatchObject({ Title: 'Deep Tissue Massage', Branch: 'Lower Parel Branch', Price: '₹1299.00', Therapists: '1 linked', Status: 'ACTIVE' });
    expect(rows[1]).toMatchObject({ Title: 'Foot Reflexology', Therapists: 'None linked', Status: 'DRAFT' });
  });

  it('shows a heading with the deal count', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Deals' })).toBeTruthy();
    expect(await screen.findByText('2 deals')).toBeTruthy();
  });

  it('shows "Add deal" only when canEdit is true, and navigates to the add page', async () => {
    renderPage(true);
    const addButton = await screen.findByText('Add deal');
    fireEvent.click(addButton);
    expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/deals/new');
  });

  it('hides "Add deal" and row edit/status actions when canEdit is false', async () => {
    renderPage(false, true);
    await waitFor(() => expect(listVendorDealsForAdminMock).toHaveBeenCalled());
    expect(screen.queryByText('Add deal')).toBeNull();
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions.map((a) => a.event)).toEqual(['delete']);
  });

  it('hides the delete action when canDelete is false', async () => {
    renderPage(true, false);
    await waitFor(() => expect(listVendorDealsForAdminMock).toHaveBeenCalled());
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions.map((a) => a.event)).toEqual(['edit', 'toggle-status']);
  });

  it('edit row action navigates to that deal\'s edit page', async () => {
    renderPage();
    await waitFor(() => expect(JSON.parse(table().getAttribute('rows') ?? '[]')).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'edit', rowIndex: 0 } }));
    expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/deals/d1');
  });

  it('toggle-status flips an ACTIVE deal to INACTIVE and reloads', async () => {
    setDealStatusMock.mockResolvedValue({ data: { ...DEAL_A, status: 'INACTIVE' } });
    renderPage();
    await waitFor(() => expect(JSON.parse(table().getAttribute('rows') ?? '[]')).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'toggle-status', rowIndex: 0 } }));
    await waitFor(() => expect(setDealStatusMock).toHaveBeenCalledWith('tok', 'v1', 'b1', 'd1', 'INACTIVE'));
    await waitFor(() => expect(listVendorDealsForAdminMock).toHaveBeenCalledTimes(2));
  });

  it('toggle-status flips a non-ACTIVE deal (DRAFT) to ACTIVE', async () => {
    setDealStatusMock.mockResolvedValue({ data: { ...DEAL_B, status: 'ACTIVE' } });
    renderPage();
    await waitFor(() => expect(JSON.parse(table().getAttribute('rows') ?? '[]')).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'toggle-status', rowIndex: 1 } }));
    await waitFor(() => expect(setDealStatusMock).toHaveBeenCalledWith('tok', 'v1', 'b1', 'd2', 'ACTIVE'));
  });

  it('delete asks for confirmation, then calls deleteDeal and reloads the list', async () => {
    deleteDealMock.mockResolvedValue({ data: null });
    renderPage();
    await waitFor(() => expect(JSON.parse(table().getAttribute('rows') ?? '[]')).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'delete', rowIndex: 0 } }));
    fireEvent.click(await screen.findByText('Confirm'));
    await waitFor(() => expect(deleteDealMock).toHaveBeenCalledWith('tok', 'v1', 'b1', 'd1'));
    await waitFor(() => expect(listVendorDealsForAdminMock).toHaveBeenCalledTimes(2));
  });

  it('shows an error when loading deals fails', async () => {
    listVendorDealsForAdminMock.mockRejectedValue(new ApiRequestError('INTERNAL_ERROR', 'Could not load deals.', 500));
    render(
      <MemoryRouter>
        <DealsListPage token="tok" vendorId="v1" canEdit canDelete />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load deals.');
  });

  it('shows a conflict error from deleteDeal (blocked by real order history) without crashing', async () => {
    deleteDealMock.mockRejectedValue(new ApiRequestError('CONFLICT', 'Cannot delete this deal because it has existing orders or carts referencing it.', 409));
    renderPage();
    await waitFor(() => expect(JSON.parse(table().getAttribute('rows') ?? '[]')).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'delete', rowIndex: 0 } }));
    fireEvent.click(await screen.findByText('Confirm'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot delete this deal because it has existing orders or carts referencing it.');
  });

  it('shows an empty state with no deals yet', async () => {
    listVendorDealsForAdminMock.mockResolvedValue({ data: [] });
    render(
      <MemoryRouter>
        <DealsListPage token="tok" vendorId="v1" canEdit canDelete />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/No deals yet/)).toBeTruthy();
  });
});
