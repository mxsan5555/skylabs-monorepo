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
  createProduct,
  deleteProduct,
  listProducts,
  setProductStatus,
  updateProduct,
  type Product,
  type ProductInput,
} from '../../../../api/rbac/products';
import { listCategories, type Category } from '../../../../api/rbac/categories';
import { ApiRequestError } from '../../../../api/rbac/client';

const PRODUCT_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
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
 * Standalone retail Product catalog admin CRUD — mirrors `ServiceManagement`'s exact list +
 * Add/Edit-dialog pattern, standardized onto the same <sky-data-table> used by
 * Orders/Bookings. Unlike Vendor/Deal, Products are NOT vendor/branch-scoped (nothing in the
 * existing storefront data ties a product to a vendor — see the plan/design notes).
 */
export function ProductManagement() {
  const { token, can } = useAuth();
  const canCreate = can('products', 'create');
  const canEdit = can('products', 'edit');
  const canDelete = can('products', 'delete');

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);
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
    listCategories(token, { pageSize: 100 }).then(({ data }) => setCategories(data)).catch(() => setCategories([]));
  }, [token]);

  const categoryName = useCallback((id: string) => categories.find((c) => c.id === id)?.name ?? id, [categories]);

  const save = async (input: ProductInput, existing?: Product) => {
    if (existing) {
      const { data } = await updateProduct(token, existing.id, input);
      setProducts((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    } else {
      const { data } = await createProduct(token, input);
      setProducts((prev) => [data, ...prev]);
      setTotal((t) => t + 1);
    }
    setMessage('Saved.');
  };

  const toggleStatus = async (product: Product) => {
    setError('');
    try {
      const { data } = await setProductStatus(token, product.id, !product.isActive);
      setProducts((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change status.');
    }
  };

  const remove = async (product: Product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteProduct(token, product.id);
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      setTotal((t) => t - 1);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete product.');
    }
  };

  /** Flat row for <sky-data-table>; row index is used to map a click back to `products`. */
  const rows = useMemo(
    () =>
      JSON.stringify(
        products.map((product) => ({
          Name: product.name,
          Brand: product.brand ?? '—',
          Category: categoryName(product.categoryId),
          Subcategory: product.subcategoryId ? categoryName(product.subcategoryId) : '—',
          Price: `₹${product.price}`,
          Discount: product.discount ? `${product.discount}%` : '—',
          Status: product.isActive ? 'Active' : 'Inactive',
        })),
      ),
    [products, categoryName],
  );

  const actions = useMemo(
    () =>
      JSON.stringify([
        ...(canEdit ? [{ icon: 'edit', label: 'Edit', event: 'edit' }] : []),
        ...(canEdit ? [{ icon: 'toggle_on', label: 'Activate / Deactivate', event: 'toggle-status' }] : []),
        ...(canDelete ? [{ icon: 'delete', label: 'Delete', event: 'delete', variant: 'danger' }] : []),
      ]),
    [canEdit, canDelete],
  );

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize, search: detail.search, filter: detail.filter });
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

  return (
    <div className="admin-page admin-page--wide">
      <title>Products · MSD</title>
      <header className="page-head">
        <div>
          <h1>Products</h1>
          <p>Retail product catalog.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && categories.length > 0 && (
            <OutlinedButton onClick={() => addDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add product
            </OutlinedButton>
          )}
        </div>
      </header>

      {message && <p className="field-hint" role="status">{message}</p>}
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
        actions={actions}
      />

      {canCreate && categories.length > 0 && (
        <ProductFormDialog dialogRef={addDialogRef} categories={categories} onSave={(input) => save(input)} />
      )}

      {canEdit && (
        <ProductFormDialog
          key={editingProduct?.id ?? 'edit-empty'}
          dialogRef={editDialogRef}
          categories={categories}
          product={editingProduct ?? undefined}
          onSave={(input) => save(input, editingProduct ?? undefined)}
          onClose={() => setEditingProduct(null)}
        />
      )}
    </div>
  );
}

const EMPTY_INPUT: ProductInput = { name: '', slug: '', categoryId: '', price: '' };

function ProductFormDialog({
  dialogRef,
  categories,
  product,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog>;
  categories: Category[];
  product?: Product;
  onSave: (input: ProductInput) => Promise<void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<ProductInput>(
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
          image: product.image ?? undefined,
          gallery: product.gallery ?? [],
          imageAlt: product.imageAlt ?? undefined,
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

  const parentCategories = categories.filter((c) => !c.parentId);
  const subcategoryOptions = categories.filter((c) => c.parentId === form.categoryId);

  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const gallery = form.gallery ?? [];
  const setGallery = (urls: string[]) => set('gallery', urls);

  const submit = async () => {
    if (!form.name.trim() || !form.slug.trim() || !form.categoryId || !form.price.trim()) {
      setError('Name, slug, category, and price are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSave(form);
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save.');
    } finally {
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
          onChange={(e: Event) => { set('categoryId', (e.target as HTMLSelectElement).value); set('subcategoryId', undefined); }}
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
            value={form.subcategoryId ?? ''}
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

        <OutlinedTextField label="Primary image URL" value={form.image ?? ''} onInput={(e: Event) => set('image', (e.target as HTMLInputElement).value)} />
        <OutlinedTextField label="Image alt text" value={form.imageAlt ?? ''} onInput={(e: Event) => set('imageAlt', (e.target as HTMLInputElement).value)} />

        <fieldset>
          <legend>Gallery images</legend>
          {gallery.map((url, i) => (
            <div className="form-grid" key={i}>
              <OutlinedTextField
                label={`Image URL ${i + 1}`}
                value={url}
                onInput={(e: Event) => setGallery(gallery.map((u, idx) => (idx === i ? (e.target as HTMLInputElement).value : u)))}
              />
              <OutlinedButton onClick={() => setGallery(gallery.filter((_, idx) => idx !== i))}>
                <Icon slot="icon" aria-hidden="true">delete</Icon>
                Remove
              </OutlinedButton>
            </div>
          ))}
          <OutlinedButton onClick={() => setGallery([...gallery, ''])}>
            <Icon slot="icon" aria-hidden="true">add</Icon>
            Add gallery image
          </OutlinedButton>
        </fieldset>

        <label className="widget-assign-row__label">
          <input type="checkbox" checked={form.isNew ?? false} onChange={(e) => set('isNew', e.target.checked)} />
          New
        </label>
        <label className="widget-assign-row__label">
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

export default ProductManagement;
