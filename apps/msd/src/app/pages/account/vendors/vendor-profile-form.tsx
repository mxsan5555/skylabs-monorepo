import { useEffect, useState } from 'react';
import { FilledButton, OutlinedButton, OutlinedTextField, Icon } from '@skylabs-monorepo/shared-ui/react';
import type { KycDocument, Vendor, VendorFields } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

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

/** Vendor phone fields — see this file's own phone-validation doc comment below. The backend
 *  always stores these `+91`-prefixed (`vendorPhoneSchema`'s `normalizeIdentifier()` transform).
 *  The form only ever works with plain 10-digit values, so a `+91` prefix from a previously
 *  saved vendor must be stripped before it ever reaches form state — otherwise editing an
 *  existing vendor starts from a 13-character `+91XXXXXXXXXX` string instead of a clean
 *  10-digit one, which is what made a correct-looking edit intermittently fail validation. */
const PHONE_FIELDS: (keyof VendorFields)[] = ['businessPhone', 'alternatePhone', 'ownerMobile', 'alternateOwnerMobile'];

function stripIndiaPrefix(value: string): string {
  const digitsOnly = value.replace(/\D/g, '');
  return digitsOnly.length === 12 && digitsOnly.startsWith('91') ? digitsOnly.slice(2) : digitsOnly;
}

function toFormFields(vendor: Vendor | null): VendorFields {
  if (!vendor) return { ...EMPTY_FORM };
  const fields = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM) as (keyof VendorFields)[]) {
    // Skip both undefined (field simply absent from the response) and null (e.g. businessName
    // before Step 2 is filled in) — either way the EMPTY_FORM default ('' / []) is correct.
    if (vendor[key] !== undefined && vendor[key] !== null) {
      const raw = vendor[key];
      (fields as Record<string, unknown>)[key] =
        PHONE_FIELDS.includes(key) && typeof raw === 'string' ? stripIndiaPrefix(raw) : raw;
    }
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

/** Which `VendorFields` keys render in each section — used to scope Save-time validation to
 *  only the fields the user can currently see, matching `sections`. */
const SECTION_FIELDS: Record<VendorFormSection, (keyof VendorFields)[]> = {
  business: ['businessName', 'legalName', 'businessType', 'businessDescription', 'businessEmail', 'businessPhone', 'alternatePhone', 'website', 'logoUrl'],
  owner: ['ownerName', 'contactPerson', 'ownerEmail', 'ownerMobile', 'alternateOwnerMobile'],
  address: ['address', 'city', 'state', 'country', 'pincode'],
  kyc: ['gstNumber', 'panNumber', 'businessRegistrationNumber'],
  bank: ['bankAccountHolder', 'bankName', 'bankAccountNumber', 'bankIfsc', 'upiId'],
};

// ─── Field-level validation (UX only) ─────────────────────────────────────────
// Mirrors `VendorFieldsSchema` in msd-api's `vendor.schema.ts` exactly — same regexes, same
// messages — so the user sees the problem before submitting instead of only after a 422. The
// backend re-validates and remains the authority; this is not a security layer.

const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}[Z]{1}[A-Z\d]{1}$/;
const PAN_REGEX = /^[A-Z]{5}\d{4}[A-Z]{1}$/;
const PINCODE_REGEX = /^\d{6}$/;
/** Canonical Indian mobile rule (the ONLY mobile regex in this file — matches msd-api's
 *  `INDIA_MOBILE_LOCAL_REGEX` in `vendor.schema.ts` character-for-character, just applied to
 *  the plain 10-digit value this form always holds instead of the `+91`-prefixed value the
 *  backend stores). First digit 6-9, exactly 10 digits — no more, no less. */
const INDIA_MOBILE_REGEX = /^[6-9]\d{9}$/;
/** Deliberately simple (not RFC 5322) — mirrors the intent of msd-api's `z.string().email()`
 *  closely enough to catch obviously-invalid input before submit; the backend remains the
 *  authority (see this section's own doc comment above). */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_REGEX = /^https?:\/\/.+/i;

function validateGstNumber(value: string): string | null {
  if (!value) return null;
  return GSTIN_REGEX.test(value.toUpperCase()) ? null : 'Enter a valid 15-character GST number';
}

function validatePanNumber(value: string): string | null {
  if (!value) return null;
  return PAN_REGEX.test(value.toUpperCase()) ? null : 'Enter a valid 10-character PAN number';
}

function validatePincode(value: string): string | null {
  if (!value) return null;
  return PINCODE_REGEX.test(value) ? null : 'Enter a valid 6-digit pincode';
}

