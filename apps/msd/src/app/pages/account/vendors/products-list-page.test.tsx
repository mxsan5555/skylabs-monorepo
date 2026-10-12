import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VendorProduct } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { ProductsListPage } from './products-list-page';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const listVendorProductsMock = vi.fn();
const setVendorProductStatusMock = vi.fn();
const deleteVendorProductMock = vi.fn();
vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listVendorProducts: (...args: unknown[]) => listVendorProductsMock(...args),
    setVendorProductStatus: (...args: unknown[]) => setVendorProductStatusMock(...args),
    deleteVendorProduct: (...args: unknown[]) => deleteVendorProductMock(...args),
  };
});

const PRODUCT_A: VendorProduct = {
  id: 'p1',
  vendorId: 'v1',
  name: 'Face Cream',
  slug: 'face-cream',
  brand: 'GlowCo',
  categoryId: 'c1',
  subcategoryId: null,
  price: '499.00',
  isNew: false,
  isFeatured: false,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  category: { id: 'c1', name: 'Skincare' },
};

const PRODUCT_B: VendorProduct = { ...PRODUCT_A, id: 'p2', name: 'Body Lotion', brand: null, isActive: false };

function table(): HTMLElement {
  const el = document.querySelector('sky-data-table');
  if (!el) throw new Error('sky-data-table not found');
  return el as HTMLElement;
}

function renderPage(canEdit = true, canDelete = true) {
  listVendorProductsMock.mockResolvedValue({ data: [PRODUCT_A, PRODUCT_B], meta: { total: 2 } });
  return render(
    <MemoryRouter>
      <ProductsListPage token="tok" vendorId="v1" canEdit={canEdit} canDelete={canDelete} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProductsListPage', () => {
  it('loads products (server-paginated) and shows one row each, using the real total from meta', async () => {
    renderPage();
    await waitFor(() => expect(listVendorProductsMock).toHaveBeenCalledWith('tok', 'v1', { page: 1, pageSize: 10, search: undefined }));
    const rows = await waitFor(() => {
      const r = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
      if (r.length !== 2) throw new Error('not loaded yet');
      return r;
    });
    expect(rows[0]).toMatchObject({ Name: 'Face Cream', Brand: 'GlowCo', Category: 'Skincare', Price: '₹499.00', Status: 'Active' });
    expect(rows[1]).toMatchObject({ Name: 'Body Lotion', Brand: '—', Status: 'Inactive' });
    expect(table().getAttribute('total')).toBe('2');
  });

  it('shows a heading with the real total', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Products' })).toBeTruthy();
    expect(await screen.findByText('2 products')).toBeTruthy();
  });

  it('falls back to data.length when meta.total is absent', async () => {
    listVendorProductsMock.mockResolvedValue({ data: [PRODUCT_A] });
    render(
      <MemoryRouter>
        <ProductsListPage token="tok" vendorId="v1" canEdit canDelete />
      </MemoryRouter>,
    );
    expect(await screen.findByText('1 product')).toBeTruthy();
  });

  it('re-fetches with the new page/search on sky-dt-params-change', async () => {
    renderPage();
    await waitFor(() => expect(listVendorProductsMock).toHaveBeenCalledTimes(1));
    fireEvent(table(), new CustomEvent('sky-dt-params-change', { detail: { page: 2, pageSize: 10, sortKey: '', sortDir: '', search: 'cream', filter: '' } }));
    await waitFor(() => expect(listVendorProductsMock).toHaveBeenCalledWith('tok', 'v1', { page: 2, pageSize: 10, search: 'cream' }));
  });

  it('shows "Add product" only when canEdit is true, and navigates to the add page', async () => {
    renderPage(true);
    const addButton = await screen.findByText('Add product');
    fireEvent.click(addButton);
    expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/products/new');
  });

  it('hides "Add product" and row edit/status actions when canEdit is false', async () => {
    renderPage(false, true);
    await waitFor(() => expect(listVendorProductsMock).toHaveBeenCalled());
    expect(screen.queryByText('Add product')).toBeNull();
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions.map((a) => a.event)).toEqual(['delete']);
  });

  it('hides the delete action when canDelete is false', async () => {
    renderPage(true, false);
    await waitFor(() => expect(listVendorProductsMock).toHaveBeenCalled());
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions.map((a) => a.event)).toEqual(['edit', 'toggle-status']);
  });

  it('edit row action navigates to that product\'s edit page', async () => {
    renderPage();
    await waitFor(() => expect(JSON.parse(table().getAttribute('rows') ?? '[]')).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'edit', rowIndex: 0 } }));
    expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/products/p1');
  });

  it('toggle-status flips an active product to inactive and reloads', async () => {
    setVendorProductStatusMock.mockResolvedValue({ data: { ...PRODUCT_A, isActive: false } });
    renderPage();
    await waitFor(() => expect(JSON.parse(table().getAttribute('rows') ?? '[]')).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'toggle-status', rowIndex: 0 } }));
    await waitFor(() => expect(setVendorProductStatusMock).toHaveBeenCalledWith('tok', 'v1', 'p1', false));
    await waitFor(() => expect(listVendorProductsMock).toHaveBeenCalledTimes(2));
  });

  it('delete asks for confirmation, then calls deleteVendorProduct and reloads the list', async () => {
    deleteVendorProductMock.mockResolvedValue({ data: null });
    renderPage();
    await waitFor(() => expect(JSON.parse(table().getAttribute('rows') ?? '[]')).toHaveLength(2));
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'delete', rowIndex: 0 } }));
    fireEvent.click(await screen.findByText('Confirm'));
    await waitFor(() => expect(deleteVendorProductMock).toHaveBeenCalledWith('tok', 'v1', 'p1'));
    await waitFor(() => expect(listVendorProductsMock).toHaveBeenCalledTimes(2));
  });

  it('shows an error when loading products fails', async () => {
    listVendorProductsMock.mockRejectedValue(new ApiRequestError('INTERNAL_ERROR', 'Could not load products.', 500));
    render(
      <MemoryRouter>
        <ProductsListPage token="tok" vendorId="v1" canEdit canDelete />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load products.');
  });

  it('shows an empty state with no products yet', async () => {
    listVendorProductsMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    render(
      <MemoryRouter>
        <ProductsListPage token="tok" vendorId="v1" canEdit canDelete />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/No products yet/)).toBeTruthy();
  });
});
