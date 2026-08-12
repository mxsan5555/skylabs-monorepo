import { useCallback, useEffect, useRef, useState } from 'react';
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

/**
 * Standalone retail Product catalog admin CRUD — mirrors `CategoryManagement`'s exact list +
 * Add/Edit-dialog pattern. Unlike Vendor/Deal, Products are NOT vendor/branch-scoped (nothing
 * in the existing storefront data ties a product to a vendor — see the plan/design notes).
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
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listProducts(token, { search: search || undefined, pageSize: 100 });
      setProducts(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load products.');
    } finally {
      setLoading(false);
    }
  }, [token, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listCategories(token, { pageSize: 200 }).then(({ data }) => setCategories(data)).catch(() => setCategories([]));
  }, [token]);

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

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

  return (
    <div className="admin-page admin-page--wide">
      <title>Products · MSD</title>
      <header className="page-head">
        <div>
          <h1>Products</h1>
          <p>Retail product catalog.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && categories.length > 0 && <ProductDialog categories={categories} onSave={(input) => save(input)} />}
        </div>
      </header>

      <OutlinedTextField label="Search by name, brand, or slug" value={search} onInput={(e: Event) => setSearch((e.target as HTMLInputElement).value)} />

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      {loading ? (
        <p className="loading-state">Loading products…</p>
      ) : products.length === 0 ? (
        <p className="empty-state">No products yet. {canCreate && 'Add one to get started.'}</p>
      ) : (
        <>
          <p className="field-hint">{total} product{total === 1 ? '' : 's'}</p>
          <ul className="entity-list">
            {products.map((product) => (
              <li key={product.id}>
                <div className="entity-list__item">
                  <span className="role-list__name">
                    {product.name}
                    <span className="field-hint">
                      {' '}
                      · {product.brand ?? 'No brand'} · {categoryName(product.categoryId)} · ₹{product.price}
                      {product.originalPrice && ` (was ₹${product.originalPrice})`}
                    </span>
                  </span>
                  <span className={`status-pill ${product.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
                    {product.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="page-head__actions">
                  {canEdit && <ProductDialog categories={categories} product={product} onSave={(input) => save(input, product)} />}
                  {canEdit && (
                    <OutlinedButton onClick={() => toggleStatus(product)}>
                      {product.isActive ? 'Deactivate' : 'Activate'}
                    </OutlinedButton>
                  )}
                  {canDelete && (
                    <OutlinedButton onClick={() => remove(product)}>
                      <Icon slot="icon" aria-hidden="true">delete</Icon>
                      Delete
                    </OutlinedButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const EMPTY_INPUT: ProductInput = { name: '', slug: '', categoryId: '', price: '' };

function ProductDialog({ categories, product, onSave }: { categories: Category[]; product?: Product; onSave: (input: ProductInput) => Promise<void> }) {
  const dialogRef = useRef<MdDialog>(null);
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
    <>
      <OutlinedButton onClick={() => dialogRef.current?.show()}>
        <Icon slot="icon" aria-hidden="true">{product ? 'edit' : 'add'}</Icon>
        {product ? 'Edit' : 'Add product'}
      </OutlinedButton>
      <Dialog ref={dialogRef}>
        <div slot="headline">{product ? 'Edit product' : 'Add product'}</div>
        <div slot="content" className="form-grid">
          <OutlinedTextField label="Name" value={form.name} onInput={(e: Event) => set('name', (e.target as HTMLInputElement).value)} />
          <OutlinedTextField label="Slug" value={form.slug} onInput={(e: Event) => set('slug', (e.target as HTMLInputElement).value)} />
          <OutlinedTextField label="Brand" value={form.brand ?? ''} onInput={(e: Event) => set('brand', (e.target as HTMLInputElement).value)} />

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
    </>
  );
}

export default ProductManagement;
