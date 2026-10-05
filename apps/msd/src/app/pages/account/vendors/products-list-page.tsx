import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { FilledButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { listVendorProducts, setVendorProductStatus, deleteVendorProduct, type VendorProduct } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useConfirmDialog } from '../../../components/confirm-dialog';

interface ProductsListPageProps {
  token: string | null;
  vendorId: string;
  /** Gates "Add product" and each row's Edit/Toggle-status action — same coarse `vendors:edit`
   *  prop `BranchesListPage`/`DealsListPage`/`TherapistsListPage` already take. */
  canEdit: boolean;
  /** Gates the Delete row action — mirrors `vendor-detail-page.tsx`'s own `canDelete`. */
  canDelete: boolean;
}

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

const PRODUCT_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Brand', label: 'Brand' },
  { key: 'Category', label: 'Category' },
  { key: 'Price', label: 'Price' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);

function toRow(p: VendorProduct): Record<string, string | number> {
  return {
    Name: p.name,
    Brand: p.brand || '—',
    Category: p.category?.name ?? '—',
    Price: `₹${p.price}`,
    Status: p.isActive ? 'Active' : 'Inactive',
  };
}

/** Products — data table, vendor-level (Product has no branch, see msd-api's Product schema doc
 *  comment). Plugged into `VendorDetailPage`'s `section="products"`. Add/Edit are full pages
 *  (`/products/new`, `/products/:productId`), mirroring Deals/Therapists' own list+form pattern.
 *  Unlike those two (vendor-wide, unpaginated reads), Product's admin list is server-paginated
 *  and searchable (`listVendorProducts` takes `page`/`pageSize`/`search`), so this page owns
 *  real table params the way `vendors.tsx`'s own `AdminVendorManagement` does, instead of
 *  fetch-all-then-slice. A product's Delete is a real hard delete (blocked server-side, 409, if
 *  it has order/cart history — use the status toggle instead in that case). */
export function ProductsListPage({ token, vendorId, canEdit, canDelete }: ProductsListPageProps) {
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listVendorProducts(token, vendorId, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      });
      setProducts(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load products.');
    } finally {
      setLoading(false);
    }
  }, [token, vendorId, params]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (product: VendorProduct) => {
    setError('');
    try {
      await setVendorProductStatus(token, vendorId, product.id, !product.isActive);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change this product\'s status.');
    }
  };

  const remove = async (product: VendorProduct) => {
    if (!(await confirm(`Delete "${product.name}"? This cannot be undone.`))) return;
    try {
      await deleteVendorProduct(token, vendorId, product.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete this product.');
    }
  };

  const actions = [
    ...(canEdit ? [{ icon: 'edit', label: 'Edit', event: 'edit' }, { icon: 'toggle_on', label: 'Activate / Deactivate', event: 'toggle-status' }] : []),
    ...(canDelete ? [{ icon: 'delete', label: 'Delete', event: 'delete', variant: 'danger' }] : []),
  ];

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize, search: detail.search });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; rowIndex: number }>).detail;
      const product = products[detail.rowIndex];
      if (!product) return;
      if (detail.action === 'edit') navigate(`/account/vendors/${vendorId}/products/${product.id}`);
      else if (detail.action === 'toggle-status') toggleStatus(product);
      else if (detail.action === 'delete') remove(product);
    };
    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actions/toggleStatus/remove are recreated each render; rowIndex lookup always reads the latest `products` via closure
  }, [products, vendorId, navigate]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2 className="section-title">Products</h2>
          <p className="field-hint">{loading ? 'Loading…' : `${total} product${total === 1 ? '' : 's'}`}</p>
        </div>
        {canEdit && (
          <div className="page-head__actions">
            <FilledButton onClick={() => navigate(`/account/vendors/${vendorId}/products/new`)}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add product
            </FilledButton>
          </div>
        )}
      </div>

      {error && <p className="error-state" role="alert">{error}</p>}

      {!loading && total === 0 && !params.search ? (
        <p className="empty-state">No products yet.</p>
      ) : (
        <sky-data-table
          ref={tableRef as RefObject<HTMLElement>}
          caption="Products"
          columns={PRODUCT_COLUMNS}
          rows={JSON.stringify(products.map(toRow))}
          total={total}
          page={params.page}
          page-size={params.pageSize}
          loading={loading}
          searchable
          search-placeholder="Search products…"
          actions={actions.length > 0 ? JSON.stringify(actions) : undefined}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}

export default ProductsListPage;
