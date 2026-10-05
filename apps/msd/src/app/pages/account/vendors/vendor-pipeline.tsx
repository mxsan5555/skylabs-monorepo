import { useCallback, useEffect, useRef, useState } from 'react';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import {
  createVendor,
  getVendor,
  getVendorCategoryAccess,
  listBranches,
  listVendorDealsForAdmin,
  listVendorProducts,
  listVendorTherapistsForAdmin,
  updateVendor,
  type AdminTherapist,
  type Branch,
  type Vendor,
  type VendorCategoryAccessRow,
  type VendorCreateInput,
  type VendorFields,
  type VendorProduct,
  type VendorDocument,
  type VendorDocumentType,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { VendorUserPicker, type PendingVendorOwner } from './vendor-user-picker';
import { VendorProfileForm, extractVendorFieldErrors, type VendorFieldErrors } from './vendor-profile-form';
import { MediaUploader } from '../../../components/media-uploader';
import { VendorProductCategoryAccess } from './vendor-wizard-modules';
import { VendorBranchListStep } from './vendor-wizard-branches';
import { VendorDealsStep } from './vendor-wizard-deals';
import { VendorTherapistsStep } from './vendor-wizard-therapists';
import { VendorProductsStep } from './vendor-wizard-products';
import { VendorReviewStep } from './vendor-wizard-review';

const STEPS = [
  { step: 1, label: 'Profile & KYC' },
  { step: 2, label: 'Branches & Access' },
  { step: 3, label: 'Deals' },
  { step: 4, label: 'Therapy' },
  { step: 5, label: 'Products' },
  { step: 6, label: 'Review & Submit' },
] as const;

/** Mirrors msd-api's `hasMinimumKycDocument` in `vendor.service.ts#submitForVerification`
 *  exactly — the client-side half of the same gate, moved up to Step 1 so a vendor without a
 *  KYC document can't even reach the rest of the wizard, not just fail at submit time. Real
 *  `VendorDocument` rows are the authoritative check now; the legacy `kycDocuments` JSON regex
 *  is kept only as a fallback for a vendor onboarded before real file upload existed. */
function hasMinimumKycDocument(vendor: Vendor): boolean {
  const hasRealKycDocument = (vendor.documents ?? []).some(
    (doc) =>
      ['GST', 'PAN', 'AADHAAR'].includes(doc.documentType) &&
      Boolean(doc.storageKey),
  );

  if (hasRealKycDocument) return true;

  return (vendor.kycDocuments ?? []).some(
    (doc) => /gst|pan|aadhaar/i.test(doc.type) && Boolean(doc.url),
  );
}

interface VendorPipelineProps {
  token: string | null;
  initialVendor: Vendor | null;
  /** Called after every successful save (create or a per-step update) — lets the parent page
   *  keep its vendor list/selection in sync without owning any pipeline state itself. */
  onVendorChange: (vendor: Vendor) => void;
  /** Surfaced on Step 1 (Profile & KYC) only — admin-only KYC verify/reject. */
  canReviewKyc?: boolean;
  onKycReview?: (kycStatus: 'VERIFIED' | 'REJECTED', rejectionReason?: string) => void;
  /** Surfaced on Step 6 (Review & Submit) — see `VendorReviewStep`'s own doc comment for why
   *  this reuses the page-level Approve/Reject actions instead of a self-service-only submit
   *  route that has no admin-on-behalf equivalent. */
  canApprove?: boolean;
  canReject?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}

/**
 * Admin "Add Vendor" / "Edit Vendor" (the Overview tab of an existing vendor's detail page, and
 * the dedicated `/account/vendors/new` page, both render this same component) — a 6-step wizard:
 * Profile & KYC → Branches/Modules/Category Access → Deals → Therapy → Products → Review &
 * Submit. Picking/creating the Vendor User is an unavoidable precondition before Step 1 even
 * renders — a Vendor row needs a real owner before anything else can be saved onto it.
 *
 * The stepper is pure visual progression, not a lock: every step (other than the pre-vendor user
 * picker) independently PATCHes/POSTs its own section the moment its own form is saved, exactly
 * like the tabbed editor this replaced — an admin can freely jump back to an earlier step to
 * edit it, the wizard never blocks that. The one real gate is client-side on Step 1 ("Continue"
 * disabled until a KYC document exists) and the Step 6 Approve action being disabled until the
 * full completeness checklist passes — both mirror msd-api's `submitForVerification` gate.
 *
 * Step 3/4/5's own data (branches/category access/products/therapists/deal count) is fetched
 * once here, right after the vendor row exists, and handed down as props — each step's own
 * mutations report back up via an `onChange`-style callback so this shared state stays correct
 * without every step re-fetching on its own, and so Step 6's recap needs no fetches of its own.
 */
export function VendorPipeline({
  token,
  initialVendor,
  onVendorChange,
  canReviewKyc,
  onKycReview,
  canApprove,
  canReject,
  onApprove,
  onReject,
}: VendorPipelineProps) {
  const [vendor, setVendor] = useState<Vendor | null>(initialVendor);
  // Only ever rendered/read before the Vendor row exists at all (see the `!vendor` branch
  // below) — once `saveUser()` succeeds, `vendor` is set and `VendorUserPicker` never renders
  // again for this vendor, so there's no "seed from an already-linked owner" case to handle.
  const [pendingOwner, setPendingOwner] = useState<PendingVendorOwner | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<VendorFieldErrors | null>(null);
  const [activeStep, setActiveStep] = useState<number>(1);
  // KYC gate is separate from vendor state so upload does not reset unsaved form fields or scroll.
  const [hasKycDocument, setHasKycDocument] = useState<boolean>(() =>
    initialVendor ? hasMinimumKycDocument(initialVendor) : false,
  );
  // Same double-submit guard used by every other create flow in this app (DealDialog,
  // ProductFormDialog, TherapistFormDialog, categories.tsx) — a `saving` state guard alone can't
  // stop a second click/tap/Enter that fires before React commits the disabling re-render.
  const submittingRef = useRef(false);
  // Belt-and-suspenders on top of submittingRef: disables the actual DOM element synchronously,
  // in the same tick as the click, rather than waiting on React's `disabled={saving}` re-render
  // to commit — closes the residual window where two clicks issued close enough together can
  // both reach saveUser() before either state update has visibly taken effect.
  const saveButtonRef = useRef<MdFilledButton>(null);

  // Shared step data — see this component's own doc comment on why it's lifted here. Steps
  // 2-5 are now read-only recaps (see `vendor-wizard-branches.tsx`'s own doc comment for why),
  // so this is fetched once for display/the Step 6 recap, never mutated by a step itself.
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categoryAccess, setCategoryAccess] = useState<VendorCategoryAccessRow[]>([]);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [therapists, setTherapists] = useState<AdminTherapist[]>([]);
  const [dealCount, setDealCount] = useState(0);

  useEffect(() => {
    setVendor(initialVendor);
    setPendingOwner(null);
    setError('');
    setFieldErrors(null);
    setActiveStep(1);
    setHasKycDocument(initialVendor ? hasMinimumKycDocument(initialVendor) : false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on id, not object identity, so this doesn't reset the wizard back to Step 1 after every per-step save (`initialVendor` is a new object on every parent re-render once `onVendorChange` fires)
  }, [initialVendor?.id]);

  const vendorId = vendor?.id;

  const reloadBranches = useCallback(async () => {
    if (!vendorId) return [] as Branch[];
    const { data } = await listBranches(token, vendorId);
    setBranches(data);
    return data;
  }, [token, vendorId]);

  // Vendor-wide, not per-branch — `listVendorDealsForAdmin` (added once Deals got its own admin
  // page, see `deals-list-page.tsx`) replaces the old N+1 "one `listDeals` call per branch" loop.
  const reloadDealCount = useCallback(async () => {
    if (!vendorId) {
      setDealCount(0);
      return;
    }
    const { data } = await listVendorDealsForAdmin(token, vendorId);
    setDealCount(data.length);
  }, [token, vendorId]);

  // Initial load of every step's data once the vendor row exists — refetched wholesale only on
  // a real vendor-identity change (a different vendor selected in the admin list). Steps 2-5 are
  // now read-only recaps of this same data (see `vendor-wizard-branches.tsx`'s own doc comment),
  // so nothing here is mutated by a step itself any more — only Step 6's Review recap and these
  // steps' own counts read it.
  useEffect(() => {
    if (!vendorId) return;
    reloadBranches().catch(() => setBranches([]));
    reloadDealCount().catch(() => setDealCount(0));
    getVendorCategoryAccess(token, vendorId).then(({ data }) => setCategoryAccess(data)).catch(() => setCategoryAccess([]));
    listVendorTherapistsForAdmin(token, vendorId).then(({ data }) => setTherapists(data)).catch(() => setTherapists([]));
    listVendorProducts(token, vendorId, { pageSize: 100 }).then(({ data }) => setProducts(data)).catch(() => setProducts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, token]);

  const saveUser = async () => {
    if (!pendingOwner) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    // Disables the real DOM element in the same synchronous tick, rather than waiting on
    // React's `disabled={saving}` re-render to commit — see saveButtonRef's own doc comment.
    if (saveButtonRef.current) saveButtonRef.current.disabled = true;
    setSaving(true);
    setError('');
    try {
      // Always a brand-new owner identity — the backend independently creates the User from
      // these fields (or rejects outright if the email/mobile already belongs to anyone), never
      // trusting anything decided client-side (see `createVendorOwner`'s own doc comment in
      // msd-api's vendor.service.ts). There is no "reuse an existing user" path.
      const input: VendorCreateInput = {
        ownerFirstName: pendingOwner.ownerFirstName,
        ownerLastName: pendingOwner.ownerLastName,
        ownerEmail: pendingOwner.ownerEmail,
        ownerMobile: pendingOwner.ownerMobile,
      };
      const { data } = vendor ? await updateVendor(token, vendor.id, input) : await createVendor(token, input);
      setVendor(data);
      onVendorChange(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save the vendor user.');
    } finally {
      submittingRef.current = false;
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

  const handleBranchesChange = (next: Branch[]) => {
    setBranches(next);
    reloadDealCount(next);
  };

  // Wired to `VendorBranchListStep`'s `onVendorRefresh`, which fires from `BranchDialog`'s
  // `onCategoryAccessSaved` — AFTER a branch's category-access save actually completes, never
  // bundled into `handleBranchesChange` above. That save (`BranchDialog`'s own "Categories &
  // Subcategories" section) can auto-grant a vendor-level `VendorCategoryAccess` row + flip
  // `offersService`/`offersTherapy` server-side (see `setBranchCategoryAccess`'s own doc comment
  // in msd-api's vendor.service.ts), and it happens as a SEPARATE, LATER network call than the
  // branch-fields save `handleBranchesChange` reacts to — refetching here instead of there is
  // what closes that race: `vendor`/`categoryAccess` are otherwise only ever fetched once (the
  // bulk-load effect above), so without a refetch timed to land after the category save actually
  // finishes, the NEXT "Save product categories" click in `VendorProductCategoryAccess` could
  // resubmit stale (pre-grant) `offersService`/`offersTherapy`/`categoryIds`, silently wiping out
  // the branch-level auto-grant via that endpoint's replace-the-full-set semantics — and Step
  // 4/5's own "module not enabled" gate could render the stale flag in the meantime too.
  //
  // Also reloads `branches` — `VendorBranchListStep`'s own save already preserves each branch's
  // PREVIOUS `categoryTypes` so it's never `undefined` (see that file's own doc comment on why),
  // but "previous" is stale the instant a category was actually added/removed, and
  // `VendorTherapistsStep`/`VendorProductsStep` gate branch eligibility on exactly that field
  // (`branches.filter(b => b.categoryTypes.includes('THERAPY'))`). This fires unconditionally on
  // every Branch Access save (not just ones that touch categories — see `BranchDialog.submit()`),
  // so `categoryTypes` is back in sync with the server within one round trip, no page reload
  // needed for a branch's Therapy/Product eligibility to update after its access changed.
  const refreshVendorAndCategoryAccess = () => {
    if (!vendorId) return;
    getVendor(token, vendorId)
      .then(({ data }) => {
        setVendor(data);
        onVendorChange(data);
      })
      .catch(() => { });
    getVendorCategoryAccess(token, vendorId).then(({ data }) => setCategoryAccess(data)).catch(() => { });
    reloadBranches().catch(() => { });
  };

  const handleKycDocumentChange = useCallback(
    (
      change:
        | { action: 'uploaded'; document: VendorDocument }
        | { action: 'deleted'; documentType: VendorDocumentType },
    ) => {
      // Do NOT update vendor/onVendorChange here. VendorProfileForm keeps unsaved inputs locally;
      // replacing its vendor prop would trigger its [vendor] effect and reset the form + scroll.
      if (change.action === 'uploaded') {
        // This callback runs after a successful API upload, so the KYC gate can unlock immediately.
        setHasKycDocument(true);
        return;
      }

      // After deletion, fetch only what is needed to recompute the gate. Keep vendor state untouched.
      if (!vendorId) {
        setHasKycDocument(false);
        return;
      }

      getVendor(token, vendorId)
        .then(({ data }) => setHasKycDocument(hasMinimumKycDocument(data)))
        .catch((err) => {
          console.error('Could not refresh KYC gate after document deletion:', err);
          setHasKycDocument(false);
        });
    },
    [token, vendorId],
  );


  /**
   * Keep the pipeline's local vendor state in sync immediately after a KYC review.
   * `onKycReview` is intentionally a fire-and-forget callback, so waiting for it here
   * cannot guarantee that the parent's API request has completed before this component
   * renders again. Updating the local vendor first prevents the KYC status label from
   * remaining on the old `PENDING` value. The parent callback is still invoked so the
   * server-side review operation remains unchanged.
   */
  const handleKycReview = useCallback(
    (kycStatus: 'VERIFIED' | 'REJECTED', rejectionReason?: string) => {
      if (!vendor) return;

      const nextVendor: Vendor = {
        ...vendor,
        kycStatus,
        kycRejectionReason:
          kycStatus === 'REJECTED' ? rejectionReason?.trim() || null : null,
      };

      setVendor(nextVendor);
      onVendorChange(nextVendor);
      onKycReview?.(kycStatus, rejectionReason);
    },
    [vendor, onVendorChange, onKycReview],
  );

  if (!vendor) {
    return (
      <div className="admin-page">
        {error && <p className="error-state" role="alert">{error}</p>}
        <VendorUserPicker value={pendingOwner} onChange={setPendingOwner} disabled={saving} />
        <div className="form-actions">
          <FilledButton ref={saveButtonRef} onClick={saveUser} disabled={!pendingOwner || saving}>
            {saving ? 'Creating…' : 'Create Vendor'}
          </FilledButton>
        </div>
      </div>
    );
  }

  const kycDocOk = hasKycDocument;

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
                <span className="wizard-steps__num" aria-hidden="true">
                  {step}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {activeStep === 1 && (
        <section aria-label="Profile & KYC">
          <h2 className="section-title">Step 1: Profile &amp; KYC</h2>
          <VendorProfileForm
            vendor={vendor}
            canEdit
            canReviewKyc={Boolean(canReviewKyc)}
            saving={saving}
            token={token}
            selfService={false}
            sections={['business', 'owner', 'address', 'kyc', 'bank']}
            saveLabel="Save"
            onSave={saveSection}
            onKycReview={handleKycReview}
            serverFieldErrors={fieldErrors}
            onKycDocumentChanged={handleKycDocumentChange}
          />
          {!kycDocOk && (
            <p className="error-state" role="alert">
              Upload at least one KYC document (GST, PAN, or Aadhaar) before continuing.
            </p>
          )}

         <sky-tile-card
            className="vendor-section-card"
            headline="Profile Image"
            text="Upload and manage the vendor profile images."
            color="none"
          >
            <MediaUploader
              entityType="vendor"
              entityId={vendor.id}
              existingImages={vendor.mediaImages ?? []}
              existingVideo={vendor.mediaVideo ?? null}
              token={token}
            />
          </sky-tile-card>
          
          <div className="form-actions">
            <FilledButton onClick={() => setActiveStep(2)} disabled={!kycDocOk}>
              Continue
            </FilledButton>
          </div>
        </section>
      )}

      {activeStep === 2 && (
        <section aria-label="Branches & Access">
          <h2 className="section-title">Step 2: Branches &amp; Access</h2>
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
        </section>
      )}

      {activeStep === 3 && (
        <>
          <h2 className="section-title">Step 3: Deals</h2>
          <VendorDealsStep vendorId={vendor.id} branchCount={branches.length} dealCount={dealCount} />
        </>
      )}

      {activeStep === 4 && (
        <>
          <h2 className="section-title">Step 4: Therapy</h2>
          <VendorTherapistsStep
            vendorId={vendor.id}
            offersTherapy={vendor.offersTherapy}
            branches={branches}
            therapistCount={therapists.length}
          />
        </>
      )}

      {activeStep === 5 && (
        <>
          <h2 className="section-title">Step 5: Products</h2>
          <VendorProductsStep vendorId={vendor.id} offersProduct={vendor.offersProduct} productCount={products.length} />
        </>
      )}

      {activeStep === 6 && (
        <>
          <h2 className="section-title">Step 6: Review &amp; Submit</h2>
          <VendorReviewStep
            vendor={vendor}
            branches={branches}
            categoryAccess={categoryAccess}
            dealCount={dealCount}
            therapists={therapists}
            products={products}
            canApprove={canApprove}
            canReject={canReject}
            onApprove={onApprove}
            onReject={onReject}
          />
        </>
      )}
    </div>
  );
}

export default VendorPipeline;