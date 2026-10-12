import { createElement, useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '@skylabs-monorepo/shared-ui';
import { FilledButton, OutlinedButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import {
  createDeal,
  createVendorTherapist,
  getBranchCategoryAccess,
  getVendor,
  listBranches,
  listVendorDealsForAdmin,
  listVendorTherapistsForAdmin,
  updateDeal,
  type AdminDeal,
  type AdminTherapist,
  type Branch,
  type BranchCategoryAccessRow,
  type DealInput,
  type DealPackageInput,
  type Vendor,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';

interface DealFormPageProps {
  token: string | null;
}

type DrivenChangeEvent = ChangeEvent<HTMLElement & { value: string }>;

/** Raw M3 `<md-outlined-select>` + `<md-select-option>` (not the shared-ui React wrappers) so
 *  tests can drive the field's value and native `change` event directly — same convention as
 *  `BranchFormPage`'s own `renderSelect` (see that file's doc comment: the shared-ui React
 *  wrappers set element state via an imperative property effect that does not run under
 *  Vitest's `@lit/react` resolution). */
function renderSelect({
  label,
  value,
  disabled,
  placeholder,
  options,
  extraOption,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  placeholder: string;
  options: { value: string; label: string }[];
  /** An extra option injected ahead of `options` (e.g. a stale category/subcategory no longer
   *  in the branch's mapping) — kept selectable without being silently cleared. */
  extraOption?: { value: string; label: string };
  onChange: (value: string) => void;
}) {
  return createElement(
    'md-outlined-select',
    { label, value, disabled, onChange: (e: DrivenChangeEvent) => onChange(e.currentTarget.value) },
    [
      createElement('md-select-option', { key: '__placeholder__', value: '' }, createElement('div', { slot: 'headline' }, placeholder)),
      ...(extraOption ? [createElement('md-select-option', { key: extraOption.value }, createElement('div', { slot: 'headline' }, extraOption.label))] : []),
      ...options.map((o) => createElement('md-select-option', { key: o.value, value: o.value }, createElement('div', { slot: 'headline' }, o.label))),
    ],
  );
}

/** Raw M3 `<md-outlined-text-field>` — see `renderSelect`'s doc comment above for why. */
function renderTextField({
  label,
  value,
  required,
  error,
  type,
  rows,
  onInput,
}: {
  label: string;
  value: string;
  required?: boolean;
  error?: boolean;
  type?: string;
  rows?: number;
  onInput: (value: string) => void;
}) {
  return createElement('md-outlined-text-field', {
    label,
    value,
    required,
    error,
    type,
    rows,
    onInput: (e: DrivenChangeEvent) => onInput(e.currentTarget.value),
  });
}

/** Same convention as `BranchFormPage`'s own `vendorDisplayName`. */
function vendorDisplayName(vendor: Vendor): string | null {
  return vendor.businessName || vendor.owner?.name || null;
}

const EMPTY_FORM = {
  branchId: '',
  categoryId: '',
  subcategoryId: '',
  title: '',
  slug: '',
  shortDescription: '',
  description: '',
  notes: '',
  policy: '',
  termsAndConditions: '',
};

/** Add/Edit deal — `/account/vendors/:vendorId/deals/new` and `.../deals/:dealId`. One page,
 *  `sky-accordion` sections: Branch & Category (branch first — category/subcategory options are
 *  scoped to whatever THIS branch has been mapped to, same as `DealDialog` in
 *  `vendor-branches.tsx`), Details, Pricing (the Packages repeater — a Deal's real duration/price
 *  menu, see `DealPackage`'s schema doc comment), Therapists (link existing therapists already on
 *  this branch, or create a new one on the fly, scoped to the same branch).
 *
 *  Adapted from `DealDialog`'s fields rather than extracted into a shared component — same known
 *  dedup opportunity already flagged, not a silent copy, as `BranchFormPage`'s own doc comment.
 *  Renders raw M3 elements (not the shared-ui React wrappers) for the same testability reason
 *  `BranchFormPage` does — see `renderSelect`/`renderTextField` above. */
export function DealFormPage({ token }: DealFormPageProps) {
  const { vendorId, dealId } = useParams<{ vendorId: string; dealId?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(dealId);

  const [vendorName, setVendorName] = useState<string | null>(null);
  const [deal, setDeal] = useState<AdminDeal | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);

  const [form, setForm] = useState(EMPTY_FORM);
  const [packages, setPackages] = useState<DealPackageInput[]>([]);
  const [therapistIds, setTherapistIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Partial<Record<'branchId' | 'title' | 'slug' | 'categoryId' | 'packages', string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [branchCategoryAccess, setBranchCategoryAccess] = useState<BranchCategoryAccessRow[]>([]);
  const [categoryAccessLoading, setCategoryAccessLoading] = useState(false);
  const [categoryAccessError, setCategoryAccessError] = useState('');

  const [allTherapists, setAllTherapists] = useState<AdminTherapist[]>([]);
  const [therapistsLoading, setTherapistsLoading] = useState(true);
  const [newTherapist, setNewTherapist] = useState({ therapistType: '', personName: '' });
  const [creatingTherapist, setCreatingTherapist] = useState(false);
  const [therapistError, setTherapistError] = useState('');

  // Presentational only — feeds the breadcrumb, never blocks the page's own loading state.
  useEffect(() => {
    if (!vendorId) return;
    getVendor(token, vendorId)
      .then(({ data }) => setVendorName(vendorDisplayName(data)))
      .catch(() => setVendorName(null));
  }, [token, vendorId]);

  useEffect(() => {
    if (!vendorId) return;
    setBranchesLoading(true);
    listBranches(token, vendorId)
      .then(({ data }) => setBranches(data))
      .catch(() => setBranches([]))
      .finally(() => setBranchesLoading(false));
  }, [token, vendorId]);

  useEffect(() => {
    if (!vendorId) return;
    setTherapistsLoading(true);
    listVendorTherapistsForAdmin(token, vendorId)
      .then(({ data }) => setAllTherapists(data))
      .catch(() => setAllTherapists([]))
      .finally(() => setTherapistsLoading(false));
  }, [token, vendorId]);

  // No single-deal GET exists (same gap `listDeals`'s own doc comment notes) — load every deal
  // for the vendor and find this one, same `listX` + `find` pattern `BranchFormPage` uses for
  // `listBranches`.
  useEffect(() => {
    if (!isEdit || !vendorId || !dealId) return;
    setLoading(true);
    listVendorDealsForAdmin(token, vendorId)
      .then(({ data }) => {
        const found = data.find((d) => d.id === dealId);
        if (!found) {
          setLoadError('Deal not found.');
          return;
        }
        setDeal(found);
        setForm({
          branchId: found.branchId,
          categoryId: found.categoryId,
          subcategoryId: found.subcategoryId ?? '',
          title: found.title,
          slug: found.slug,
          shortDescription: found.shortDescription ?? '',
          description: found.description ?? '',
          notes: found.notes ?? '',
          policy: found.policy ?? '',
          termsAndConditions: found.termsAndConditions ?? '',
        });
        setPackages(
          (found.packages ?? []).map((p) => ({
            id: p.id,
            durationMinutes: p.durationMinutes,
            sellingPrice: Number(p.sellingPrice),
            originalPrice: p.originalPrice != null ? Number(p.originalPrice) : undefined,
            isActive: p.isActive,
            sortOrder: p.sortOrder,
          })),
        );
        setTherapistIds(new Set((found.therapists ?? []).map((t) => t.id)));
      })
      .catch((err) => setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load this deal.'))
      .finally(() => setLoading(false));
  }, [token, vendorId, dealId, isEdit]);

  // Category/subcategory options are scoped to whatever the selected branch has actually been
  // mapped to (BranchCategoryAccess) — not merely the vendor-wide grant (see DealDialog's own
  // doc comment for the full rationale).
  useEffect(() => {
    if (!vendorId || !form.branchId) {
      setBranchCategoryAccess([]);
      return;
    }
    setCategoryAccessLoading(true);
    setCategoryAccessError('');
    getBranchCategoryAccess(token, vendorId, form.branchId)
      .then(({ data }) => setBranchCategoryAccess(data))
      .catch((err) => {
        setBranchCategoryAccess([]);
        setCategoryAccessError(err instanceof ApiRequestError ? err.message : "Could not load this branch's categories.");
      })
      .finally(() => setCategoryAccessLoading(false));
  }, [token, vendorId, form.branchId]);

  const name = deal?.title || (isEdit ? 'Deal' : 'New deal');
  useSetBreadcrumbs([
    { label: 'Members' },
    { label: 'All Member', to: '/account/vendors' },
    { label: vendorName ?? 'Member', to: `/account/vendors/${vendorId}` },
    { label: 'Deals', to: `/account/vendors/${vendorId}/deals` },
    { label: isEdit ? name : 'Add deal' },
  ]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value, ...(key === 'branchId' ? { categoryId: '', subcategoryId: '' } : {}) }));
    if (key === 'branchId') setTherapistIds(new Set());
    setErrors((e) => (e[key as keyof typeof errors] ? { ...e, [key]: undefined } : e));
  };

  const matchedCategoryRow = branchCategoryAccess.find((row) => row.categoryId === form.categoryId);
  const subcategoryOptions = matchedCategoryRow?.subcategories.map((s) => s.subcategory) ?? [];
  // An existing deal's category/subcategory that's since fallen out of the branch's mapping is
  // never silently cleared — injected as an extra option instead, same as DealDialog.
  const categoryStale = !categoryAccessLoading && Boolean(form.categoryId) && !matchedCategoryRow;
  const staleCategoryName = deal?.category?.name ?? 'Previously selected category';

  const setPackage = (index: number, patch: Partial<DealPackageInput>) =>
    setPackages((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const addPackage = () => setPackages((prev) => [...prev, { durationMinutes: 30, sellingPrice: 0 }]);
  const removePackage = (index: number) => setPackages((prev) => prev.filter((_, i) => i !== index));

  const branchTherapists = useMemo(() => allTherapists.filter((t) => t.branchId === form.branchId), [allTherapists, form.branchId]);
  const toggleTherapist = (id: string) =>
    setTherapistIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addTherapist = async () => {
    if (!vendorId || !form.branchId || !newTherapist.therapistType.trim() || !newTherapist.personName.trim()) {
      setTherapistError('Enter both a type and a name.');
      return;
    }
    setCreatingTherapist(true);
    setTherapistError('');
    try {
      const { data } = await createVendorTherapist(token, vendorId, form.branchId, {
        therapistType: newTherapist.therapistType.trim(),
        personName: newTherapist.personName.trim(),
      });
      setAllTherapists((prev) => [...prev, data as AdminTherapist]);
      setTherapistIds((prev) => new Set(prev).add(data.id));
      setNewTherapist({ therapistType: '', personName: '' });
    } catch (err) {
      setTherapistError(err instanceof ApiRequestError ? err.message : 'Could not add this therapist.');
    } finally {
      setCreatingTherapist(false);
    }
  };

  const save = useCallback(async () => {
    if (!vendorId) return;
    const nextErrors: typeof errors = {
      branchId: form.branchId ? undefined : 'Select a branch.',
      title: form.title.trim() ? undefined : 'Title is required.',
      slug: form.slug.trim() ? undefined : 'Slug is required.',
      categoryId: form.categoryId ? undefined : 'Select a category.',
      packages: packages.length > 0 ? undefined : 'At least one package (duration + price) is required.',
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      setSaveError('Fix the highlighted fields before saving.');
      return;
    }
    for (const p of packages) {
      if (!p.durationMinutes || p.durationMinutes <= 0) {
        setSaveError('Every package needs a duration greater than 0.');
        return;
      }
      if (p.sellingPrice == null || p.sellingPrice < 0) {
        setSaveError('Every package needs a selling price of 0 or more.');
        return;
      }
      if (p.originalPrice !== undefined && p.originalPrice < p.sellingPrice) {
        setSaveError("Each package's original price must be greater than or equal to its selling price.");
        return;
      }
    }

    setSaving(true);
    setSaveError('');
    try {
      // The Deal's own originalPrice/salePrice/durationMinutes are a synced "from price"/
      // default-duration display cache (see DealPackage's schema doc comment); the server
      // re-syncs them to the cheapest active package right after save regardless, but the
      // create/update schema still requires some value up front.
      const cheapest = packages.reduce((min, p) => (p.sellingPrice < min.sellingPrice ? p : min), packages[0]);
      const input: DealInput = {
        categoryId: form.categoryId,
        subcategoryId: form.subcategoryId || undefined,
        title: form.title,
        slug: form.slug,
        shortDescription: form.shortDescription || undefined,
        description: form.description || undefined,
        notes: form.notes || undefined,
        policy: form.policy || undefined,
        termsAndConditions: form.termsAndConditions || undefined,
        durationMinutes: cheapest.durationMinutes,
        salePrice: String(cheapest.sellingPrice),
        originalPrice: String(cheapest.originalPrice ?? cheapest.sellingPrice),
        packages,
        therapistIds: [...therapistIds],
      };
      const saved =
        isEdit && dealId && deal
          ? (await updateDeal(token, vendorId, deal.branchId, dealId, input)).data
          : (await createDeal(token, vendorId, form.branchId, input)).data;
      navigate(`/account/vendors/${vendorId}/deals/${saved.id}`, { replace: true });
    } catch (err) {
      setSaveError(err instanceof ApiRequestError ? err.message : 'Could not save this deal.');
    } finally {
      setSaving(false);
    }
  }, [vendorId, dealId, deal, isEdit, form, packages, therapistIds, token, navigate]);

  if (loading) return <p className="loading-state">Loading deal…</p>;
  if (loadError) return <p className="error-state" role="alert">{loadError}</p>;

  const branchChosen = Boolean(form.branchId);

  return (
    <div className="admin-page">
      <title>{`${isEdit ? 'Edit' : 'Add'} deal · MSD`}</title>
      <header className="page-head">
        <h1>{isEdit ? 'Edit deal' : 'Add deal'}</h1>
      </header>

      {saveError && <p className="error-state" role="alert">{saveError}</p>}

      <sky-accordion>
        <sky-accordion-item header="Branch & Category" open>
          <div className="form-grid">
            {isEdit ? (
              <p className="field-hint">Branch: {branches.find((b) => b.id === form.branchId)?.name ?? deal?.branch.name ?? '—'} (cannot be changed)</p>
            ) : (
              renderSelect({
                label: 'Branch',
                value: form.branchId,
                disabled: branchesLoading,
                placeholder: branchesLoading ? 'Loading branches…' : 'Select a branch',
                options: branches.map((b) => ({ value: b.id, label: b.name })),
                onChange: (value) => set('branchId', value),
              })
            )}
            {errors.branchId && <p className="error-state" role="alert">{errors.branchId}</p>}
            {!branchChosen && <p className="field-hint">Pick a branch to choose a category.</p>}

            {branchChosen && (
              <>
                {renderSelect({
                  label: 'Category',
                  value: form.categoryId,
                  disabled: categoryAccessLoading,
                  placeholder: categoryAccessLoading ? 'Loading categories…' : 'Select a category',
                  options: branchCategoryAccess.map((row) => ({ value: row.categoryId, label: row.category.name })),
                  extraOption: categoryStale ? { value: form.categoryId, label: staleCategoryName } : undefined,
                  onChange: (value) => set('categoryId', value),
                })}
                {errors.categoryId && <p className="error-state" role="alert">{errors.categoryId}</p>}
                {categoryAccessError && <p className="error-state" role="alert">{categoryAccessError}</p>}
                {!categoryAccessLoading && !categoryAccessError && branchCategoryAccess.length === 0 && !categoryStale && (
                  <p className="empty-state">No categories are mapped to this branch yet — map one from the branch's Category Access.</p>
                )}

                {subcategoryOptions.length > 0 &&
                  renderSelect({
                    label: 'Subcategory (optional)',
                    value: form.subcategoryId,
                    placeholder: 'None',
                    options: subcategoryOptions.map((c) => ({ value: c.id, label: c.name })),
                    onChange: (value) => set('subcategoryId', value),
                  })}
              </>
            )}
          </div>
        </sky-accordion-item>

        <sky-accordion-item header="Details" disabled={!branchChosen}>
          <div className="form-grid">
            {renderTextField({ label: 'Title', required: true, value: form.title, error: Boolean(errors.title), onInput: (value) => set('title', value) })}
            {errors.title && <p className="error-state" role="alert">{errors.title}</p>}
            {renderTextField({ label: 'Slug', required: true, value: form.slug, error: Boolean(errors.slug), onInput: (value) => set('slug', value) })}
            {errors.slug && <p className="error-state" role="alert">{errors.slug}</p>}
            {renderTextField({ label: 'Short description', value: form.shortDescription, onInput: (value) => set('shortDescription', value) })}
            {renderTextField({ label: 'Description', type: 'textarea', rows: 4, value: form.description, onInput: (value) => set('description', value) })}
            {renderTextField({ label: 'Notes', type: 'textarea', rows: 3, value: form.notes, onInput: (value) => set('notes', value) })}
            {renderTextField({ label: 'Policy', type: 'textarea', rows: 3, value: form.policy, onInput: (value) => set('policy', value) })}
            {renderTextField({ label: 'Terms & Conditions', type: 'textarea', rows: 3, value: form.termsAndConditions, onInput: (value) => set('termsAndConditions', value) })}
          </div>
        </sky-accordion-item>

        <sky-accordion-item header="Pricing" disabled={!branchChosen}>
          <div className="form-grid">
            <p className="field-hint">Every duration/price option a customer can select — at least one is required. For example: 30 Min → ₹999, 60 Min → ₹1,499.</p>
            {errors.packages && <p className="error-state" role="alert">{errors.packages}</p>}
            {packages.map((pkg, i) => (
              <div className="form-grid" key={pkg.id ?? `new-${i}`}>
                {renderTextField({
                  label: 'Duration (minutes)',
                  type: 'number',
                  value: pkg.durationMinutes ? String(pkg.durationMinutes) : '',
                  onInput: (value) => setPackage(i, { durationMinutes: Number(value) || 0 }),
                })}
                {renderTextField({
                  label: 'Selling price',
                  type: 'number',
                  value: pkg.sellingPrice ? String(pkg.sellingPrice) : '',
                  onInput: (value) => setPackage(i, { sellingPrice: Number(value) || 0 }),
                })}
                {renderTextField({
                  label: 'Original price (optional)',
                  type: 'number',
                  value: pkg.originalPrice !== undefined ? String(pkg.originalPrice) : '',
                  onInput: (value) => setPackage(i, { originalPrice: Number(value) || undefined }),
                })}
                <OutlinedButton onClick={() => removePackage(i)}>
                  <Icon slot="icon" aria-hidden="true">delete</Icon>
                  Remove
                </OutlinedButton>
              </div>
            ))}
            <OutlinedButton onClick={addPackage}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add package
            </OutlinedButton>
          </div>
        </sky-accordion-item>

        <sky-accordion-item header="Therapists" disabled={!branchChosen}>
          <div className="form-grid">
            <p className="field-hint">Link the therapist(s) who perform this deal — pick from this branch's existing therapists, or add a new one.</p>
            {therapistsLoading ? (
              <p className="loading-state">Loading therapists…</p>
            ) : branchTherapists.length === 0 ? (
              <p className="empty-state">No therapists on this branch yet — add one below.</p>
            ) : (
              <div className="category-grant-grid">
                {branchTherapists.map((t) => (
                  <label key={t.id} className="category-grant-grid__option">
                    <input type="checkbox" checked={therapistIds.has(t.id)} onChange={() => toggleTherapist(t.id)} />
                    {t.personName} · {t.therapistType}
                  </label>
                ))}
              </div>
            )}

            <fieldset>
              <legend>Add a new therapist to this branch</legend>
              <div className="form-grid">
                {renderTextField({
                  label: 'Type (e.g. Massage Therapist)',
                  value: newTherapist.therapistType,
                  onInput: (value) => setNewTherapist((f) => ({ ...f, therapistType: value })),
                })}
                {renderTextField({
                  label: 'Name',
                  value: newTherapist.personName,
                  onInput: (value) => setNewTherapist((f) => ({ ...f, personName: value })),
                })}
                <OutlinedButton disabled={creatingTherapist} onClick={addTherapist}>
                  <Icon slot="icon" aria-hidden="true">add</Icon>
                  {creatingTherapist ? 'Adding…' : 'Add therapist'}
                </OutlinedButton>
              </div>
              {therapistError && <p className="error-state" role="alert">{therapistError}</p>}
            </fieldset>
          </div>
        </sky-accordion-item>
      </sky-accordion>

      <div className="form-actions">
        <FilledButton disabled={saving || !branchChosen} onClick={() => save()}>
          {saving ? 'Saving…' : 'Save'}
        </FilledButton>
      </div>
    </div>
  );
}

export default DealFormPage;
