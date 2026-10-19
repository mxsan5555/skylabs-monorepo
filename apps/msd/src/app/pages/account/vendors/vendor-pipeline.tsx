import { useCallback, useEffect, useState } from 'react';
import { FilledButton, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import {
  getVendor,
  getVendorCategoryAccess,
  listBranches,
  updateVendor,
  type Branch,
  type Vendor,
  type VendorCategoryAccessRow,
  type VendorFields,
  type VendorDocument,
  type VendorDocumentType,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { VendorProfileForm, extractVendorFieldErrors, type VendorFieldErrors } from './vendor-profile-form';
import { MediaUploader } from '../../../components/media-uploader';
import { VendorProductCategoryAccess } from './vendor-wizard-modules';
import { VendorBranchListStep } from './vendor-wizard-branches';

const STEPS = [
  { step: 1, label: 'Member User' },
  { step: 2, label: 'Business Details' },
  { step: 3, label: 'KYC Documents' },
  { step: 4, label: 'Branch & Access' },
] as const;

interface VendorPipelineProps {
  token: string | null;
  vendor: Vendor;
  /** Called after every successful per-step save — lets the parent (Member Details) keep its
   *  own vendor state in sync without owning any pipeline state itself. */
  onVendorChange: (vendor: Vendor) => void;
  /** Called when Step 4's "Save & Finish" completes, or when leaving early from any step — the
   *  parent returns to the plain Member Details Overview (no separate Review & Submit step; see
   *  this component's own doc comment). */
  onFinish: () => void;
  /** Surfaced on Step 3 (KYC Documents) only — admin-only KYC verify/reject. */
  canReviewKyc?: boolean;
  onKycReview?: (kycStatus: 'VERIFIED' | 'REJECTED', rejectionReason?: string) => void;
}

/**
 * "Complete Profile" — all 4 steps of Member creation/setup: Member User → Business Details →
 * KYC Documents → Branch & Access. Reached from the Member Details page's "Complete
 * Profile"/"Add Profile" button (`/account/vendors/:id/profile`), one screen at a time. All
 * four pills stay visible and clickable at every visit — including Member User after the
 * account already exists (editing it updates the SAME linked owner account via
 * `updateVendor`'s owner-field propagation, see vendor.service.ts#syncOwnerUserFromVendorFields
 * — it never creates a second owner).
 *
 * Deliberately has NO Deals/Therapy/Products/Review & Submit steps any more (they used to be
 * Steps 3/4/5/6 of a 6-step wizard) — those are managed from Member Details' own cards once the
 * relevant branch/access requirement is met, and KYC verification/Member activation are the
 * page-level Actions menu's job, never a wizard step (see that page's own doc comment on why
 * those stay separate operations).
 *
 * One consistent footer per step — Back (step 1's reads "Back to Member Details", functioning as
 * Cancel) + the step's own Save button (`VendorProfileForm`'s/the category-access step's own
 * `saveLabel`, "Save & Continue" on steps 1-3, "Save & Finish" on step 4) — no second, separately
 * worded "Save Draft & Exit" button duplicating it. Each step independently PATCHes only its own
 * section's fields the moment it's saved, so leaving mid-wizard via Back/breadcrumb never loses
 * anything already saved — that already-saved state IS the draft.
 */
export function VendorPipeline({
  token,
  vendor: initialVendor,
  onVendorChange,
  onFinish,
  canReviewKyc,
  onKycReview,
}: VendorPipelineProps) {
  const [vendor, setVendor] = useState<Vendor>(initialVendor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<VendorFieldErrors | null>(null);
  const [activeStep, setActiveStep] = useState<number>(2);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [categoryAccess, setCategoryAccess] = useState<VendorCategoryAccessRow[]>([]);

  useEffect(() => {
    setVendor(initialVendor);
    setError('');
    setFieldErrors(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on id, not object identity, so a per-step save (which hands back a new vendor object) doesn't reset the active step
  }, [initialVendor.id]);

  const vendorId = vendor.id;

  const reloadBranches = useCallback(async () => {
    const { data } = await listBranches(token, vendorId);
    setBranches(data);
    return data;
  }, [token, vendorId]);

  useEffect(() => {
    reloadBranches().catch(() => setBranches([]));
    getVendorCategoryAccess(token, vendorId).then(({ data }) => setCategoryAccess(data)).catch(() => setCategoryAccess([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, token]);

  const saveSection = async (input: VendorFields) => {
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

  // Same race this component used to close before the Deals/Therapy/Products steps were removed
  // (see `BranchDialog`'s "Categories & Subcategories" section) — a branch's own category-access
  // save happens as a separate, later network call than the branch-fields save, so re-fetch both
  // vendor + category access after it lands rather than trusting a stale snapshot.
  const refreshVendorAndCategoryAccess = () => {
    getVendor(token, vendorId)
      .then(({ data }) => {
        setVendor(data);
        onVendorChange(data);
      })
      .catch(() => {});
    getVendorCategoryAccess(token, vendorId).then(({ data }) => setCategoryAccess(data)).catch(() => {});
    reloadBranches().catch(() => {});
  };

  const handleKycDocumentChange = useCallback(
    (
      change:
        | { action: 'uploaded'; document: VendorDocument }
        | { action: 'deleted'; documentType: VendorDocumentType },
    ) => {
      // Do NOT update vendor/onVendorChange here — VendorProfileForm keeps unsaved inputs
      // locally; replacing its vendor prop would trigger its [vendor] effect and reset the form.
      void change;
    },
    [],
  );

  const handleKycReview = useCallback(
    (kycStatus: 'VERIFIED' | 'REJECTED', rejectionReason?: string) => {
      const nextVendor: Vendor = {
        ...vendor,
        kycStatus,
        kycRejectionReason: kycStatus === 'REJECTED' ? rejectionReason?.trim() || null : null,
      };
      setVendor(nextVendor);
      onVendorChange(nextVendor);
      onKycReview?.(kycStatus, rejectionReason);
    },
    [vendor, onVendorChange, onKycReview],
  );

  return (
    <div className="admin-page">
      {error && <p className="error-state" role="alert">{error}</p>}

      <nav aria-label="Onboarding steps">
        <ul className="wizard-steps">
          {STEPS.map(({ step, label }) => (
            <li key={step}>
              <button
                type="button"
                className="wizard-steps__item"
                aria-current={activeStep === step ? 'step' : undefined}
                onClick={() => setActiveStep(step)}
              >
                <span className="wizard-steps__num" aria-hidden="true">{step}</span>
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {activeStep === 1 && (
        <section aria-label="Member User">
          <h2 className="section-title">Step 1 of 4: Member User</h2>
          <p className="field-hint">
            This updates the member&apos;s own account — the one they sign in with. It never creates a
            new account.
          </p>
          <VendorProfileForm
            vendor={vendor}
            canEdit
            canReviewKyc={false}
            saving={saving}
            token={token}
            selfService={false}
            sections={['owner']}
            saveLabel="Save & Continue"
            onSave={async (input) => {
              await saveSection(input);
              setActiveStep(2);
            }}
            serverFieldErrors={fieldErrors}
          />

          <sky-tile-card className="vendor-section-card" headline="Profile Image" text="One photo, shown wherever this member appears." color="none">
            <MediaUploader
              entityType="vendor"
              entityId={vendor.id}
              maxImages={1}
              hideVideo
              existingImages={vendor.mediaImages ?? []}
              existingVideo={null}
              token={token}
              onImagesChange={(images) => {
                const next = { ...vendor, mediaImages: images };
                setVendor(next);
                onVendorChange(next);
              }}
            />
          </sky-tile-card>

          <div className="form-actions">
            <OutlinedButton onClick={onFinish}>Back to Member Details</OutlinedButton>
          </div>
        </section>
      )}

      {activeStep === 2 && (
        <section aria-label="Business Details">
          <h2 className="section-title">Step 2 of 4: Business Details</h2>
          <VendorProfileForm
            vendor={vendor}
            canEdit
            canReviewKyc={false}
            saving={saving}
            token={token}
            selfService={false}
            sections={['business', 'address', 'bank']}
            saveLabel="Save & Continue"
            onSave={async (input) => {
              await saveSection(input);
              setActiveStep(3);
            }}
            serverFieldErrors={fieldErrors}
          />

          <div className="form-actions">
            <OutlinedButton onClick={() => setActiveStep(1)}>Back</OutlinedButton>
          </div>
        </section>
      )}

      {activeStep === 3 && (
        <section aria-label="KYC Documents">
          <h2 className="section-title">Step 3 of 4: KYC Documents</h2>
          <VendorProfileForm
            vendor={vendor}
            canEdit
            canReviewKyc={Boolean(canReviewKyc)}
            saving={saving}
            token={token}
            selfService={false}
            sections={['kyc']}
            saveLabel="Save & Continue"
            onSave={async () => setActiveStep(4)}
            onKycReview={handleKycReview}
            serverFieldErrors={fieldErrors}
            onKycDocumentChanged={handleKycDocumentChange}
          />
          <div className="form-actions">
            <OutlinedButton onClick={() => setActiveStep(2)}>Back</OutlinedButton>
          </div>
        </section>
      )}

      {activeStep === 4 && (
        <section aria-label="Branch & Access">
          <h2 className="section-title">Step 4 of 4: Branch &amp; Access</h2>
          <VendorProductCategoryAccess
            token={token}
            vendorId={vendor.id}
            isSelf={false}
            vendor={vendor}
            access={categoryAccess}
            onSaved={(nextVendor, nextAccess) => {
              setVendor(nextVendor);
              onVendorChange(nextVendor);
              setCategoryAccess(nextAccess);
            }}
          />
          <VendorBranchListStep vendorId={vendor.id} branches={branches} />
          <p className="field-hint">Branch category access is saved from the branch's own edit page and reflected here on return.</p>
          <div className="form-actions">
            <OutlinedButton onClick={() => setActiveStep(3)}>Back</OutlinedButton>
            <FilledButton
              onClick={() => {
                refreshVendorAndCategoryAccess();
                onFinish();
              }}
            >
              Save &amp; Finish
            </FilledButton>
          </div>
        </section>
      )}
    </div>
  );
}

export default VendorPipeline;
