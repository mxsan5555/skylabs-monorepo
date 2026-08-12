import { useEffect, useState } from 'react';
import { FilledButton, OutlinedButton, OutlinedTextField, Icon } from '@skylabs-monorepo/shared-ui/react';
import type { KycDocument, Vendor, VendorFields } from '../../../../api/rbac/vendors';

const EMPTY_FORM: VendorFields = {
  businessName: '',
  legalName: '',
  businessType: '',
  businessDescription: '',
  businessEmail: '',
  businessPhone: '',
  alternatePhone: '',
  website: '',
  logoUrl: '',
  ownerName: '',
  contactPerson: '',
  ownerEmail: '',
  ownerMobile: '',
  alternateOwnerMobile: '',
  address: '',
  city: '',
  state: '',
  country: '',
  pincode: '',
  gstNumber: '',
  panNumber: '',
  businessRegistrationNumber: '',
  kycDocuments: [],
  bankAccountHolder: '',
  bankName: '',
  bankAccountNumber: '',
  bankIfsc: '',
  upiId: '',
};

function toFormFields(vendor: Vendor | null): VendorFields {
  if (!vendor) return { ...EMPTY_FORM };
  const fields = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM) as (keyof VendorFields)[]) {
    // Skip both undefined (field simply absent from the response) and null (e.g. businessName
    // before Step 2 is filled in) — either way the EMPTY_FORM default ('' / []) is correct.
    if (vendor[key] !== undefined && vendor[key] !== null) (fields as Record<string, unknown>)[key] = vendor[key];
  }
  return fields;
}

/** Strips empty-string optional fields so PATCH bodies don't send `""` where the API expects `undefined`. */
function cleanForSubmit(form: VendorFields): VendorFields {
  const entries = Object.entries(form).filter(([, value]) => value !== '');
  return Object.fromEntries(entries) as VendorFields;
}

export type VendorFormSection = 'business' | 'owner' | 'address' | 'kyc' | 'bank';
const ALL_SECTIONS: VendorFormSection[] = ['business', 'owner', 'address', 'kyc', 'bank'];

interface VendorProfileFormProps {
  vendor: Vendor | null;
  canEdit: boolean;
  canReviewKyc: boolean;
  saving: boolean;
  onSave: (input: VendorFields) => void;
  onKycReview?: (kycStatus: 'VERIFIED' | 'REJECTED', rejectionReason?: string) => void;
  onSubmitForVerification?: () => void;
  /** Which field groups to render — defaults to all (the existing self-service single-page
   *  usage). The admin onboarding pipeline passes a single section per step. */
  sections?: VendorFormSection[];
  /** Overrides the built-in save button's label — the pipeline uses "Save & Continue". */
  saveLabel?: string;
}

/**
 * The Business/Owner/Address/KYC/Bank multi-section form — reused for both admin
 * create-or-edit-any-vendor (one section at a time, via `sections`, in the onboarding
 * pipeline) and vendor self-service create-or-edit-own-profile (all sections at once).
 */
