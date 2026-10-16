import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import {
  Dialog,
  FilledButton,
  OutlinedButton,
  OutlinedTextField,
  OutlinedSelect,
  SelectOption,
  TextButton,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  createMyProduct,
  deleteMyProduct,
  getMyVendor,
  listCategories,
  listMyProducts,
  setMyProductStatus,
  updateMyProduct,
  type Category,
  type VendorProduct,
  type VendorProductInput,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { MediaUploader } from '../../../components/media-uploader';
import { resolveCategoryTiers } from '../../../../utils/category-tree';

const PRODUCT_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Brand', label: 'Brand' },
  { key: 'Category', label: 'Category' },
  { key: 'Price', label: 'Price' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);

const PRODUCT_ACTIONS = JSON.stringify([
  { icon: 'edit', label: 'Edit', event: 'edit' },
  { icon: 'toggle_on', label: 'Activate / Deactivate', event: 'toggle-status' },
  { icon: 'delete', label: 'Delete', event: 'delete' },
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

interface TableParams {
  page: number;
  pageSize: number;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 20 };

/**
 * Vendor self-service "Products" page — the ongoing counterpart to the onboarding wizard's
 * Products step (`vendor-wizard-products.tsx`, admin-on-behalf only). Product is vendor-level
 * (never branch-scoped, see msd-api's Product schema doc comment), so this is a flat list with no
 * branch selector, hitting the exact same `/vendors/me/products*` self-service routes (`vendors:
 * custom`) the wizard step already uses on the admin-on-behalf side — never the read-only, no-
 * add/edit/delete `/account/products` oversight page.
 */
export function VendorProducts() {
  const { token } = useAuth();
  const [vendorId, setVendorId] = useState('');
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);

  const [editingProduct, setEditingProduct] = useState<VendorProduct | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);
  const tableRef = useRef<HTMLElement>(null);

  useEffect(() => {
    getMyVendor(token)
      .then(({ data: vendor }) => {
        setVendorId(vendor.id);
        return listCategories(token, { type: 'PRODUCT', vendorId: vendor.id });
      })
      .then(({ data }) => setCategories(data))
      .catch(() => setCategories([]));
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await listMyProducts(token, { pageSize: 100 });
      setProducts(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load your products.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (input: VendorProductInput, existing?: VendorProduct) => {
    const { data } = existing ? await updateMyProduct(token, existing.id, input) : await createMyProduct(token, input);
    setProducts((prev) => (existing ? prev.map((p) => (p.id === data.id ? data : p)) : [data, ...prev]));
    setMessage('Saved.');
    return data;
  };

  const toggleStatus = async (product: VendorProduct) => {
    setError('');
    try {
      const { data } = await setMyProductStatus(token, product.id, !product.isActive);
      setProducts((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change status.');
    }
  };

  const remove = async (product: VendorProduct) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteMyProduct(token, product.id);
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete product.');
    }
  };

  const total = products.length;
  const rows = useMemo(() => JSON.stringify(products.map(toRow)), [products]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown>; rowIndex: number }>).detail;
      const product = products[detail.rowIndex];
      if (!product) return;
      if (detail.action === 'edit') {
        setEditingProduct(product);
        editDialogRef.current?.show();
      } else if (detail.action === 'toggle-status') {
        toggleStatus(product);
      } else if (detail.action === 'delete') {
        remove(product);
      }
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const canAdd = categories.length > 0;

  return (
    <div className="admin-page admin-page--wide">
      <title>Products · MSD</title>
      <header className="page-head">
        <div>
          <h1>Products</h1>
          <p>Your business's retail product catalogue.</p>
        </div>
        <div className="page-head__actions">
          {canAdd && (
            <OutlinedButton onClick={() => addDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add product
            </OutlinedButton>
          )}
        </div>
      </header>

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      {!loading && categories.length === 0 ? (
        <p className="empty-state">Your business has not been granted a Product category yet — contact an admin.</p>
      ) : (
        <sky-data-table
          ref={tableRef as RefObject<HTMLElement>}
          caption="Products"
          columns={PRODUCT_COLUMNS}
          rows={rows}
          total={total}
          page={params.page}
          page-size={params.pageSize}
          loading={loading}
          actions={PRODUCT_ACTIONS}
        />
      )}

      {canAdd && (
        <ProductFormDialog dialogRef={addDialogRef} categories={categories} vendorId={vendorId} token={token} onSave={(input) => save(input)} />
      )}
      {editingProduct && (
        <ProductFormDialog
          key={editingProduct.id}
          dialogRef={editDialogRef}
          categories={categories}
          vendorId={vendorId}
          product={editingProduct}
          token={token}
          onSave={(input) => save(input, editingProduct)}
          onClose={() => setEditingProduct(null)}
        />
      )}
    </div>
  );
}

const EMPTY_INPUT: VendorProductInput = { name: '', slug: '', categoryId: '', price: '' };

function ProductFormDialog({
  dialogRef,
  categories,
  vendorId,
  product,
  token,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog | null>;
  categories: Category[];
  vendorId: string;
  product?: VendorProduct;
  token: string | null;
  onSave: (input: VendorProductInput) => Promise<VendorProduct | void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<VendorProductInput>(
    product
      ? {
          name: product.name,
          slug: product.slug,
          brand: product.brand ?? undefined,
          categoryId: product.categoryId,
          subcategoryId: product.subcategoryId ?? undefined,
          summary: product.summary ?? undefined,
          description: product.description ?? undefined,
          ingredients: product.ingredients ?? undefined,
          returnPolicy: product.returnPolicy ?? undefined,
          badge: product.badge ?? undefined,
          price: product.price,
          originalPrice: product.originalPrice ?? undefined,
          discount: product.discount ?? undefined,
          benefits: product.benefits ?? [],
          howToUse: product.howToUse ?? [],
          isNew: product.isNew,
          isFeatured: product.isFeatured,
        }
      : { ...EMPTY_INPUT, categoryId: categories.find((c) => !c.parentId)?.id ?? categories[0]?.id ?? '' },
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  // Tracks the entity MediaUploader should upload against once a create resolves — see
  // vendor-wizard-products.tsx's `ProductFormDialog`/DealDialog's identical `savedDeal` state.
  const [savedProduct, setSavedProduct] = useState<VendorProduct | undefined>(product);

  const parentCategories = categories.filter((c) => !c.parentId);
  const { subcategoryOptions, typeOptions, subcategoryTierId, selectedTypeId } = resolveCategoryTiers(
    categories,
    form.categoryId,
    form.subcategoryId,
  );

  const set = <K extends keyof VendorProductInput>(key: K, value: VendorProductInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (submittingRef.current) return;
    if (!form.name.trim() || !form.slug.trim() || !form.categoryId || !form.price.trim()) {
      setError('Name, slug, category, and price are required.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const result = await onSave(form);
      if (!product && result) {
        setSavedProduct(result);
      } else {
        dialogRef.current?.close();
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save product.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{product ? 'Edit product' : 'Add product'}</div>
      <div slot="content" className="form-grid">
        <OutlinedSelect
          label="Category"
          value={form.categoryId}
          onChange={(e: Event) => {
            set('categoryId', (e.target as HTMLSelectElement).value);
            set('subcategoryId', undefined);
          }}
        >
          {parentCategories.map((c) => (
            <SelectOption key={c.id} value={c.id}>
              <div slot="headline">{c.name}</div>
            </SelectOption>
          ))}
        </OutlinedSelect>

        {subcategoryOptions.length > 0 && (
          <OutlinedSelect
            label="Subcategory (optional)"
            value={subcategoryTierId ?? ''}
            onChange={(e: Event) => set('subcategoryId', (e.target as HTMLSelectElement).value || undefined)}
          >
            <SelectOption value="">
              <div slot="headline">None</div>
            </SelectOption>
            {subcategoryOptions.map((c) => (
              <SelectOption key={c.id} value={c.id}>
                <div slot="headline">{c.name}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>
        )}

        {typeOptions.length > 0 && (
          <OutlinedSelect
            label="Type (optional)"
            value={selectedTypeId ?? ''}
            onChange={(e: Event) => set('subcategoryId', (e.target as HTMLSelectElement).value || subcategoryTierId)}
          >
            <SelectOption value="">
              <div slot="headline">None</div>
            </SelectOption>
            {typeOptions.map((c) => (
              <SelectOption key={c.id} value={c.id}>
                <div slot="headline">{c.name}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>
        )}

        <OutlinedTextField label="Name" value={form.name} onInput={(e: Event) => set('name', (e.target as HTMLInputElement).value)} />
        <OutlinedTextField label="Slug" value={form.slug} onInput={(e: Event) => set('slug', (e.target as HTMLInputElement).value)} />
        <OutlinedTextField label="Brand" value={form.brand ?? ''} onInput={(e: Event) => set('brand', (e.target as HTMLInputElement).value)} />

        <OutlinedTextField label="Price" value={form.price} onInput={(e: Event) => set('price', (e.target as HTMLInputElement).value)} />
        <OutlinedTextField label="Original price" value={form.originalPrice ?? ''} onInput={(e: Event) => set('originalPrice', (e.target as HTMLInputElement).value)} />
        <OutlinedTextField
          label="Discount %"
          type="number"
          value={form.discount !== undefined ? String(form.discount) : ''}
          onInput={(e: Event) => set('discount', Number((e.target as HTMLInputElement).value) || undefined)}
        />
        <OutlinedTextField label="Badge" value={form.badge ?? ''} onInput={(e: Event) => set('badge', (e.target as HTMLInputElement).value)} />

        <OutlinedTextField label="Summary" value={form.summary ?? ''} onInput={(e: Event) => set('summary', (e.target as HTMLInputElement).value)} />
        <OutlinedTextField label="Description" value={form.description ?? ''} onInput={(e: Event) => set('description', (e.target as HTMLInputElement).value)} />
        <OutlinedTextField label="Ingredients" value={form.ingredients ?? ''} onInput={(e: Event) => set('ingredients', (e.target as HTMLInputElement).value)} />
        <OutlinedTextField label="Return policy" value={form.returnPolicy ?? ''} onInput={(e: Event) => set('returnPolicy', (e.target as HTMLInputElement).value)} />

        <MediaUploader
          entityType="product"
          entityId={savedProduct?.id ?? null}
          selfService
          vendorId={vendorId}
          existingImages={savedProduct?.mediaImages ?? []}
          existingVideo={savedProduct?.mediaVideo ?? null}
          token={token}
        />

        <label className="category-grant-grid__option">
          <input type="checkbox" checked={form.isNew ?? false} onChange={(e) => set('isNew', e.target.checked)} />
          New
        </label>
        <label className="category-grant-grid__option">
          <input type="checkbox" checked={form.isFeatured ?? false} onChange={(e) => set('isFeatured', e.target.checked)} />
          Featured
        </label>

        {error && <p className="error-state" role="alert">{error}</p>}
      </div>
      <div slot="actions">
        <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
        <FilledButton onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</FilledButton>
      </div>
    </Dialog>
  );
}

export default VendorProducts;
