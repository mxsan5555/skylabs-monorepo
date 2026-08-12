import { useEffect, useMemo, useState } from 'react';
import { FilledButton, OutlinedButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  createVendor,
  updateVendor,
  type UserSummary,
  type Vendor,
  type VendorFields,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { VendorUserPicker } from './vendor-user-picker';
import { VendorProfileForm, type VendorFormSection } from './vendor-profile-form';

interface StepDef {
  key: 'user' | VendorFormSection | 'review';
  label: string;
}

const STEPS: StepDef[] = [
  { key: 'user', label: 'Vendor User' },
  { key: 'business', label: 'Business Details' },
  { key: 'owner', label: 'Owner Details' },
  { key: 'address', label: 'Business Address' },
  { key: 'kyc', label: 'Business / KYC' },
  { key: 'bank', label: 'Bank Details' },
  { key: 'review', label: 'Review' },
];

/** How many of the 6 data steps are unlocked, based on the *live* database state
 *  (`profileCompletion`) — never client-only state, so a refresh never loses progress. */
function unlockedUpTo(vendor: Vendor | null): number {
  const sections = vendor?.profileCompletion?.sections ?? [];
  let i = 0;
  while (i < 6 && sections[i]?.complete) i++;
  return Math.min(i + 1, 7);
}

interface VendorPipelineProps {
  token: string | null;
  initialVendor: Vendor | null;
  /** Called after every successful per-step save (create or update) — lets the parent page
   *  keep its vendor list/selection in sync without owning any pipeline state itself. */
  onVendorChange: (vendor: Vendor) => void;
  /** Surfaced on the Business/KYC step (5) only — admin-only KYC verify/reject. */
  canReviewKyc?: boolean;
  onKycReview?: (kycStatus: 'VERIFIED' | 'REJECTED', rejectionReason?: string) => void;
}

/**
 * Admin "Add Vendor" / "Edit Vendor" — one step visible at a time, reusing the existing
 * VendorUserPicker (step 1) and VendorProfileForm (steps 2-6, one section per step) rather
 * than any new form architecture. Every step saves to the database immediately via the
 * existing POST/PATCH /vendors endpoints — there is no client-only draft state, so a browser
 * refresh mid-pipeline loses nothing (re-opening the same vendor resumes at the same step,
 * derived from `profileCompletion`, the same completion data self-service already uses).
 */
export function VendorPipeline({ token, initialVendor, onVendorChange, canReviewKyc, onKycReview }: VendorPipelineProps) {
  const [vendor, setVendor] = useState<Vendor | null>(initialVendor);
  const [pendingOwner, setPendingOwner] = useState<UserSummary | null>(initialVendor?.owner ?? null);
  const [step, setStep] = useState(() => unlockedUpTo(initialVendor));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const wasNew = useMemo(() => initialVendor === null, [initialVendor]);

  useEffect(() => {
    setVendor(initialVendor);
    setPendingOwner(initialVendor?.owner ?? null);
    setStep(unlockedUpTo(initialVendor));
    setError('');
  }, [initialVendor]);

  const maxUnlocked = unlockedUpTo(vendor);

  const goToStep = (n: number) => {
    if (n < 1 || n > 7) return;
    if (n > maxUnlocked) return; // future incomplete steps stay locked
    setStep(n);
    setError('');
  };

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
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save the vendor user.');
    } finally {
      setSaving(false);
    }
  };

  const saveSection = async (input: VendorFields, nextStep: number) => {
    if (!vendor) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await updateVendor(token, vendor.id, input);
      setVendor(data);
      onVendorChange(data);
      setStep(nextStep);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save this step — please try again.');
      // Deliberately do not advance the step on failure.
    } finally {
      setSaving(false);
    }
  };

  const finish = () => {
    if (vendor) onVendorChange(vendor);
  };

  return (
    <div className="admin-page">
      <ol className="page-head__actions" aria-label="Vendor onboarding steps">
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

      {error && <p className="error-state" role="alert">{error}</p>}

      {step === 1 && (
        <>
          <VendorUserPicker selectedUser={pendingOwner} onSelect={setPendingOwner} />
          <div className="form-actions">
            <FilledButton onClick={saveUser} disabled={saving || !pendingOwner}>
              {saving ? 'Saving…' : 'Save & Continue'}
            </FilledButton>
          </div>
        </>
      )}

      {step >= 2 && step <= 6 && vendor && (
        <>
          <VendorProfileForm
            vendor={vendor}
            canEdit
            canReviewKyc={step === 5 && Boolean(canReviewKyc)}
            saving={saving}
            sections={[STEPS[step - 1].key as VendorFormSection]}
            saveLabel="Save & Continue"
            onSave={(input) => saveSection(input, step + 1)}
            onKycReview={onKycReview}
          />
          <div className="form-actions">
            <OutlinedButton onClick={() => goToStep(step - 1)}>Back</OutlinedButton>
          </div>
        </>
      )}

      {step === 7 && vendor && (
        <>
          <ReviewSummary vendor={vendor} onEditStep={goToStep} />
          <div className="form-actions">
            <OutlinedButton onClick={() => goToStep(6)}>Back</OutlinedButton>
            <FilledButton onClick={finish} disabled={maxUnlocked < 7}>
              {wasNew ? 'Create Vendor' : 'Finish'}
            </FilledButton>
          </div>
        </>
      )}
    </div>
  );
}