export function VendorProfileForm({
  vendor,
  canEdit,
  canReviewKyc,
  saving,
  onSave,
  onKycReview,
  onSubmitForVerification,
  sections = ALL_SECTIONS,
  saveLabel,
}: VendorProfileFormProps) {
  const [form, setForm] = useState<VendorFields>(() => toFormFields(vendor));
  const [kycRejectReason, setKycRejectReason] = useState('');
  const show = (section: VendorFormSection) => sections.includes(section);

  useEffect(() => {
    setForm(toFormFields(vendor));
  }, [vendor]);

  const set = <K extends keyof VendorFields>(key: K, value: VendorFields[K]) => setForm((f) => ({ ...f, [key]: value }));
  const text = (key: keyof VendorFields) => (e: Event) => set(key, (e.target as HTMLInputElement).value as never);

  const documents: KycDocument[] = form.kycDocuments ?? [];
  const setDocuments = (docs: KycDocument[]) => set('kycDocuments', docs);

  const canSubmitForVerification =
    Boolean(onSubmitForVerification) && vendor && (vendor.status === 'PROFILE_INCOMPLETE' || vendor.status === 'REJECTED');

  return (
    <div className="form-grid">
      {vendor?.profileCompletion && (
        <section aria-label="Profile completion">
          <h3 className="section-title">Profile Completion: {vendor.profileCompletion.percent}%</h3>
          <ul className="entity-list">
            {vendor.profileCompletion.sections.map((s) => (
              <li key={s.key}>
                {s.complete ? '✓' : '✗'} {s.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {vendor?.status === 'REJECTED' && vendor.statusReason && (
        <p className="error-state" role="alert">Rejected: {vendor.statusReason}</p>
      )}
      {vendor?.kycStatus === 'REJECTED' && vendor.kycRejectionReason && (
        <p className="error-state" role="alert">KYC rejected: {vendor.kycRejectionReason}</p>
      )}

      {show('business') && (
        <>
          <h3 className="section-title">Business Details</h3>
          <OutlinedTextField label="Business name" value={form.businessName ?? ''} disabled={!canEdit} onInput={text('businessName')} />
          <OutlinedTextField label="Legal name" value={form.legalName ?? ''} disabled={!canEdit} onInput={text('legalName')} />
          <OutlinedTextField label="Business type" value={form.businessType ?? ''} disabled={!canEdit} onInput={text('businessType')} />
          <OutlinedTextField label="Description" value={form.businessDescription ?? ''} disabled={!canEdit} onInput={text('businessDescription')} />
          <OutlinedTextField label="Business email" type="email" value={form.businessEmail ?? ''} disabled={!canEdit} onInput={text('businessEmail')} />
          <OutlinedTextField label="Business phone" type="tel" value={form.businessPhone ?? ''} disabled={!canEdit} onInput={text('businessPhone')} />
          <OutlinedTextField label="Alternate phone" type="tel" value={form.alternatePhone ?? ''} disabled={!canEdit} onInput={text('alternatePhone')} />
          <OutlinedTextField label="Website" value={form.website ?? ''} disabled={!canEdit} onInput={text('website')} />
          <OutlinedTextField label="Logo URL" value={form.logoUrl ?? ''} disabled={!canEdit} onInput={text('logoUrl')} />
        </>
      )}

      {show('owner') && (
        <>
          <h3 className="section-title">Owner Details</h3>
          <OutlinedTextField label="Owner name" value={form.ownerName ?? ''} disabled={!canEdit} onInput={text('ownerName')} />
          <OutlinedTextField label="Contact person" value={form.contactPerson ?? ''} disabled={!canEdit} onInput={text('contactPerson')} />
          <OutlinedTextField label="Owner email" type="email" value={form.ownerEmail ?? ''} disabled={!canEdit} onInput={text('ownerEmail')} />
          <OutlinedTextField label="Owner mobile" type="tel" value={form.ownerMobile ?? ''} disabled={!canEdit} onInput={text('ownerMobile')} />
          <OutlinedTextField label="Alternate mobile" type="tel" value={form.alternateOwnerMobile ?? ''} disabled={!canEdit} onInput={text('alternateOwnerMobile')} />
        </>
      )}

      {show('address') && (
        <>
          <h3 className="section-title">Address</h3>
          <OutlinedTextField label="Address" value={form.address ?? ''} disabled={!canEdit} onInput={text('address')} />
          <OutlinedTextField label="City" value={form.city ?? ''} disabled={!canEdit} onInput={text('city')} />
          <OutlinedTextField label="State" value={form.state ?? ''} disabled={!canEdit} onInput={text('state')} />
          <OutlinedTextField label="Country" value={form.country ?? ''} disabled={!canEdit} onInput={text('country')} />
          <OutlinedTextField label="Pincode" value={form.pincode ?? ''} disabled={!canEdit} onInput={text('pincode')} />
        </>
      )}

      {show('kyc') && (
        <>
          <h3 className="section-title">Business / KYC</h3>
          <OutlinedTextField label="GST number" value={form.gstNumber ?? ''} disabled={!canEdit} onInput={text('gstNumber')} />
          <OutlinedTextField label="PAN number" value={form.panNumber ?? ''} disabled={!canEdit} onInput={text('panNumber')} />
          <OutlinedTextField label="Business registration no." value={form.businessRegistrationNumber ?? ''} disabled={!canEdit} onInput={text('businessRegistrationNumber')} />

          <fieldset>
            <legend>KYC documents</legend>
            {documents.map((doc, i) => (
              <div className="form-grid" key={i}>
                <OutlinedTextField
                  label="Document type"
                  value={doc.type}
                  disabled={!canEdit}
                  onInput={(e: Event) => setDocuments(documents.map((d, idx) => (idx === i ? { ...d, type: (e.target as HTMLInputElement).value } : d)))}
                />
                <OutlinedTextField
                  label="Document URL"
                  value={doc.url}
                  disabled={!canEdit}
                  onInput={(e: Event) => setDocuments(documents.map((d, idx) => (idx === i ? { ...d, url: (e.target as HTMLInputElement).value } : d)))}
                />
                {canEdit && (
                  <OutlinedButton onClick={() => setDocuments(documents.filter((_, idx) => idx !== i))}>
                    <Icon slot="icon" aria-hidden="true">delete</Icon>
                    Remove
                  </OutlinedButton>
                )}
              </div>
            ))}
            {canEdit && (
              <OutlinedButton onClick={() => setDocuments([...documents, { type: '', url: '' }])}>
                <Icon slot="icon" aria-hidden="true">add</Icon>
                Add document
              </OutlinedButton>
            )}
          </fieldset>

          {canReviewKyc && onKycReview && (
            <fieldset>
              <legend>Review KYC (current: {vendor?.kycStatus ?? 'PENDING'})</legend>
              <FilledButton onClick={() => onKycReview('VERIFIED')}>Verify KYC</FilledButton>
              <OutlinedTextField
                label="Rejection reason"
                value={kycRejectReason}
                onInput={(e: Event) => setKycRejectReason((e.target as HTMLInputElement).value)}
              />
              <OutlinedButton onClick={() => onKycReview('REJECTED', kycRejectReason)} disabled={!kycRejectReason.trim()}>
                Reject KYC
              </OutlinedButton>
            </fieldset>
          )}
        </>
      )}

      {show('bank') && (
        <>
          <h3 className="section-title">Bank Details</h3>
          <OutlinedTextField label="Account holder" value={form.bankAccountHolder ?? ''} disabled={!canEdit} onInput={text('bankAccountHolder')} />
          <OutlinedTextField label="Bank name" value={form.bankName ?? ''} disabled={!canEdit} onInput={text('bankName')} />
          <OutlinedTextField label="Account number" value={form.bankAccountNumber ?? ''} disabled={!canEdit} onInput={text('bankAccountNumber')} />
          <OutlinedTextField label="IFSC" value={form.bankIfsc ?? ''} disabled={!canEdit} onInput={text('bankIfsc')} />
          <OutlinedTextField label="UPI ID" value={form.upiId ?? ''} disabled={!canEdit} onInput={text('upiId')} />
        </>
      )}

      {canEdit && (
        <div className="form-actions">
          <FilledButton
            onClick={() => onSave(cleanForSubmit(form))}
            disabled={saving || (show('business') && !(form.businessName ?? '').trim())}
          >
            {saving ? 'Saving…' : (saveLabel ?? (vendor ? 'Save profile' : 'Create vendor'))}
          </FilledButton>
          {canSubmitForVerification && (
            <OutlinedButton onClick={onSubmitForVerification}>Submit for verification</OutlinedButton>
          )}
        </div>
      )}
    </div>
  );
}
