import { createElement, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '@skylabs-monorepo/shared-ui';
import {
  createBranch,
  getVendor,
  listBranches,
  updateBranch,
  type Branch,
  type BranchInput,
  type OpeningHours,
  type Vendor,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { memberTrail } from './member-crumbs';
import { STATES, citiesForState } from '@skylabs-monorepo/shared-utils';
import { normalizeOpeningHours, OpeningHoursEditor, validateBranchPincode, validateMapLocationUrl } from './vendor-branches';
import { renderSelect, renderTextField } from './form-controls';

/** The shared selects take value/label pairs; states and cities are both. */
const asOptions = (values: string[]) => values.map((value) => ({ value, label: value }));

interface BranchFormPageProps {
  token: string | null;
}

/** Same convention as `MemberDetailPage`'s `name` derivation: business name first, owner name as
 *  a fallback, `null` (not a literal) when neither is known yet — the breadcrumb itself supplies
 *  the transient/failure fallback label. */
function vendorDisplayName(vendor: Vendor): string | null {
  return vendor.businessName || vendor.owner?.name || null;
}

/** Add/Edit branch — `/account/members/:vendorId/branches/new` and `.../branches/:branchId`.
 *  One page, `sky-accordion` sections: Location (State first — every other field starts
 *  disabled until a state is picked) and Opening Hours. No category step: categories are open
 *  to every member (D10). */
export function BranchFormPage({ token }: BranchFormPageProps) {
  const { vendorId, branchId } = useParams<{ vendorId: string; branchId?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(branchId);

  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');

  const [vendorName, setVendorName] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', address: '', addressLine2: '', city: '', state: '', pincode: '', mapLocationUrl: '' });
  const [openingHours, setOpeningHours] = useState<OpeningHours>({});
  const [errors, setErrors] = useState<Partial<Record<'name' | 'state' | 'city' | 'pincode' | 'mapLocationUrl', string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Independent of the branch load below — presentational only (feeds the breadcrumb),
  // so it never blocks or gates the page's own loading state.
  useEffect(() => {
    if (!vendorId) return;
    getVendor(token, vendorId)
      .then(({ data }) => setVendorName(vendorDisplayName(data)))
      .catch(() => setVendorName(null));
  }, [token, vendorId]);

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
          addressLine2: found.addressLine2 ?? '',
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

  const name = branch?.name || (isEdit ? 'Branch' : 'New branch');
  useSetBreadcrumbs([
    ...memberTrail(vendorId, vendorName),
    { label: 'Branches', to: `/account/members/${vendorId}/branches` },
    { label: isEdit ? name : 'Add branch' },
  ]);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value, ...(key === 'state' ? { city: '' } : {}) }));
    setErrors((e) => (e[key as keyof typeof errors] ? { ...e, [key]: undefined } : e));
  };

  const locationUnlocked = Boolean(form.state);

  const save = useCallback(async () => {
    if (!vendorId) return;
    const nextErrors: typeof errors = {
      name: form.name.trim() ? undefined : 'Branch name is required.',
      // PLANNING §2.7: state and city from the India list, so deals line up with the storefront.
      state: form.state ? undefined : 'Select the state first.',
      city: form.city ? undefined : 'Select a city.',
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
        addressLine2: form.addressLine2 || undefined,
        city: form.city,
        state: form.state,
        pincode: form.pincode || undefined,
        mapLocationUrl: form.mapLocationUrl.trim() || undefined,
        openingHours: Object.keys(openingHours).length > 0 ? openingHours : undefined,
      };
      const saved = isEdit && branchId
        ? (await updateBranch(token, vendorId, branchId, input)).data
        : (await createBranch(token, vendorId, input)).data;

      navigate(`/account/members/${vendorId}/branches/${saved.id}`, { replace: true });
    } catch (err) {
      setSaveError(err instanceof ApiRequestError ? err.message : 'Could not save this branch.');
    } finally {
      setSaving(false);
    }
  }, [vendorId, branchId, isEdit, form, openingHours, token, navigate]);

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
            {renderSelect({ label: 'State', value: form.state, placeholder: 'Select a state', options: asOptions(STATES), onChange: (value) => set('state', value) })}
            {errors.state && <p className="error-state" role="alert">{errors.state}</p>}
            {!locationUnlocked && <p className="field-hint">Pick a state to fill in the rest.</p>}

            {renderSelect({
              label: 'City',
              value: form.city,
              disabled: !locationUnlocked,
              placeholder: locationUnlocked ? 'Select a city' : 'Select a state first',
              options: asOptions(citiesForState(form.state)),
              onChange: (value) => set('city', value),
            })}
            {errors.city && <p className="error-state" role="alert">{errors.city}</p>}

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
            {renderTextField({
              label: 'Address line 2 (optional)',
              disabled: !locationUnlocked,
              value: form.addressLine2,
              onInput: (value) => set('addressLine2', value),
            })}

            {renderTextField({
              label: 'PIN Code',
              disabled: !locationUnlocked,
              inputMode: 'numeric',
              maxLength: 6,
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
      </sky-accordion>

      <div className="form-actions">
        {createElement(
          'md-filled-button',
          { disabled: saving || !locationUnlocked, onClick: () => save() },
          saving ? 'Saving…' : 'Save',
        )}
      </div>
    </div>
  );
}

export default BranchFormPage;
