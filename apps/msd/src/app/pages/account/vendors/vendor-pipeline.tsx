import { useCallback, useEffect, useRef, useState } from 'react';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import {
  createVendor,
  getVendorCategoryAccess,
  listBranches,
  listCategories,
  listDeals,
  listVendorProducts,
  listVendorTherapistsForAdmin,
  updateVendor,
  type AdminTherapist,
  type Branch,
  type Category,
  type UserSummary,
  type Vendor,
  type VendorCategoryAccessRow,
  type VendorFields,
  type VendorProduct,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { VendorUserPicker } from './vendor-user-picker';
import { VendorProfileForm, extractVendorFieldErrors, type VendorFieldErrors } from './vendor-profile-form';
import { MediaUploader } from '../../../components/media-uploader';
import { VendorModulesAndCategoryAccess } from './vendor-wizard-modules';
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
  if ((vendor.documents ?? []).length > 0) return true;
  return (vendor.kycDocuments ?? []).some((doc) => /gst|pan|aadhaar/i.test(doc.type) && Boolean(doc.url));
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
  const [pendingOwner, setPendingOwner] = useState<UserSummary | null>(initialVendor?.owner ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<VendorFieldErrors | null>(null);
  const [activeStep, setActiveStep] = useState<number>(1);
  // Same double-submit guard used by every other create flow in this app (DealDialog,
  // ProductFormDialog, TherapistFormDialog, categories.tsx) — a `saving` state guard alone can't
  // stop a second click/tap/Enter that fires before React commits the disabling re-render.
  const submittingRef = useRef(false);
  // Belt-and-suspenders on top of submittingRef: disables the actual DOM element synchronously,
  // in the same tick as the click, rather than waiting on React's `disabled={saving}` re-render
  // to commit — closes the residual window where two clicks issued close enough together can
  // both reach saveUser() before either state update has visibly taken effect.
  const saveButtonRef = useRef<MdFilledButton>(null);

  // Shared step data — see this component's own doc comment on why it's lifted here.
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categoryAccess, setCategoryAccess] = useState<VendorCategoryAccessRow[]>([]);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [therapists, setTherapists] = useState<AdminTherapist[]>([]);
  const [dealCount, setDealCount] = useState(0);
  const [serviceCategories, setServiceCategories] = useState<Category[]>([]);
  const [productCategories, setProductCategories] = useState<Category[]>([]);
  const [therapyCategories, setTherapyCategories] = useState<Category[]>([]);

  useEffect(() => {
    setVendor(initialVendor);
    setPendingOwner(initialVendor?.owner ?? null);
    setError('');
    setFieldErrors(null);
    setActiveStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on id, not object identity, so this doesn't reset the wizard back to Step 1 after every per-step save (`initialVendor` is a new object on every parent re-render once `onVendorChange` fires)
  }, [initialVendor?.id]);

  const vendorId = vendor?.id;

  const reloadBranches = useCallback(async () => {
    if (!vendorId) return [] as Branch[];
    const { data } = await listBranches(token, vendorId);
    setBranches(data);
    return data;
  }, [token, vendorId]);

  const reloadDealCount = useCallback(
    async (branchList: Branch[]) => {
      if (!vendorId || branchList.length === 0) {
        setDealCount(0);
        return;
      }
      const perBranch = await Promise.all(branchList.map((b) => listDeals(token, vendorId, b.id)));
      setDealCount(perBranch.reduce((sum, r) => sum + r.data.length, 0));
    },
    [token, vendorId],
  );

  // Initial load of every step's data once the vendor row exists — refetched wholesale only on
  // a real vendor-identity change (a different vendor selected in the admin list), never on
  // every field-level save; each step reports its own mutations back up via its own callback.
  useEffect(() => {
    if (!vendorId) return;
    reloadBranches()
      .then(reloadDealCount)
      .catch(() => {
        setBranches([]);
        setDealCount(0);
      });
    getVendorCategoryAccess(token, vendorId).then(({ data }) => setCategoryAccess(data)).catch(() => setCategoryAccess([]));
    listVendorTherapistsForAdmin(token, vendorId).then(({ data }) => setTherapists(data)).catch(() => setTherapists([]));
    listVendorProducts(token, vendorId, { pageSize: 100 }).then(({ data }) => setProducts(data)).catch(() => setProducts([]));
    listCategories(token, { type: 'SERVICE', vendorId }).then(({ data }) => setServiceCategories(data)).catch(() => setServiceCategories([]));
    listCategories(token, { type: 'PRODUCT', vendorId }).then(({ data }) => setProductCategories(data)).catch(() => setProductCategories([]));
    listCategories(token, { type: 'THERAPY', vendorId }).then(({ data }) => setTherapyCategories(data)).catch(() => setTherapyCategories([]));
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
      const { data } = vendor
        ? await updateVendor(token, vendor.id, { ownerUserId: pendingOwner.id })
        : await createVendor(token, { ownerUserId: pendingOwner.id });
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

  if (!vendor) {
    return (
      <div className="admin-page">
        {error && <p className="error-state" role="alert">{error}</p>}
        <VendorUserPicker selectedUser={pendingOwner} onSelect={setPendingOwner} />
        <div className="form-actions">
          <FilledButton ref={saveButtonRef} onClick={saveUser} disabled={!pendingOwner || saving}>
            {saving ? 'Creating…' : 'Create Vendor'}
          </FilledButton>
        </div>
      </div>
    );
  }

  const kycDocOk = hasMinimumKycDocument(vendor);

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
            onKycReview={onKycReview}
            serverFieldErrors={fieldErrors}
          />
          {!kycDocOk && (
            <p className="error-state" role="alert">
              Upload at least one KYC document (GST, PAN, or Aadhaar) before continuing.
            </p>
          )}

          <h3 className="section-title">Profile Image</h3>
          <MediaUploader
            entityType="vendor"
            entityId={vendor.id}
            existingImages={vendor.mediaImages ?? []}
            existingVideo={vendor.mediaVideo ?? null}
            token={token}
          />

          <div className="form-actions">
            <FilledButton onClick={() => setActiveStep(2)} disabled={!kycDocOk}>
              Continue
            </FilledButton>
          </div>
        </section>
      )}

      {activeStep === 2 && (
        <section aria-label="Branches, Modules & Category Access">
          <h2 className="section-title">Step 2: Branches, Modules &amp; Category Access</h2>
          <VendorModulesAndCategoryAccess
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
          <VendorBranchListStep token={token} vendorId={vendor.id} canEdit branches={branches} onBranchesChange={handleBranchesChange} />
        </section>
      )}

      {activeStep === 3 && (
        <>
          <h2 className="section-title">Step 3: Deals</h2>
          <VendorDealsStep
            token={token}
            vendorId={vendor.id}
            canEdit
            canApprove={Boolean(canApprove)}
            branches={branches}
            categories={serviceCategories}
            products={products}
          />
        </>
      )}

      {activeStep === 4 && (
        <>
          <h2 className="section-title">Step 4: Therapy</h2>
          <VendorTherapistsStep
            token={token}
            vendorId={vendor.id}
            canEdit
            offersTherapy={vendor.offersTherapy}
            branches={branches}
            categories={therapyCategories}
            onTherapistsChange={setTherapists}
          />
        </>
      )}

      {activeStep === 5 && (
        <>
          <h2 className="section-title">Step 5: Products</h2>
          <VendorProductsStep
            token={token}
            vendorId={vendor.id}
            canEdit
            offersProduct={vendor.offersProduct}
            categories={productCategories}
            onProductsChange={setProducts}
          />
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
