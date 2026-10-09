import { createElement, useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '@skylabs-monorepo/shared-ui';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import {
  createVendorProduct,
  getVendor,
  listCategories,
  listVendorProducts,
  updateVendorProduct,
  type Category,
  type Vendor,
  type VendorProduct,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { resolveCategoryTiers } from '../../../../utils/category-tree';

interface ProductFormPageProps {
  token: string | null;
}

type DrivenChangeEvent = ChangeEvent<HTMLElement & { value: string }>;

/** Raw M3 elements — see `BranchFormPage`/`DealFormPage`/`TherapistFormPage`'s own doc comments
 *  for why: the shared-ui React wrappers set element state via an imperative property effect
 *  that does not run under Vitest's `@lit/react` resolution. */
function renderSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return createElement(
    'md-outlined-select',
    { label, value, onChange: (e: DrivenChangeEvent) => onChange(e.currentTarget.value) },
    [
      createElement('md-select-option', { key: '__placeholder__', value: '' }, createElement('div', { slot: 'headline' }, placeholder)),
      ...options.map((o) => createElement('md-select-option', { key: o.value, value: o.value }, createElement('div', { slot: 'headline' }, o.label))),
    ],
  );
}

function renderTextField({
  label,
  value,
  required,
  type,
  onInput,
}: {
  label: string;
  value: string;
  required?: boolean;
  type?: string;
  onInput: (value: string) => void;
}) {
  return createElement('md-outlined-text-field', {
    label,
    value,
    required,
    type,
    onInput: (e: DrivenChangeEvent) => onInput(e.currentTarget.value),
  });
}

/** Same convention as `BranchFormPage`/`DealFormPage`/`TherapistFormPage`'s own `vendorDisplayName`. */
function vendorDisplayName(vendor: Vendor): string | null {
  return vendor.businessName || vendor.owner?.name || null;
}

const EMPTY_FORM = {
  categoryId: '',
  subcategoryId: '',
  name: '',
  slug: '',
  brand: '',
  price: '',
  originalPrice: '',
  discount: '',
  badge: '',
  summary: '',
  description: '',
  ingredients: '',
  returnPolicy: '',
  isNew: false,
  isFeatured: false,
};

/** Add/Edit product — `/account/vendors/:vendorId/products/new` and `.../products/:productId`.
 *  Product is vendor-level, never branch-scoped (see msd-api's Product schema doc comment), so
 *  unlike `DealFormPage`/`TherapistFormPage` there is no branch step at all — the Category picker
 *  is scoped to the vendor's own granted PRODUCT categories (`listCategories({type:'PRODUCT',
 *  vendorId})`), with the same Category → Subcategory → (optional) Type cascade the self-service
 *  `ProductFormDialog` in `vendor-products.tsx` already uses, via the shared `resolveCategoryTiers`
 *  helper (reused here rather than re-derived).
 *
 *  Adapted from `ProductFormDialog`'s fields rather than extracted into a shared component — same
 *  known dedup opportunity already flagged for `BranchFormPage`/`DealFormPage`/`TherapistFormPage`.
 *  Renders raw M3 elements for the same testability reason those three pages do. */
export function ProductFormPage({ token }: ProductFormPageProps) {
  const { vendorId, productId } = useParams<{ vendorId: string; productId?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(productId);

  const [vendorName, setVendorName] = useState<string | null>(null);
  const [product, setProduct] = useState<VendorProduct | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<'name' | 'slug' | 'categoryId' | 'price', string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Presentational only — feeds the breadcrumb, never blocks the page's own loading state.
  useEffect(() => {
    if (!vendorId) return;
    getVendor(token, vendorId)
      .then(({ data }) => setVendorName(vendorDisplayName(data)))
      .catch(() => setVendorName(null));
  }, [token, vendorId]);

  useEffect(() => {
    if (!vendorId) return;
    setCategoriesLoading(true);
    listCategories(token, { type: 'PRODUCT', vendorId })
      .then(({ data }) => setCategories(data))
      .catch(() => setCategories([]))
      .finally(() => setCategoriesLoading(false));
  }, [token, vendorId]);

  // No single-product GET exists — load the vendor's products (capped at the server's own
  // pagination ceiling, same `pageSize: 100` workaround `vendor-products.tsx`'s self-service
  // page already uses) and find this one, same `listX` + `find` pattern the other entity form
  // pages use.
  useEffect(() => {
    if (!isEdit || !vendorId || !productId) return;
    setLoading(true);
    listVendorProducts(token, vendorId, { pageSize: 100 })
      .then(({ data }) => {
        const found = data.find((p) => p.id === productId);
        if (!found) {
          setLoadError('Product not found.');
          return;
        }
        setProduct(found);
        setForm({
          categoryId: found.categoryId,
          subcategoryId: found.subcategoryId ?? '',
          name: found.name,
          slug: found.slug,
          brand: found.brand ?? '',
          price: found.price,
          originalPrice: found.originalPrice ?? '',
          discount: found.discount != null ? String(found.discount) : '',
          badge: found.badge ?? '',
          summary: found.summary ?? '',
          description: found.description ?? '',
          ingredients: found.ingredients ?? '',
          returnPolicy: found.returnPolicy ?? '',
          isNew: found.isNew,
          isFeatured: found.isFeatured,
        });
      })
      .catch((err) => setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load this product.'))
      .finally(() => setLoading(false));
  }, [token, vendorId, productId, isEdit]);

  const name = product?.name || (isEdit ? 'Product' : 'New product');
  useSetBreadcrumbs([
    { label: 'Members' },
    { label: 'All Member', to: '/account/vendors' },
    { label: vendorName ?? 'Member', to: `/account/vendors/${vendorId}` },
    { label: 'Products', to: `/account/vendors/${vendorId}/products` },
    { label: isEdit ? name : 'Add product' },
  ]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key as keyof typeof errors] ? { ...e, [key]: undefined } : e));
  };

  const parentCategories = categories.filter((c) => !c.parentId);
  const { subcategoryOptions, typeOptions, subcategoryTierId, selectedTypeId } = resolveCategoryTiers(
    categories,
    form.categoryId,
    form.subcategoryId || undefined,
  );

  const save = useCallback(async () => {
    if (!vendorId) return;
    const nextErrors: typeof errors = {
      name: form.name.trim() ? undefined : 'Name is required.',
      slug: form.slug.trim() ? undefined : 'Slug is required.',
      categoryId: form.categoryId ? undefined : 'Select a category.',
      price: form.price.trim() ? undefined : 'Price is required.',
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      setSaveError('Fix the highlighted fields before saving.');
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const input = {
        categoryId: form.categoryId,
        subcategoryId: form.subcategoryId || undefined,
        name: form.name,
        slug: form.slug,
        brand: form.brand || undefined,
        price: form.price,
        originalPrice: form.originalPrice || undefined,
        discount: form.discount ? Number(form.discount) : undefined,
        badge: form.badge || undefined,
        summary: form.summary || undefined,
        description: form.description || undefined,
        ingredients: form.ingredients || undefined,
        returnPolicy: form.returnPolicy || undefined,
        isNew: form.isNew,
        isFeatured: form.isFeatured,
      };
      const saved =
        isEdit && productId
          ? (await updateVendorProduct(token, vendorId, productId, input)).data
          : (await createVendorProduct(token, vendorId, input)).data;
      navigate(`/account/vendors/${vendorId}/products/${saved.id}`, { replace: true });
    } catch (err) {
      setSaveError(err instanceof ApiRequestError ? err.message : 'Could not save this product.');
    } finally {
      setSaving(false);
    }
  }, [vendorId, productId, isEdit, form, token, navigate]);

  if (loading) return <p className="loading-state">Loading product…</p>;
  if (loadError) return <p className="error-state" role="alert">{loadError}</p>;

  return (
    <div className="admin-page">
      <title>{`${isEdit ? 'Edit' : 'Add'} product · MSD`}</title>
      <header className="page-head">
        <h1>{isEdit ? 'Edit product' : 'Add product'}</h1>
      </header>

      {saveError && <p className="error-state" role="alert">{saveError}</p>}

      <div className="form-grid">
        {categoriesLoading ? (
          <p className="loading-state">Loading categories…</p>
        ) : parentCategories.length === 0 ? (
          <p className="empty-state">This business has not been granted a Product category yet — grant one under Business Modules &amp; Category Access first.</p>
        ) : (
          renderSelect({
            label: 'Category',
            value: form.categoryId,
            placeholder: 'Select a category',
            options: parentCategories.map((c) => ({ value: c.id, label: c.name })),
            onChange: (value) => set('categoryId', value),
          })
        )}
        {errors.categoryId && <p className="error-state" role="alert">{errors.categoryId}</p>}

        {subcategoryOptions.length > 0 &&
          renderSelect({
            label: 'Subcategory (optional)',
            value: subcategoryTierId ?? '',
            placeholder: 'None',
            options: subcategoryOptions.map((c) => ({ value: c.id, label: c.name })),
            onChange: (value) => set('subcategoryId', value),
          })}

        {typeOptions.length > 0 &&
          renderSelect({
            label: 'Type (optional)',
            value: selectedTypeId ?? '',
            placeholder: 'None',
            options: typeOptions.map((c) => ({ value: c.id, label: c.name })),
            onChange: (value) => set('subcategoryId', value || (subcategoryTierId ?? '')),
          })}

        {renderTextField({ label: 'Name', required: true, value: form.name, onInput: (value) => set('name', value) })}
        {errors.name && <p className="error-state" role="alert">{errors.name}</p>}
        {renderTextField({ label: 'Slug', required: true, value: form.slug, onInput: (value) => set('slug', value) })}
        {errors.slug && <p className="error-state" role="alert">{errors.slug}</p>}
        {renderTextField({ label: 'Brand', value: form.brand, onInput: (value) => set('brand', value) })}

        {renderTextField({ label: 'Price', required: true, value: form.price, onInput: (value) => set('price', value) })}
        {errors.price && <p className="error-state" role="alert">{errors.price}</p>}
        {renderTextField({ label: 'Original price', value: form.originalPrice, onInput: (value) => set('originalPrice', value) })}
        {renderTextField({ label: 'Discount %', type: 'number', value: form.discount, onInput: (value) => set('discount', value) })}
        {renderTextField({ label: 'Badge', value: form.badge, onInput: (value) => set('badge', value) })}

        {renderTextField({ label: 'Summary', value: form.summary, onInput: (value) => set('summary', value) })}
        {renderTextField({ label: 'Description', value: form.description, onInput: (value) => set('description', value) })}
        {renderTextField({ label: 'Ingredients', value: form.ingredients, onInput: (value) => set('ingredients', value) })}
        {renderTextField({ label: 'Return policy', value: form.returnPolicy, onInput: (value) => set('returnPolicy', value) })}

        <label className="category-grant-grid__option">
          <input type="checkbox" checked={form.isNew} onChange={(e) => set('isNew', e.target.checked)} />
          New
        </label>
        <label className="category-grant-grid__option">
          <input type="checkbox" checked={form.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} />
          Featured
        </label>
      </div>

      <div className="form-actions">
        <FilledButton disabled={saving} onClick={() => save()}>
          {saving ? 'Saving…' : 'Save'}
        </FilledButton>
      </div>
    </div>
  );
}

export default ProductFormPage;
