import { useEffect, useState } from 'react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { OutlinedButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import type { Vendor } from '../../../../api/rbac/vendors';
import { VendorProfileForm, type VendorFormSection } from './vendor-profile-form';
import { useMyVendor } from './vendors';

const STEPS: { key: VendorFormSection; label: string }[] = [
  { key: 'business', label: 'Business Details' },
  { key: 'owner', label: 'Owner Details' },
  { key: 'address', label: 'Business Address' },
  { key: 'kyc', label: 'Business / KYC' },
  { key: 'bank', label: 'Bank Details' },
];

/** How many of the 5 sections are unlocked, based on the *live* database state
 *  (`profileCompletion`) — never client-only state, so a refresh never loses progress.
 *  Mirrors `unlockedUpTo` in `vendor-pipeline.tsx` (the admin onboarding pipeline), minus its
 *  Step 1 "Vendor User" step — self-service has no such step, the vendor IS the logged-in
 *  user, resolved server-side from the JWT on every `/vendors/me*` call. */
function unlockedUpTo(vendor: Vendor | null): number {
  const sections = vendor?.profileCompletion?.sections ?? [];
  let i = 0;
  while (i < STEPS.length && sections[i]?.complete) i++;
  return Math.min(i + 1, STEPS.length);
}

/**
 * Split-out half of the old combined "My Business" page: just the Business/Owner/Address/
 * KYC/Bank profile form, on its own route/nav item ("Business Profile"). Reuses `useMyVendor`
 * (the same fetch/save/submit implementation the combined page and "Branches & Deals" share)
 * and `VendorProfileForm` exactly as-is.
 *
 * Renders one section at a time (same small-step UX as the admin `VendorPipeline`) instead of
 * the old single ~27-field scroll — but does NOT reuse `VendorPipeline` itself: that component
 * hardcodes the *admin* `POST /vendors` / `PATCH /vendors/:id` calls (gated server-side by
 * `vendors:create`/`vendors:edit`), plus an admin-only "Vendor User" picker step. The `vendor`
 * role only ever holds `vendors:custom` (see `vendors.tsx`'s SuperAdmin note — a role never
 * gets a permission wider than it needs), so wiring this self-service page to `VendorPipeline`
 * would 403 on every save. This composes the same `VendorProfileForm` building block
 * `VendorPipeline` uses internally, one `sections` entry per step, driven by `useMyVendor`'s
 * `save`/`submit` so every request still goes through the correct `/vendors/me*` surface.
 */
export function VendorBusinessProfile() {
  const { token } = useAuth();
  const { vendor, notFound, loading, saving, message, error, save, submit } = useMyVendor(token);

  const [step, setStep] = useState(() => unlockedUpTo(vendor));
  const maxUnlocked = unlockedUpTo(vendor);

  // Advance past a step the moment its section is persisted as complete — mirrors
  // `VendorPipeline`'s explicit "Save & Continue" step-forward, driven off the same
  // server-computed `profileCompletion` signal instead of a save-callback return value
  // (`useMyVendor.save` is fire-and-forget from the form's point of view).
  useEffect(() => {
    if (maxUnlocked > step) setStep(maxUnlocked);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only reacts to maxUnlocked changing
  }, [maxUnlocked]);

  const goToStep = (n: number) => {
    if (n < 1 || n > STEPS.length) return;
    if (n > maxUnlocked) return; // future incomplete steps stay locked
    setStep(n);
  };

  if (loading) {
    return (
      <div className="admin-page">
        <p className="loading-state">Loading your business profile…</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page--wide">
      <title>Business Profile · MSD</title>
      <header className="page-head">
        <div>
          <h1>Business Profile</h1>
          <p>{notFound ? 'Complete your business profile to get started.' : `Status: ${vendor?.status}`}</p>
        </div>
      </header>

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      <ol className="page-head__actions" aria-label="Business profile steps">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const unlocked = n <= maxUnlocked;
          return (
            <li key={s.key}>
              <button
                type="button"
                className={`status-pill ${n === step ? 'status-pill--active' : 'status-pill--inactive'}`}
                disabled={!unlocked}
                aria-current={n === step ? 'step' : undefined}
                onClick={() => goToStep(n)}
              >
                <Icon aria-hidden="true">{n < maxUnlocked ? 'check_circle' : unlocked ? 'radio_button_checked' : 'lock'}</Icon>
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      <VendorProfileForm
        vendor={vendor}
        canEdit
        canReviewKyc={false}
        saving={saving}
        sections={[STEPS[step - 1].key]}
        saveLabel="Save & Continue"
        onSave={save}
        onSubmitForVerification={submit}
      />

      {step > 1 && (
        <div className="form-actions">
          <OutlinedButton onClick={() => goToStep(step - 1)}>Back</OutlinedButton>
        </div>
      )}
    </div>
  );
}

export default VendorBusinessProfile;
