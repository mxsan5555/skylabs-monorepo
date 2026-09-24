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
import { useConfirmDialog } from '../../../components/confirm-dialog';
import { resolveCategoryTiers } from '../../../../utils/category-tree';
import { extractFieldErrors } from '../../../../utils/field-errors';

type ProductFieldKey =
  | 'categoryId'
  | 'subcategoryId'
  | 'name'
  | 'slug'
  | 'brand'
  | 'price'
  | 'originalPrice'
  | 'discount'
  | 'badge'
  | 'summary'
  | 'description'
  | 'ingredients'
  | 'returnPolicy';

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
  const { confirm, ConfirmDialog } = useConfirmDialog();
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
    if (!(await confirm(`Delete "${product.name}"? This cannot be undone.`))) return;
    setError('');
    try {
      await deleteVendorProduct(token, vendorId, product.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete product.');
    }
  };

  // `vendor.offersProduct` is a denormalized convenience flag, not the ground truth — the
  // vendor's real `VendorCategoryAccess` grants are (`categories` above is already scoped to
  // exactly those). It can be `false` while the vendor already genuinely holds granted PRODUCT
  // categories (e.g. data mapped outside the normal grant-flips-the-flag save path), which used
  // to hard-block this whole step with a misleading "not enabled" message despite valid access
  // existing — mirrors the identical Therapy-step bug/fix in `vendor-wizard-therapists.tsx`.
  if (!offersProduct && categories.length === 0) {
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
      {ConfirmDialog}
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
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProductFieldKey, string>> | null>(null);
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
    setFieldErrors(null);
    try {
      const result = await onSave(form);
      if (!product && result) {
        setSavedProduct(result);
      } else {
        dialogRef.current?.close();
      }
    } catch (err) {
      const fields = extractFieldErrors<ProductFieldKey>(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not save product.');
      }
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
          error={Boolean(fieldErrors?.categoryId)}
        >
          {parentCategories.map((c) => (
            <SelectOption key={c.id} value={c.id}>
              <div slot="headline">{c.name}</div>
            </SelectOption>
          ))}
        </OutlinedSelect>
        {fieldErrors?.categoryId && <p className="error-state" role="alert">{fieldErrors.categoryId}</p>}

        {subcategoryOptions.length > 0 && (
          <OutlinedSelect
            label="Subcategory (optional)"
            value={subcategoryTierId ?? ''}
            onChange={(e: Event) => set('subcategoryId', (e.target as HTMLSelectElement).value || undefined)}
            error={Boolean(fieldErrors?.subcategoryId)}
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
        {fieldErrors?.subcategoryId && <p className="error-state" role="alert">{fieldErrors.subcategoryId}</p>}

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

        <OutlinedTextField label="Name" required value={form.name} onInput={(e: Event) => set('name', (e.target as HTMLInputElement).value)} error={Boolean(fieldErrors?.name)} />
        {fieldErrors?.name && <p className="error-state" role="alert">{fieldErrors.name}</p>}
        <OutlinedTextField label="Slug" required value={form.slug} onInput={(e: Event) => set('slug', (e.target as HTMLInputElement).value)} error={Boolean(fieldErrors?.slug)} />
        {fieldErrors?.slug && <p className="error-state" role="alert">{fieldErrors.slug}</p>}
        <OutlinedTextField label="Brand" value={form.brand ?? ''} onInput={(e: Event) => set('brand', (e.target as HTMLInputElement).value)} error={Boolean(fieldErrors?.brand)} />
        {fieldErrors?.brand && <p className="error-state" role="alert">{fieldErrors.brand}</p>}

        <OutlinedTextField label="Price" required value={form.price} onInput={(e: Event) => set('price', (e.target as HTMLInputElement).value)} error={Boolean(fieldErrors?.price)} />
        {fieldErrors?.price && <p className="error-state" role="alert">{fieldErrors.price}</p>}
        <OutlinedTextField label="Original price" value={form.originalPrice ?? ''} onInput={(e: Event) => set('originalPrice', (e.target as HTMLInputElement).value)} error={Boolean(fieldErrors?.originalPrice)} />
        {fieldErrors?.originalPrice && <p className="error-state" role="alert">{fieldErrors.originalPrice}</p>}
        <OutlinedTextField
          label="Discount %"
          type="number"
          value={form.discount !== undefined ? String(form.discount) : ''}
          onInput={(e: Event) => set('discount', Number((e.target as HTMLInputElement).value) || undefined)}
          error={Boolean(fieldErrors?.discount)}
        />
        {fieldErrors?.discount && <p className="error-state" role="alert">{fieldErrors.discount}</p>}
        <OutlinedTextField label="Badge" value={form.badge ?? ''} onInput={(e: Event) => set('badge', (e.target as HTMLInputElement).value)} error={Boolean(fieldErrors?.badge)} />
        {fieldErrors?.badge && <p className="error-state" role="alert">{fieldErrors.badge}</p>}

        <OutlinedTextField label="Summary" value={form.summary ?? ''} onInput={(e: Event) => set('summary', (e.target as HTMLInputElement).value)} error={Boolean(fieldErrors?.summary)} />
        {fieldErrors?.summary && <p className="error-state" role="alert">{fieldErrors.summary}</p>}
        <OutlinedTextField label="Description" value={form.description ?? ''} onInput={(e: Event) => set('description', (e.target as HTMLInputElement).value)} error={Boolean(fieldErrors?.description)} />
        {fieldErrors?.description && <p className="error-state" role="alert">{fieldErrors.description}</p>}
        <OutlinedTextField label="Ingredients" value={form.ingredients ?? ''} onInput={(e: Event) => set('ingredients', (e.target as HTMLInputElement).value)} error={Boolean(fieldErrors?.ingredients)} />
        {fieldErrors?.ingredients && <p className="error-state" role="alert">{fieldErrors.ingredients}</p>}
        <OutlinedTextField label="Return policy" value={form.returnPolicy ?? ''} onInput={(e: Event) => set('returnPolicy', (e.target as HTMLInputElement).value)} error={Boolean(fieldErrors?.returnPolicy)} />
        {fieldErrors?.returnPolicy && <p className="error-state" role="alert">{fieldErrors.returnPolicy}</p>}

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
