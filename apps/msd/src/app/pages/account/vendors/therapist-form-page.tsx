import { createElement, useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '@skylabs-monorepo/shared-ui';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import {
  createVendorTherapist,
  getVendor,
  getVendorCategoryAccess,
  listBranches,
  listVendorTherapistsForAdmin,
  updateVendorTherapist,
  type AdminTherapist,
  type Branch,
  type Category,
  type Vendor,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';

interface TherapistFormPageProps {
  token: string | null;
}

type DrivenChangeEvent = ChangeEvent<HTMLElement & { value: string }>;

/** Raw M3 elements — see `BranchFormPage`/`DealFormPage`'s own doc comments for why: the
 *  shared-ui React wrappers set element state via an imperative property effect that does not
 *  run under Vitest's `@lit/react` resolution. */
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
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return createElement(
    'md-outlined-select',
    { label, value, disabled, onChange: (e: DrivenChangeEvent) => onChange(e.currentTarget.value) },
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

/** Same convention as `BranchFormPage`/`DealFormPage`'s own `vendorDisplayName`. */
function vendorDisplayName(vendor: Vendor): string | null {
  return vendor.businessName || vendor.owner?.name || null;
}

const EMPTY_FORM = {
  branchId: '',
  therapistType: '',
  personName: '',
  gender: '',
  specializationCategoryId: '',
  bio: '',
  experienceYears: '',
};

/** Add/Edit therapist — `/account/vendors/:vendorId/therapists/new` and
 *  `.../therapists/:therapistId`. One page: Branch (only branches with THERAPY category access —
 *  mirrors the self-service `therapyBranches` filter in `vendor-therapists.tsx`), the therapist's
 *  own fields, and a Specialization picker restricted to the vendor's granted THERAPY categories
 *  (same simplified, vendor-wide — not branch-scoped-with-subcategories — picker
 *  `TherapistFormDialog` in `vendor-therapists.tsx` already uses, for consistency with that
 *  shipped UX rather than inventing a different one here).
 *
 *  Adapted from `TherapistFormDialog`'s fields rather than extracted into a shared component —
 *  same known dedup opportunity already flagged for `BranchFormPage`/`DealFormPage`. Renders raw
 *  M3 elements for the same testability reason those two pages do. */
export function TherapistFormPage({ token }: TherapistFormPageProps) {
  const { vendorId, therapistId } = useParams<{ vendorId: string; therapistId?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(therapistId);

  const [vendorName, setVendorName] = useState<string | null>(null);
  const [therapist, setTherapist] = useState<AdminTherapist | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [specializationCategories, setSpecializationCategories] = useState<Category[]>([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<'branchId' | 'therapistType' | 'personName', string>>>({});
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
    setBranchesLoading(true);
    listBranches(token, vendorId)
      .then(({ data }) => setBranches(data))
      .catch(() => setBranches([]))
      .finally(() => setBranchesLoading(false));
  }, [token, vendorId]);

  useEffect(() => {
    if (!vendorId) return;
    getVendorCategoryAccess(token, vendorId)
      .then(({ data }) => setSpecializationCategories(data.filter((row) => row.category.type === 'THERAPY').map((row) => row.category)))
      .catch(() => setSpecializationCategories([]));
  }, [token, vendorId]);

  // No single-therapist GET exists — load every therapist for the vendor and find this one, same
  // `listX` + `find` pattern `BranchFormPage`/`DealFormPage` use for their own entity.
  useEffect(() => {
    if (!isEdit || !vendorId || !therapistId) return;
    setLoading(true);
    listVendorTherapistsForAdmin(token, vendorId)
      .then(({ data }) => {
        const found = data.find((t) => t.id === therapistId);
        if (!found) {
          setLoadError('Therapist not found.');
          return;
        }
        setTherapist(found);
        setForm({
          branchId: found.branchId,
          therapistType: found.therapistType,
          personName: found.personName,
          gender: found.gender ?? '',
          specializationCategoryId: found.specializationCategoryId ?? '',
          bio: found.bio ?? '',
          experienceYears: found.experienceYears != null ? String(found.experienceYears) : '',
        });
      })
      .catch((err) => setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load this therapist.'))
      .finally(() => setLoading(false));
  }, [token, vendorId, therapistId, isEdit]);

  const name = therapist?.personName || (isEdit ? 'Therapist' : 'New therapist');
  useSetBreadcrumbs([
    { label: 'Members' },
    { label: 'All Member', to: '/account/vendors' },
    { label: vendorName ?? 'Member', to: `/account/vendors/${vendorId}` },
    { label: 'Therapists', to: `/account/vendors/${vendorId}/therapists` },
    { label: isEdit ? name : 'Add therapist' },
  ]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key as keyof typeof errors] ? { ...e, [key]: undefined } : e));
  };

  // Only a branch with at least one currently-granted THERAPY category (`categoryTypes`,
  // computed server-side by `listBranches`) is eligible to host a therapist — mirrors the
  // self-service `therapyBranches` filter exactly.
  const therapyBranches = branches.filter((b) => b.categoryTypes?.includes('THERAPY'));

  const save = useCallback(async () => {
    if (!vendorId) return;
    const nextErrors: typeof errors = {
      branchId: form.branchId ? undefined : 'Select a branch.',
      therapistType: form.therapistType.trim() ? undefined : 'Type is required.',
      personName: form.personName.trim() ? undefined : 'Name is required.',
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
        therapistType: form.therapistType,
        personName: form.personName,
        gender: form.gender || undefined,
        specializationCategoryId: form.specializationCategoryId || undefined,
        bio: form.bio || undefined,
        experienceYears: form.experienceYears ? Number(form.experienceYears) : undefined,
      };
      const saved =
        isEdit && therapistId
          ? (await updateVendorTherapist(token, vendorId, therapistId, input)).data
          : (await createVendorTherapist(token, vendorId, form.branchId, input)).data;
      navigate(`/account/vendors/${vendorId}/therapists/${saved.id}`, { replace: true });
    } catch (err) {
      setSaveError(err instanceof ApiRequestError ? err.message : 'Could not save this therapist.');
    } finally {
      setSaving(false);
    }
  }, [vendorId, therapistId, isEdit, form, token, navigate]);

  if (loading) return <p className="loading-state">Loading therapist…</p>;
  if (loadError) return <p className="error-state" role="alert">{loadError}</p>;

  return (
    <div className="admin-page">
      <title>{`${isEdit ? 'Edit' : 'Add'} therapist · MSD`}</title>
      <header className="page-head">
        <h1>{isEdit ? 'Edit therapist' : 'Add therapist'}</h1>
      </header>

      {saveError && <p className="error-state" role="alert">{saveError}</p>}

      <div className="form-grid">
        {isEdit ? (
          <p className="field-hint">Branch: {branches.find((b) => b.id === form.branchId)?.name ?? therapist?.branch.name ?? '—'} (cannot be changed)</p>
        ) : (
          renderSelect({
            label: 'Branch',
            value: form.branchId,
            disabled: branchesLoading,
            placeholder: branchesLoading ? 'Loading branches…' : 'Select a branch',
            options: therapyBranches.map((b) => ({ value: b.id, label: b.name })),
            onChange: (value) => set('branchId', value),
          })
        )}
        {errors.branchId && <p className="error-state" role="alert">{errors.branchId}</p>}
        {!branchesLoading && !isEdit && therapyBranches.length === 0 && (
          <p className="empty-state">No branch currently has Therapy category access — map one on the branch's Category Access first.</p>
        )}

        {renderTextField({ label: 'Therapist Type / Service Name', required: true, value: form.therapistType, onInput: (value) => set('therapistType', value) })}
        {errors.therapistType && <p className="error-state" role="alert">{errors.therapistType}</p>}
        {renderTextField({ label: 'Person Name', required: true, value: form.personName, onInput: (value) => set('personName', value) })}
        {errors.personName && <p className="error-state" role="alert">{errors.personName}</p>}
        {renderTextField({ label: 'Gender', value: form.gender, onInput: (value) => set('gender', value) })}

        {specializationCategories.length > 0 ? (
          renderSelect({
            label: 'Specialization',
            value: form.specializationCategoryId,
            placeholder: 'None',
            options: specializationCategories.map((c) => ({ value: c.id, label: c.name })),
            onChange: (value) => set('specializationCategoryId', value),
          })
        ) : (
          <p className="empty-state">No Therapy categories have been granted to this business yet — grant one under Business Modules &amp; Category Access first.</p>
        )}
        {therapist?.specialization && (
          <p className="field-hint">Previously recorded specialization (historical, read-only): {therapist.specialization}</p>
        )}

        {renderTextField({ label: 'Bio', value: form.bio, onInput: (value) => set('bio', value) })}
        {renderTextField({ label: 'Experience (years)', type: 'number', value: form.experienceYears, onInput: (value) => set('experienceYears', value) })}
      </div>

      <div className="form-actions">
        <FilledButton disabled={saving} onClick={() => save()}>
          {saving ? 'Saving…' : 'Save'}
        </FilledButton>
      </div>
    </div>
  );
}

export default TherapistFormPage;
