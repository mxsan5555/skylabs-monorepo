import { useEffect, useState } from 'react';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import {
  createVendor,
  updateVendor,
  type UserSummary,
  type Vendor,
  type VendorFields,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { VendorUserPicker } from './vendor-user-picker';
import { VendorProfileTabs } from './vendor-profile-tabs';
import { extractVendorFieldErrors, type VendorFieldErrors } from './vendor-profile-form';

interface VendorPipelineProps {
  token: string | null;
  initialVendor: Vendor | null;
  /** Called after every successful save (create or a per-tab update) — lets the parent page
   *  keep its vendor list/selection in sync without owning any pipeline state itself. */
  onVendorChange: (vendor: Vendor) => void;
  /** Surfaced on the KYC & Documents tab only — admin-only KYC verify/reject. */
  canReviewKyc?: boolean;
  onKycReview?: (kycStatus: 'VERIFIED' | 'REJECTED', rejectionReason?: string) => void;
}

/**
 * Admin "Add Vendor" / "Edit Vendor" (the Overview tab of an existing vendor's detail page, and
 * the dedicated `/account/vendors/new` page, both render this same component). Picking/creating
 * the Vendor User is an unavoidable precondition — a Vendor row needs a real owner before
 * anything else can be saved onto it — everything after that is the shared
 * `VendorProfileTabs` (Business/Owner/Address/KYC/Bank/Profile Image), all freely switchable.
 * Every save goes straight to the database via the existing POST/PATCH /vendors endpoints —
 * there is no client-only draft state, so a browser refresh mid-edit loses nothing.
 */
export function VendorPipeline({ token, initialVendor, onVendorChange, canReviewKyc, onKycReview }: VendorPipelineProps) {
  const [vendor, setVendor] = useState<Vendor | null>(initialVendor);
  const [pendingOwner, setPendingOwner] = useState<UserSummary | null>(initialVendor?.owner ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<VendorFieldErrors | null>(null);

  useEffect(() => {
    setVendor(initialVendor);
    setPendingOwner(initialVendor?.owner ?? null);
    setError('');
    setFieldErrors(null);
  }, [initialVendor]);

  const saveUser = async () => {
    if (!pendingOwner) return;
    setSaving(true);
    setError('');
    try {
      const { data } = vendor
        ? await updateVendor(token, vendor.id, { ownerUserId: pendingOwner.id })
        : await createVendor(token, { ownerUserId: pendingOwner.id });
      setVendor(data);
      onVendorChange(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save the vendor user.');
    } finally {
      setSaving(false);
    }
  };

  const saveSection = async (input: VendorFields) => {
    if (!vendor) return;
    setSaving(true);
    setError('');
    setFieldErrors(null);
    try {
      const { data } = await updateVendor(token, vendor.id, input);
      setVendor(data);
      onVendorChange(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save this section — please try again.');
      setFieldErrors(extractVendorFieldErrors(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page">
      {error && <p className="error-state" role="alert">{error}</p>}

      {!vendor ? (
        <>
          <VendorUserPicker selectedUser={pendingOwner} onSelect={setPendingOwner} />
          <div className="form-actions">
            <FilledButton onClick={saveUser} disabled={!pendingOwner || saving}>
              {saving ? 'Creating…' : 'Create Vendor'}
            </FilledButton>
          </div>
        </>
      ) : (
        <VendorProfileTabs
          vendor={vendor}
          token={token}
          selfService={false}
          canEdit
          canReviewKyc={canReviewKyc}
          saving={saving}
          onSave={saveSection}
          onKycReview={onKycReview}
          serverFieldErrors={fieldErrors}
        />
      )}
    </div>
  );
}