function validateMobileNumber(value: string): string | null {
  if (!value) return null;
  return INDIA_MOBILE_REGEX.test(value) ? null : 'Enter a valid 10-digit mobile number';
}

function validateEmail(value: string): string | null {
  if (!value) return null;
  return EMAIL_REGEX.test(value) ? null : 'Enter a valid email address';
}

function validateWebsite(value: string): string | null {
  if (!value) return null;
  return URL_REGEX.test(value) ? null : 'Enter a valid URL (starting with http:// or https://)';
}

const FIELD_VALIDATORS: Partial<Record<keyof VendorFields, (value: string) => string | null>> = {
  gstNumber: validateGstNumber,
  panNumber: validatePanNumber,
  pincode: validatePincode,
  businessPhone: validateMobileNumber,
  alternatePhone: validateMobileNumber,
  ownerMobile: validateMobileNumber,
  alternateOwnerMobile: validateMobileNumber,
  businessEmail: validateEmail,
  ownerEmail: validateEmail,
  website: validateWebsite,
};

/** Extracts a flat `{field: message}` map from a 422's Zod-flattened `details.fieldErrors`
 *  (see msd-api's `middleware/validate.ts`) — first message per field only, matching how this
 *  form already surfaces one message per field. Returns `null` for anything else (network
 *  error, a non-validation ApiError, etc.) so the caller falls back to its own generic message. */
export function extractVendorFieldErrors(err: unknown): VendorFieldErrors | null {
  if (!(err instanceof ApiRequestError) || err.code !== 'VALIDATION_ERROR') return null;
  const details = err.details as { fieldErrors?: Record<string, string[]> } | undefined;
  if (!details?.fieldErrors) return null;
  const flat: VendorFieldErrors = {};
  for (const [key, messages] of Object.entries(details.fieldErrors)) {
    if (messages?.[0]) flat[key as keyof VendorFields] = messages[0];
  }
  return Object.keys(flat).length > 0 ? flat : null;
}

