import { createElement, useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '@skylabs-monorepo/shared-ui';
import {
  createBranch,
  getBranchCategoryAccess,
  listBranches,
  listCategories,
  setBranchCategoryAccess,
  updateBranch,
  type Branch,
  type BranchInput,
  type Category,
  type OpeningHours,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { STATES, citiesForState } from '../../../../data/india-locations';
import { normalizeOpeningHours, OpeningHoursEditor, validateBranchPincode, validateMapLocationUrl } from './vendor-branches';

interface BranchFormPageProps {
  token: string | null;
}

type DrivenChangeEvent = ChangeEvent<HTMLElement & { value: string }>;

/** Raw M3 `<md-outlined-select>` + `<md-select-option>` (not the shared-ui React wrappers) so
 *  tests can drive the field's `disabled` state and its native `change` event directly — same
 *  convention as `PriceRangeField`/`CheckboxFacet` (see those files' own doc comments: the
 *  shared-ui React wrappers set element state via an imperative property effect that does not
 *  run under Vitest's `@lit/react` resolution). */
function renderSelect({
  label,
  value,
  disabled,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  placeholder: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return createElement(
    'md-outlined-select',
    { label, value, disabled, onChange: (e: DrivenChangeEvent) => onChange(e.currentTarget.value) },
    [
      createElement('md-select-option', { key: '__placeholder__', value: '' }, createElement('div', { slot: 'headline' }, placeholder)),
      ...options.map((option) => createElement('md-select-option', { key: option, value: option }, createElement('div', { slot: 'headline' }, option))),
    ],
  );
}

/** Raw M3 `<md-outlined-text-field>` — see `renderSelect`'s doc comment above for why. */
function renderTextField({
  label,
  value,
  disabled,
  required,
  error,
  type,
  placeholder,
  inputmode,
  maxlength,
  onInput,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  required?: boolean;
  error?: boolean;
  type?: string;
  placeholder?: string;
  inputmode?: string;
  maxlength?: number;
  onInput: (value: string) => void;
}) {
  return createElement('md-outlined-text-field', {
    label,
    value,
    disabled,
    required,
    error,
    type,
    placeholder,
    inputmode,
    maxlength,
    onInput: (e: DrivenChangeEvent) => onInput(e.currentTarget.value),
  });
}

/** Add/Edit branch — `/account/vendors/:vendorId/branches/new` and `.../branches/:branchId`.
 *  One page, `sky-accordion` sections: Location (State first — every other field starts
 *  disabled until a state is picked), Opening Hours, Category Access (admin-only).
 *
 *  The Category Access checkbox tree below is adapted from `BranchDialog` in `vendor-branches.tsx`
 *  rather than extracted into a shared component — flagged as a known dedup opportunity, not a
 *  silent copy, same tradeoff already accepted for self-service in the design spec (see that
 *  file's "Out of scope" section). */
export function BranchFormPage({ token }: BranchFormPageProps) {
  const { vendorId, branchId } = useParams<{ vendorId: string; branchId?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(branchId);

  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');

  const [form, setForm] = useState({ name: '', address: '', city: '', state: '', pincode: '', mapLocationUrl: '' });
  const [openingHours, setOpeningHours] = useState<OpeningHours>({});
  const [errors, setErrors] = useState<Partial<Record<'name' | 'pincode' | 'mapLocationUrl', string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryMap, setCategoryMap] = useState<Map<string, Set<string>>>(new Map());
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState('');

  useEffect(() => {
    if (!isEdit || !vendorId || !branchId) return;
    setLoading(true);
    listBranches(token, vendorId)
      .then(({ data }) => {
        const found = data.find((b) => b.id === branchId);
        if (!found) {
          setLoadError('Branch not found.');
          return;
        }
        setBranch(found);
        setForm({
          name: found.name,
          address: found.address ?? '',
          city: found.city ?? '',
          state: found.state ?? '',
          pincode: found.pincode ?? '',
          mapLocationUrl: found.mapLocationUrl ?? '',
        });
        setOpeningHours(normalizeOpeningHours(found.openingHours));
      })
      .catch((err) => setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load this branch.'))
      .finally(() => setLoading(false));
  }, [token, vendorId, branchId, isEdit]);

  useEffect(() => {
    if (!vendorId) return;
    setCategoriesLoading(true);
    setCategoriesError('');
    Promise.all([
      listCategories(token, { type: 'SERVICE' }),
      listCategories(token, { type: 'THERAPY' }),
      isEdit && branchId ? getBranchCategoryAccess(token, vendorId, branchId).then((r) => r.data) : Promise.resolve(null),
    ])
      .then(([svc, thr, access]) => {
        setCategories([...svc.data, ...thr.data]);
        if (access) {
          const next = new Map<string, Set<string>>();
          access.forEach((row) => next.set(row.categoryId, new Set(row.subcategories.map((s) => s.subcategoryId))));
          setCategoryMap(next);
        }
      })
      .catch((err) => setCategoriesError(err instanceof ApiRequestError ? err.message : 'Could not load categories.'))
      .finally(() => setCategoriesLoading(false));
  }, [token, vendorId, branchId, isEdit]);

  const name = branch?.name || (isEdit ? 'Branch' : 'New branch');
  useSetBreadcrumbs([
    { label: 'Members' },
    { label: 'All Member', to: '/account/vendors' },
    { label: 'Member', to: `/account/vendors/${vendorId}` },
    { label: 'Branches', to: `/account/vendors/${vendorId}/branches` },
    { label: isEdit ? name : 'Add branch' },
  ]);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value, ...(key === 'state' ? { city: '' } : {}) }));
    setErrors((e) => (e[key as keyof typeof errors] ? { ...e, [key]: undefined } : e));
  };

  const locationUnlocked = Boolean(form.state);
  const topLevelCategories = categories.filter((c) => !c.parentId);

  const toggleCategory = (categoryId: string) =>
    setCategoryMap((prev) => {
      const next = new Map(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.set(categoryId, new Set());
      return next;
    });

  const toggleSubcategory = (categoryId: string, subcategoryId: string) =>
    setCategoryMap((prev) => {
      const next = new Map(prev);
      const subs = new Set(next.get(categoryId) ?? new Set<string>());
      if (subs.has(subcategoryId)) subs.delete(subcategoryId);
      else subs.add(subcategoryId);
      next.set(categoryId, subs);
      return next;
    });

  const save = useCallback(async () => {
    if (!vendorId) return;
    const nextErrors: typeof errors = {
      name: form.name.trim() ? undefined : 'Branch name is required.',
      pincode: validateBranchPincode(form.pincode) ?? undefined,
      mapLocationUrl: validateMapLocationUrl(form.mapLocationUrl) ?? undefined,
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      setSaveError('Fix the highlighted fields before saving.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const input: BranchInput = {
        name: form.name,
        address: form.address || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        pincode: form.pincode || undefined,
        mapLocationUrl: form.mapLocationUrl.trim() || undefined,
        openingHours: Object.keys(openingHours).length > 0 ? openingHours : undefined,
      };
      const saved = isEdit && branchId
        ? (await updateBranch(token, vendorId, branchId, input)).data
        : (await createBranch(token, vendorId, input)).data;

      try {
        const mappings = [...categoryMap.entries()].map(([categoryId, subcategoryIds]) => ({ categoryId, subcategoryIds: [...subcategoryIds] }));
        await setBranchCategoryAccess(token, vendorId, saved.id, { mappings });
      } catch (categoryErr) {
        // The branch itself already saved successfully above — never leave the admin unsure
        // whether that part worked, and never silently fall through to navigate as if the whole
        // save succeeded (which, in Add mode, would leave them on /branches/new and risk a
        // duplicate branch on retry). Same recovery as BranchDialog.submit().
        const message = categoryErr instanceof ApiRequestError ? categoryErr.message : 'Could not save categories.';
        setSaveError(`Branch saved, but categories could not be saved: ${message}`);
        return;
      }

      navigate(`/account/vendors/${vendorId}/branches/${saved.id}`, { replace: true });
    } catch (err) {
      setSaveError(err instanceof ApiRequestError ? err.message : 'Could not save this branch.');
    } finally {
      setSaving(false);
    }
  }, [vendorId, branchId, isEdit, form, openingHours, categoryMap, token, navigate]);

  if (loading) return <p className="loading-state">Loading branch…</p>;
  if (loadError) return <p className="error-state" role="alert">{loadError}</p>;

  return (
    <div className="admin-page">
      <title>{`${isEdit ? 'Edit' : 'Add'} branch · MSD`}</title>
      <header className="page-head">
        <h1>{isEdit ? 'Edit branch' : 'Add branch'}</h1>
      </header>

      {saveError && <p className="error-state" role="alert">{saveError}</p>}

      <sky-accordion>
        <sky-accordion-item header="Location" open>
          <div className="form-grid">
            {renderSelect({ label: 'State', value: form.state, placeholder: 'Select a state', options: STATES, onChange: (value) => set('state', value) })}
            {!locationUnlocked && <p className="field-hint">Pick a state to fill in the rest.</p>}

            {renderTextField({
              label: 'Branch Name',
              required: true,
              disabled: !locationUnlocked,
              value: form.name,
              error: Boolean(errors.name),
              onInput: (value) => set('name', value),
            })}
            {errors.name && <p className="error-state" role="alert">{errors.name}</p>}

            {renderTextField({
              label: 'Address',
              disabled: !locationUnlocked,
              value: form.address,
              onInput: (value) => set('address', value),
            })}

            {renderSelect({
              label: 'City',
              value: form.city,
              disabled: !locationUnlocked,
              placeholder: locationUnlocked ? 'Select a city' : 'Select a state first',
              options: citiesForState(form.state),
              onChange: (value) => set('city', value),
            })}

            {renderTextField({
              label: 'PIN Code',
              disabled: !locationUnlocked,
              inputmode: 'numeric',
              maxlength: 6,
              value: form.pincode,
              error: Boolean(errors.pincode),
              onInput: (value) => set('pincode', value.replace(/\D/g, '').slice(0, 6)),
            })}
            {errors.pincode && <p className="error-state" role="alert">{errors.pincode}</p>}

            {renderTextField({
              label: 'Map Location',
              type: 'url',
              disabled: !locationUnlocked,
              placeholder: 'Paste Google Maps location link',
              value: form.mapLocationUrl,
              error: Boolean(errors.mapLocationUrl),
              onInput: (value) => set('mapLocationUrl', value),
            })}
            {errors.mapLocationUrl && <p className="error-state" role="alert">{errors.mapLocationUrl}</p>}
          </div>
        </sky-accordion-item>

        <sky-accordion-item header="Opening Hours" disabled={!locationUnlocked}>
          <OpeningHoursEditor value={openingHours} onChange={setOpeningHours} />
        </sky-accordion-item>

        <sky-accordion-item header="Category Access" disabled={!locationUnlocked}>
          {categoriesLoading ? (
            <p className="loading-state">Loading categories…</p>
          ) : categoriesError ? (
            <p className="error-state" role="alert">{categoriesError}</p>
          ) : topLevelCategories.length === 0 ? (
            <p className="empty-state">No active Service or Therapy categories exist yet.</p>
          ) : (
            <div className="category-grant-grid">
              {topLevelCategories.map((category) => {
                const subcategoryOptions = categories.filter((c) => c.parentId === category.id);
                const checked = categoryMap.has(category.id);
                return (
                  <div className="category-grant-grid__group" key={category.id}>
                    <label className="category-grant-grid__option">
                      <input type="checkbox" checked={checked} onChange={() => toggleCategory(category.id)} />
                      {category.name}
                    </label>
                    {checked && subcategoryOptions.length > 0 && (
                      <div className="category-grant-grid__subgroup">
                        {subcategoryOptions.map((sub) => (
                          <label key={sub.id} className="category-grant-grid__option category-grant-grid__option--indented">
                            <input
                              type="checkbox"
                              checked={categoryMap.get(category.id)?.has(sub.id) ?? false}
                              onChange={() => toggleSubcategory(category.id, sub.id)}
                            />
                            {sub.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </sky-accordion-item>
      </sky-accordion>

      <div className="form-actions">
        {createElement(
          'md-filled-button',
          { disabled: saving || categoriesLoading || !locationUnlocked, onClick: () => save() },
          saving ? 'Saving…' : 'Save',
        )}
      </div>
    </div>
  );
}

export default BranchFormPage;