function ReviewSummary({ vendor, onEditStep }: { vendor: Vendor; onEditStep: (step: number) => void }) {
  const cards: { step: number; title: string; rows: [string, string | undefined | null][] }[] = [
    {
      step: 1,
      title: 'Vendor User',
      rows: [
        ['Name', vendor.owner?.name],
        ['Email', vendor.owner?.email],
        ['Mobile', vendor.owner?.phone],
        ['Role', vendor.owner?.roles.map((r) => r.name).join(', ')],
      ],
    },
    {
      step: 2,
      title: 'Business Details',
      rows: [
        ['Business name', vendor.businessName],
        ['Business type', vendor.businessType],
        ['Email', vendor.businessEmail],
        ['Phone', vendor.businessPhone],
      ],
    },
    {
      step: 3,
      title: 'Owner Details',
      rows: [
        ['Owner name', vendor.ownerName],
        ['Contact person', vendor.contactPerson],
        ['Email', vendor.ownerEmail],
        ['Mobile', vendor.ownerMobile],
      ],
    },
    {
      step: 4,
      title: 'Business Address',
      rows: [
        ['Address', vendor.address],
        ['City', vendor.city],
        ['State', vendor.state],
        ['Country', vendor.country],
        ['Pincode', vendor.pincode],
      ],
    },
    {
      step: 5,
      title: 'Business / KYC',
      rows: [
        ['GST', vendor.gstNumber],
        ['PAN', vendor.panNumber],
        ['Registration', vendor.businessRegistrationNumber],
        ['KYC documents', vendor.kycDocuments?.length ? `${vendor.kycDocuments.length} uploaded` : 'None yet'],
      ],
    },
    {
      step: 6,
      title: 'Bank Details',
      rows: [
        ['Account holder', vendor.bankAccountHolder],
        ['Bank', vendor.bankName],
        ['Account', vendor.bankAccountNumber],
        ['IFSC', vendor.bankIfsc],
        ['UPI', vendor.upiId],
      ],
    },
  ];

  return (
    <div className="form-grid">
      {cards.map((card) => (
        <section className="panel" aria-label={card.title} key={card.step}>
          <div className="page-head">
            <h3 className="section-title">{card.title}</h3>
            <OutlinedButton onClick={() => onEditStep(card.step)}>
              <Icon slot="icon" aria-hidden="true">edit</Icon>
              Edit
            </OutlinedButton>
          </div>
          <dl>
            {card.rows.map(([label, value]) => (
              <div key={label}>
                <dt className="field-hint">{label}</dt>
                <dd>{value || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