export type VendorFieldErrors = Partial<Record<keyof VendorFields, string>>;

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
  /** Set by the parent after a failed save whose 422 response carried per-field messages (see
   *  `extractVendorFieldErrors`) — merged into this form's own `errors` state so a field the
   *  frontend's own `FIELD_VALIDATORS` missed still gets a correct inline error instead of only
   *  a generic top-level toast. */
  serverFieldErrors?: VendorFieldErrors | null;
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
  serverFieldErrors,
}: VendorProfileFormProps) {
  const [form, setForm] = useState<VendorFields>(() => toFormFields(vendor));
  const [kycRejectReason, setKycRejectReason] = useState('');
  const [errors, setErrors] = useState<VendorFieldErrors>({});
  const show = (section: VendorFormSection) => sections.includes(section);

  useEffect(() => {
    setForm(toFormFields(vendor));
    setErrors({});
  }, [vendor]);

  useEffect(() => {
    if (serverFieldErrors && Object.keys(serverFieldErrors).length > 0) {
      setErrors((e) => ({ ...e, ...serverFieldErrors }));
    }
  }, [serverFieldErrors]);

  const set = <K extends keyof VendorFields>(key: K, value: VendorFields[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear a field's inline error as soon as the user edits it — the next Save click
    // re-validates and re-populates it if the new value is still bad.
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };
  const text = (key: keyof VendorFields) => (e: Event) => set(key, (e.target as HTMLInputElement).value as never);
  /** Phone fields only ever hold digits, max 10 — strips anything else (letters, spaces,
   *  `+`/`-`, a pasted `+91` prefix) on every keystroke AND on paste, since a paste also fires
   *  `input`. Re-reads the resulting `e.target.value`, so a pasted "+91 98765-43210" or
   *  "98765abc10" both collapse to a clean "9876543210" — the browser's own input element is
   *  then re-synced to the filtered value on the next render via the controlled `value` prop. */
  const phoneInput = (key: keyof VendorFields) => (e: Event) => {
    const digitsOnly = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 10);
    set(key, digitsOnly as never);
  };

  const businessNameError =
    show('business') && !(form.businessName ?? '').trim() ? 'This field is required' : null;

  /** Validates every field in the currently rendered `sections` only — fields the user can't
   *  see right now are never checked, matching how each admin-pipeline/self-service step
   *  saves one section at a time. Returns whether the visible fields are all valid. */
  const validateVisibleFields = (): boolean => {
    const nextErrors: VendorFieldErrors = {};
    for (const section of sections) {
      for (const key of SECTION_FIELDS[section]) {
        const validator = FIELD_VALIDATORS[key];
        if (!validator) continue;
        const message = validator((form[key] as string | undefined) ?? '');
        if (message) nextErrors[key] = message;
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateVisibleFields()) return;
    onSave(cleanForSubmit(form));
  };

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
          <OutlinedTextField
            label="Business name"
            value={form.businessName ?? ''}
            disabled={!canEdit}
            onInput={text('businessName')}
            error={Boolean(businessNameError)}
          />
          {businessNameError && <p className="error-state" role="alert">{businessNameError}</p>}
          <OutlinedTextField label="Legal name" value={form.legalName ?? ''} disabled={!canEdit} onInput={text('legalName')} />
          <OutlinedTextField label="Business type" value={form.businessType ?? ''} disabled={!canEdit} onInput={text('businessType')} />
          <OutlinedTextField label="Description" value={form.businessDescription ?? ''} disabled={!canEdit} onInput={text('businessDescription')} />
          <OutlinedTextField label="Business email" type="email" value={form.businessEmail ?? ''} disabled={!canEdit} onInput={text('businessEmail')} />
          <OutlinedTextField
            label="Business phone"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={form.businessPhone ?? ''}
            disabled={!canEdit}
            onInput={phoneInput('businessPhone')}
            error={Boolean(errors.businessPhone)}
          />
          {errors.businessPhone && <p className="error-state" role="alert">{errors.businessPhone}</p>}
          <OutlinedTextField
            label="Alternate phone"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={form.alternatePhone ?? ''}
            disabled={!canEdit}
            onInput={phoneInput('alternatePhone')}
            error={Boolean(errors.alternatePhone)}
          />
          {errors.alternatePhone && <p className="error-state" role="alert">{errors.alternatePhone}</p>}
          <OutlinedTextField label="Website" value={form.website ?? ''} disabled={!canEdit} onInput={text('website')} />
        </>
      )}

      {show('owner') && (
        <>
          <h3 className="section-title">Owner Details</h3>
          <OutlinedTextField label="Owner name" value={form.ownerName ?? ''} disabled={!canEdit} onInput={text('ownerName')} />
          <OutlinedTextField label="Contact person" value={form.contactPerson ?? ''} disabled={!canEdit} onInput={text('contactPerson')} />
          <OutlinedTextField label="Owner email" type="email" value={form.ownerEmail ?? ''} disabled={!canEdit} onInput={text('ownerEmail')} />
          <OutlinedTextField
            label="Owner mobile"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={form.ownerMobile ?? ''}
            disabled={!canEdit}
            onInput={phoneInput('ownerMobile')}
            error={Boolean(errors.ownerMobile)}
          />
          {errors.ownerMobile && <p className="error-state" role="alert">{errors.ownerMobile}</p>}
          <OutlinedTextField
            label="Alternate mobile"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={form.alternateOwnerMobile ?? ''}
            disabled={!canEdit}
            onInput={phoneInput('alternateOwnerMobile')}
            error={Boolean(errors.alternateOwnerMobile)}
          />
          {errors.alternateOwnerMobile && <p className="error-state" role="alert">{errors.alternateOwnerMobile}</p>}
        </>
      )}

      {show('address') && (
        <>
          <h3 className="section-title">Address</h3>
          <OutlinedTextField label="Address" value={form.address ?? ''} disabled={!canEdit} onInput={text('address')} />
          <OutlinedTextField label="City" value={form.city ?? ''} disabled={!canEdit} onInput={text('city')} />
          <OutlinedTextField label="State" value={form.state ?? ''} disabled={!canEdit} onInput={text('state')} />
          <OutlinedTextField label="Country" value={form.country ?? ''} disabled={!canEdit} onInput={text('country')} />
          <OutlinedTextField
            label="Pincode"
            value={form.pincode ?? ''}
            disabled={!canEdit}
            onInput={text('pincode')}
            error={Boolean(errors.pincode)}
          />
          {errors.pincode && <p className="error-state" role="alert">{errors.pincode}</p>}
        </>
      )}

      {show('kyc') && (
        <>
          <h3 className="section-title">Business / KYC</h3>
          <OutlinedTextField
            label="GST number"
            value={form.gstNumber ?? ''}
            disabled={!canEdit}
            onInput={text('gstNumber')}
            error={Boolean(errors.gstNumber)}
          />
          {errors.gstNumber && <p className="error-state" role="alert">{errors.gstNumber}</p>}
          <OutlinedTextField
            label="PAN number"
            value={form.panNumber ?? ''}
            disabled={!canEdit}
            onInput={text('panNumber')}
            error={Boolean(errors.panNumber)}
          />
          {errors.panNumber && <p className="error-state" role="alert">{errors.panNumber}</p>}
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
            onClick={handleSave}
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
