import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Category, Vendor, VendorProduct } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { ProductFormPage } from './product-form-page';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const listCategoriesMock = vi.fn();
const listVendorProductsMock = vi.fn();
const createVendorProductMock = vi.fn();
const updateVendorProductMock = vi.fn();
const getVendorMock = vi.fn();

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listCategories: (...args: unknown[]) => listCategoriesMock(...args),
    listVendorProducts: (...args: unknown[]) => listVendorProductsMock(...args),
    createVendorProduct: (...args: unknown[]) => createVendorProductMock(...args),
    updateVendorProduct: (...args: unknown[]) => updateVendorProductMock(...args),
    getVendor: (...args: unknown[]) => getVendorMock(...args),
  };
});

const CATEGORY: Category = { id: 'c1', name: 'Skincare', slug: 'skincare', parentId: null, isActive: true, type: 'PRODUCT' };

const EXISTING_PRODUCT: VendorProduct = {
  id: 'p1',
  vendorId: 'v1',
  name: 'Face Cream',
  slug: 'face-cream',
  brand: 'GlowCo',
  categoryId: 'c1',
  subcategoryId: null,
  price: '499.00',
  isNew: false,
  isFeatured: true,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  category: { id: 'c1', name: 'Skincare' },
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
  offersService: false,
  offersProduct: true,
  offersTherapy: false,
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
  listCategoriesMock.mockResolvedValue({ data: [CATEGORY] });
  listVendorProductsMock.mockResolvedValue({ data: [EXISTING_PRODUCT] });
  getVendorMock.mockResolvedValue({ data: VENDOR });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/account/vendors/:vendorId/products/new" element={<ProductFormPage token="tok" />} />
        <Route path="/account/vendors/:vendorId/products/:productId" element={<ProductFormPage token="tok" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProductFormPage — Add', () => {
  it('has no branch field at all — Product is vendor-level', async () => {
    renderAt('/account/vendors/v1/products/new');
    expect(await screen.findByRole('heading', { name: 'Add product' })).toBeTruthy();
    expect(selectByLabel('Branch')).toBeUndefined();
    await waitFor(() => expect(selectByLabel('Category')).toBeTruthy());
  });

  it('validates name/slug/category/price and never calls createVendorProduct when all are missing', async () => {
    renderAt('/account/vendors/v1/products/new');
    await screen.findByRole('heading', { name: 'Add product' });
    const save = findSaveButton() as HTMLElement;
    fireEvent.click(save);
    expect(await screen.findByText('Name is required.')).toBeTruthy();
    expect(createVendorProductMock).not.toHaveBeenCalled();
  });

  it('creates the product and redirects to its own edit page', async () => {
    createVendorProductMock.mockResolvedValue({ data: { ...EXISTING_PRODUCT, id: 'new-1' } });
    renderAt('/account/vendors/v1/products/new');
    await screen.findByRole('heading', { name: 'Add product' });

    const categorySelect = await waitFor(() => {
      const el = selectByLabel('Category');
      if (!el) throw new Error('not rendered yet');
      return el;
    });
    pickOption(categorySelect, 'c1');

    setText(fieldByLabel('Name') as HTMLElement & { value: string }, 'New Product');
    setText(fieldByLabel('Slug') as HTMLElement & { value: string }, 'new-product');
    setText(fieldByLabel('Price') as HTMLElement & { value: string }, '299');

    const save = findSaveButton() as HTMLElement;
    fireEvent.click(save);

    await waitFor(() =>
      expect(createVendorProductMock).toHaveBeenCalledWith('tok', 'v1', expect.objectContaining({
        categoryId: 'c1',
        name: 'New Product',
        slug: 'new-product',
        price: '299',
      })),
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/products/new-1', { replace: true }));
  });
});

describe('ProductFormPage — Edit', () => {
  it('loads the existing product: fields prefilled', async () => {
    renderAt('/account/vendors/v1/products/p1');
    expect(await screen.findByRole('heading', { name: 'Edit product' })).toBeTruthy();
    const name = await waitFor(() => {
      const el = fieldByLabel('Name');
      if (!el) throw new Error('not rendered yet');
      return el;
    });
    expect(name?.value).toBe('Face Cream');
    expect(fieldByLabel('Brand')?.value).toBe('GlowCo');
  });

  it('a product id not found in the vendor\'s own list shows an error', async () => {
    listVendorProductsMock.mockResolvedValue({ data: [] });
    render(
      <MemoryRouter initialEntries={['/account/vendors/v1/products/missing']}>
        <Routes>
          <Route path="/account/vendors/:vendorId/products/:productId" element={<ProductFormPage token="tok" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Product not found.')).toBeTruthy();
  });

  it('saves with updateVendorProduct, not createVendorProduct', async () => {
    updateVendorProductMock.mockResolvedValue({ data: EXISTING_PRODUCT });
    renderAt('/account/vendors/v1/products/p1');
    await screen.findByRole('heading', { name: 'Edit product' });
    await waitFor(() => expect(fieldByLabel('Name')?.value).toBe('Face Cream'));
    const save = findSaveButton() as HTMLElement;
    fireEvent.click(save);
    await waitFor(() => expect(updateVendorProductMock).toHaveBeenCalledWith('tok', 'v1', 'p1', expect.objectContaining({ name: 'Face Cream' })));
    expect(createVendorProductMock).not.toHaveBeenCalled();
  });

  it('shows the save error inline when updateVendorProduct rejects', async () => {
    updateVendorProductMock.mockRejectedValue(new ApiRequestError('VALIDATION_ERROR', 'Could not save this product.', 400));
    renderAt('/account/vendors/v1/products/p1');
    await screen.findByRole('heading', { name: 'Edit product' });
    await waitFor(() => expect(fieldByLabel('Name')?.value).toBe('Face Cream'));
    const save = findSaveButton() as HTMLElement;
    fireEvent.click(save);
    expect(await screen.findByText('Could not save this product.')).toBeTruthy();
  });
});
