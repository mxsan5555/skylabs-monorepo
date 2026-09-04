import { useEffect, useRef, useState, type RefObject } from 'react';
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
import {
  createVendorProduct,
  deleteVendorProduct,
  listVendorProducts,
  setVendorProductStatus,
  updateVendorProduct,
  type Category,
  type VendorProduct,
  type VendorProductInput,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { MediaUploader } from '../../../components/media-uploader';
import { resolveCategoryTiers } from '../../../../utils/category-tree';

interface VendorProductsStepProps {
  token: string | null;
  vendorId: string;
  canEdit: boolean;
  offersProduct: boolean;
  /** The vendor's granted PRODUCT categories. */
  categories: Category[];
  onProductsChange: (products: VendorProduct[]) => void;
}

/**
 * Onboarding wizard Step 5 — Product CRUD, adapted from the (now-retired) global admin
 * `products.tsx`'s `ProductFormDialog` field shape but pointed at the admin-on-behalf
 * vendor-scoped routes (`/vendors/:vendorId/products...`) instead of the old global `/products`
 * CRUD — Product became vendor-owned in the direct-category-access migration (see
 * `product.service.ts`). Category dropdown restricted to `categories` (this vendor's granted
 * PRODUCT categories only).
 */
export function VendorProductsStep({ token, vendorId, canEdit, offersProduct, categories, onProductsChange }: VendorProductsStepProps) {
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingProduct, setEditingProduct] = useState<VendorProduct | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await listVendorProducts(token, vendorId, { pageSize: 100 });
      setProducts(data);
      onProductsChange(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, vendorId]);

  const save = async (input: VendorProductInput, existing?: VendorProduct) => {
    const { data } = existing
      ? await updateVendorProduct(token, vendorId, existing.id, input)
      : await createVendorProduct(token, vendorId, input);
    await load();
    return data;
  };

  const toggleStatus = async (product: VendorProduct) => {
    setError('');
    try {
      await setVendorProductStatus(token, vendorId, product.id, !product.isActive);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change status.');
    }
  };

  const remove = async (product: VendorProduct) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteVendorProduct(token, vendorId, product.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete product.');
    }
  };

  if (!offersProduct) {
    return <p className="empty-state">This vendor has not enabled the Product business module in Step 2.</p>;
  }

  const canAdd = canEdit && categories.length > 0;

  return (
    <section aria-label="Products">
      <div className="page-head">
        <h3 className="section-title">Products</h3>
        {canAdd && (
          <OutlinedButton onClick={() => addDialogRef.current?.show()}>
            <Icon slot="icon" aria-hidden="true">add</Icon>
            Add product
          </OutlinedButton>
        )}
      </div>

      {error && <p className="error-state" role="alert">{error}</p>}
      {canEdit && categories.length === 0 && (
        <p className="empty-state">Grant this business at least one Product category in Step 2 before adding products.</p>
      )}

      {loading ? (
        <p className="loading-state">Loading products…</p>
      ) : products.length === 0 ? (
        <p className="empty-state">No products yet.</p>
      ) : (
        <ul className="entity-list">
          {products.map((product) => (
            <li key={product.id}>
              <div className="entity-list__item">
                <span className="role-list__name">
                  {product.name}
                  <span className="field-hint"> · ₹{product.price}{product.brand ? ` · ${product.brand}` : ''}</span>
                </span>
                <span className={`status-pill ${product.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
                  {product.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {canEdit && (
                <div className="page-head__actions">
                  <OutlinedButton
                    onClick={() => {
                      setEditingProduct(product);
                      editDialogRef.current?.show();
                    }}
                  >
                    <Icon slot="icon" aria-hidden="true">edit</Icon>
                    Edit
                  </OutlinedButton>
                  <OutlinedButton onClick={() => toggleStatus(product)}>
                    {product.isActive ? 'Deactivate' : 'Activate'}
                  </OutlinedButton>
                  <OutlinedButton onClick={() => remove(product)}>
                    <Icon slot="icon" aria-hidden="true">delete</Icon>
                    Delete
                  </OutlinedButton>
                </div>
              )}
            </li>
          ))}
        </ul>
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
    </section>
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
  // Tracks the entity MediaUploader should upload against — see DealDialog's identical
  // `savedDeal` state for the full staged-upload-after-create rationale.
  const [savedProduct, setSavedProduct] = useState<VendorProduct | undefined>(product);

  const parentCategories = categories.filter((c) => !c.parentId);
  // `subcategoryTierId`/`selectedTypeId` split apart whatever `form.subcategoryId` currently
  // holds (a Subcategory OR a Type-tier id) — see `resolveCategoryTiers`'s doc comment.
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

        {/* 3rd, Type tier (e.g. "Swedish Massage" under "Body Massage") — optional, only shown
            once the chosen Subcategory actually has children; one with none (e.g. "Cleaning")
            skips straight to using it as-is, unchanged from before. Picking a Type here becomes
            the Product's own `subcategoryId` (see `resolveCategoryTiers`'s doc comment). */}
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

export default VendorProductsStep;
