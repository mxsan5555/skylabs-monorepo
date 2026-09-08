import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listProducts, type Product } from '../../../../api/rbac/products';
import { listVendors, type Vendor } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

const PRODUCT_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Vendor', label: 'Vendor' },
  { key: 'Brand', label: 'Brand' },
  { key: 'Category', label: 'Category' },
  { key: 'Subcategory', label: 'Subcategory' },
  { key: 'Price', label: 'Price' },
  { key: 'Discount', label: 'Discount' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);

const PRODUCT_FILTERS = JSON.stringify([
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
]);

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
  filter: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '', filter: '' };

/**
 * Superadmin, cross-vendor, READ-ONLY oversight list — Product is now a vendor-owned entity
 * (`vendorId` required, see the direct-category-access migration); create/update/delete/media
 * are vendor-scoped only, split self-service (`/vendors/me/products`) vs admin-on-behalf
 * (`/vendors/:id/products`) — see `apps/msd/src/api/rbac/vendors.ts`'s `VendorProduct` CRUD,
 * used by the vendor onboarding wizard's own Products step, never this page. This page exists
 * purely so a SuperAdmin can browse/audit every vendor's catalog in one place; there is
 * deliberately no Add/Edit/Delete UI here — the backend's `/products` route is GET-only.
 */
export function ProductManagement() {
  const { token } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [error, setError] = useState('');

  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listProducts(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
        status: (params.filter || undefined) as 'active' | 'inactive' | undefined,
      });
      setProducts(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load products.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // pageSize is capped at 100 server-side (PaginationQuerySchema) — 200 here 500s.
    listVendors(token, { pageSize: 100 }).then(({ data }) => setVendors(data)).catch(() => setVendors([]));
  }, [token]);

  const vendorName = useCallback(
    (id: string) => vendors.find((v) => v.id === id)?.businessName ?? id,
    [vendors],
    
  );

  /** Flat row for <sky-data-table>; row index is used to map a click back to `products`. */
  const rows = useMemo(
    () =>
      JSON.stringify(
        products.map((product) => ({
          Name: product.name,
          Vendor: vendorName(product.vendorId),
          Brand: product.brand ?? '—',
          Category: product.category?.name ?? '—',
          Subcategory: product.subcategory?.name ?? '—',
          Price: `₹${product.price}`,
          Discount: product.discount ? `${product.discount}%` : '—',
          Status: product.isActive ? 'Active' : 'Inactive',
        })),
      ),
    [products, vendorName],
  );

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize, search: detail.search, filter: detail.filter });
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
    };
  }, []);

  return (
    <div className="admin-page admin-page--wide">
      <title>Products · MSD</title>
      <header className="page-head">
        <div>
          <h1>Products</h1>
          <p>Read-only oversight of every vendor's retail product catalog. Products are created and managed by vendors themselves.</p>
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Products"
        columns={PRODUCT_COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        searchable
        search-placeholder="Search by name, brand, or slug…"
        filter-label="Status"
        filter-options={PRODUCT_FILTERS}
      />
    </div>
  );
}

export default ProductManagement;
