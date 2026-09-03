import { useState } from 'react';
import { Tabs, PrimaryTab } from '@skylabs-monorepo/shared-ui/react';
import type { Vendor, VendorFields } from '../../../../api/rbac/vendors';
import { VendorProfileForm, type VendorFormSection, type VendorFieldErrors } from './vendor-profile-form';
import { MediaUploader } from '../../../components/media-uploader';

type VendorProfileTab = VendorFormSection | 'media';

// Owner Information and Address are deliberately not tabs here — a self-service vendor no
// longer edits them from this Vendor Profile UI (Branch already carries its own address; owner
// info is still collected/reviewed wherever KYC/onboarding actually needs it — the admin
// onboarding wizard's Step 1, see vendor-pipeline.tsx — never removed from VendorProfileForm
// itself, only from this tab list).
const TAB_DEFS: { key: VendorProfileTab; label: string }[] = [
  { key: 'business', label: 'Business Information' },
  { key: 'kyc', label: 'KYC & Documents' },
  { key: 'bank', label: 'Bank Information' },
  { key: 'media', label: 'Profile Image' },
];

/**
 * The Business/Owner/Address/KYC/Bank/Profile-Image tabbed editor for an *existing* Vendor row
 * — now used only by self-service `VendorBusinessProfile` (the caller's own vendor,
 * `/vendors/me/*`). The admin surface (`VendorPipeline`, `/account/vendors/new` and the Vendor
 * Management "Overview" tab) moved off this tabbed layout onto a proper 6-step onboarding
 * wizard (`vendor-pipeline.tsx`) — its Step 1 renders `VendorProfileForm` directly (all
 * sections at once, no tab bar) instead of reusing this component. All tabs here are still
 * freely switchable — no artificial step-locking — since each tab independently PATCHes just
 * its own section via the existing `VendorProfileForm`; there is no meaningful "must finish tab
 * N before tab N+1" ordering once the vendor row itself exists. The "Profile Image" tab is the
 * one exception: it doesn't render `VendorProfileForm` at all, it renders the same
 * `MediaUploader` already used for Deal/Product/Therapist (see that component's own doc comment)
 * with `entityType="vendor"`.
 */
export function VendorProfileTabs({
  vendor,
  token,
  selfService,
  canEdit,
  canReviewKyc,
  saving,
  onSave,
  onKycReview,
  onSubmitForVerification,
  serverFieldErrors,
}: {
  vendor: Vendor;
  token: string | null;
  selfService: boolean;
  canEdit: boolean;
  canReviewKyc?: boolean;
  saving: boolean;
  onSave: (input: VendorFields) => void;
  onKycReview?: (kycStatus: 'VERIFIED' | 'REJECTED', rejectionReason?: string) => void;
  onSubmitForVerification?: () => void;
  /** See `VendorProfileForm`'s own doc comment on this same prop. */
  serverFieldErrors?: VendorFieldErrors | null;
}) {
  const [activeTab, setActiveTab] = useState<VendorProfileTab>('business');

  return (
    <>
      <div className="admin-tabs-wrap">
        <Tabs
          className="admin-tabs"
          onChange={(e) => setActiveTab(TAB_DEFS[(e.target as unknown as { activeTabIndex: number }).activeTabIndex].key)}
        >
          {TAB_DEFS.map((tab) => (
            <PrimaryTab key={tab.key} active={activeTab === tab.key}>
              {tab.label}
            </PrimaryTab>
          ))}
        </Tabs>
      </div>

      {activeTab === 'media' ? (
        <MediaUploader
          entityType="vendor"
          entityId={vendor.id}
          selfService={selfService}
          existingImages={vendor.mediaImages ?? []}
          existingVideo={vendor.mediaVideo ?? null}
          token={token}
        />
      ) : (
        <VendorProfileForm
          vendor={vendor}
          canEdit={canEdit}
          canReviewKyc={activeTab === 'kyc' && Boolean(canReviewKyc)}
          saving={saving}
          token={token}
          selfService={selfService}
          sections={[activeTab]}
          saveLabel="Save"
          onSave={onSave}
          onKycReview={onKycReview}
          onSubmitForVerification={onSubmitForVerification}
          serverFieldErrors={serverFieldErrors}
        />
      )}
    </>
  );
}
