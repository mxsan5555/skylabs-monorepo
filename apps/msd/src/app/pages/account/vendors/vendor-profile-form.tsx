import { useEffect, useRef, useState } from 'react';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
import { FilledButton, OutlinedButton, OutlinedTextField, Icon } from '@skylabs-monorepo/shared-ui/react';
import type { Vendor, VendorFields, VendorDocument, VendorDocumentType } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { VendorDocumentUpload } from '../../../components/vendor-document-upload';

const EMPTY_FORM: VendorFields = {
  businessName: '',
  businessDescription: '',
  businessEmail: '',
  businessPhone: '',
  ownerFirstName: '',
  ownerLastName: '',
  ownerEmail: '',
  ownerMobile: '',
  address: '',
  addressLine2: '',
  city: '',
  state: '',
  pincode: '',
  latitude: undefined,
  longitude: undefined,
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
const PHONE_FIELDS: (keyof VendorFields)[] = ['businessPhone', 'ownerMobile'];

function stripIndiaPrefix(value: string): string {
  const digitsOnly = value.replace(/\D/g, '');
  return digitsOnly.length === 12 && digitsOnly.startsWith('91') ? digitsOnly.slice(2) : digitsOnly;
}

function toFormFields(vendor: Vendor | null): VendorFields {
  if (!vendor) return { ...EMPTY_FORM };
  const fields = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM) as (keyof VendorFields)[]) {
    // Skip both undefined (field simply absent from the response) and null (e.g. businessName
    // before Step 2 is filled in) — either way the EMPTY_FORM default ('' / undefined) is correct.
    if (vendor[key] !== undefined && vendor[key] !== null) {
      const raw = vendor[key];
      (fields as Record<string, unknown>)[key] =
        PHONE_FIELDS.includes(key) && typeof raw === 'string' ? stripIndiaPrefix(raw) : raw;
    }
  }
  return fields;
}

/** Only ever picks the given keys off `form` — used to scope a save to exactly the currently
 *  visible section(s)' own fields (see `SECTION_FIELDS`), never the whole form state. This is
 *  the actual fix for a hidden/other section's stale or incomplete data riding along in a save
 *  it has nothing to do with (previously the real cause of a same-looking-but-unrelated 422). */
function pick<T extends object>(obj: T, keys: (keyof T)[]): Partial<T> {
  const result: Partial<T> = {};
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

/** Strips empty-string optional fields so PATCH bodies don't send `""` where the API expects `undefined`. */
function cleanForSubmit(form: Partial<VendorFields>): Partial<VendorFields> {
  const entries = Object.entries(form).filter(([, value]) => value !== '');
  return Object.fromEntries(entries) as Partial<VendorFields>;
}

export type VendorFormSection = 'business' | 'owner' | 'address' | 'kyc' | 'bank';
const ALL_SECTIONS: VendorFormSection[] = ['business', 'owner', 'address', 'kyc', 'bank'];

/** Which `VendorFields` keys render in each section — used to scope Save-time validation AND
 *  submission to only the fields the user can currently see, matching `sections`. `kyc` has no
 *  scalar fields any more (see `VendorDocumentUpload` below) — its "at least one required" rule
 *  is enforced separately, based on real uploaded/staged documents, not a form field. */
const SECTION_FIELDS: Record<VendorFormSection, (keyof VendorFields)[]> = {
  business: ['businessName', 'businessDescription', 'businessEmail', 'businessPhone'],
  owner: ['ownerFirstName', 'ownerLastName', 'ownerEmail', 'ownerMobile'],
  address: ['address', 'addressLine2', 'city', 'state', 'pincode', 'latitude', 'longitude'],
  kyc: [],
  bank: ['bankAccountHolder', 'bankName', 'bankAccountNumber', 'bankIfsc', 'upiId'],
};

/** Required (non-empty) fields per section — everything else in `SECTION_FIELDS` is optional.
 *  Drives both the inline "this field is required" messages and the Save/Create-Vendor button's
 *  enablement (see `canSubmit` below). `kyc`/`bank` have no required scalar fields. */
const REQUIRED_FIELDS: Record<VendorFormSection, (keyof VendorFields)[]> = {
  business: ['businessName', 'businessEmail', 'businessPhone'],
  owner: ['ownerFirstName', 'ownerLastName', 'ownerEmail', 'ownerMobile'],
  address: ['address', 'city', 'state', 'pincode', 'latitude', 'longitude'],
  kyc: [],
  bank: [],
};

const KYC_DOCUMENT_TYPES: { type: VendorDocumentType; label: string }[] = [
  { type: 'GST', label: 'GST Certificate' },
  { type: 'PAN', label: 'PAN Card' },
  { type: 'AADHAAR', label: 'Aadhaar Card' },
];

// ─── Field-level validation (UX only) ─────────────────────────────────────────
// Mirrors `VendorFieldsSchema` in msd-api's `vendor.schema.ts` exactly — same regexes, same
// messages — so the user sees the problem before submitting instead of only after a 422. The
// backend re-validates and remains the authority; this is not a security layer.

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

const FIELD_VALIDATORS: Partial<Record<keyof VendorFields, (value: string) => string | null>> = {
  pincode: validatePincode,
  businessPhone: validateMobileNumber,
  ownerMobile: validateMobileNumber,
  businessEmail: validateEmail,
  ownerEmail: validateEmail,
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
  /** Needed for the KYC document upload/delete calls (see `VendorDocumentUpload`) — every other
   *  save in this form goes through the parent's own `onSave`/`onKycReview` callbacks instead. */
  token: string | null;
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
  /** Self-service (`/vendors/me/kyc-documents/...`) vs. admin-on-behalf
   *  (`/vendors/:id/kyc-documents/...`) — only matters when `show('kyc')`. */
  selfService?: boolean;
}

/**
 * The Business/Personal/Address/KYC/Bank multi-section form — reused for both admin
 * create-or-edit-any-vendor (one section at a time, via `sections`, in the onboarding
 * pipeline) and vendor self-service create-or-edit-own-profile (all sections at once).
 */
export function VendorProfileForm({
  vendor,
  canEdit,
  canReviewKyc,
  saving,
  token,
  onSave,
  onKycReview,
  onSubmitForVerification,
  sections = ALL_SECTIONS,
  saveLabel,
  serverFieldErrors,
  selfService = false,
}: VendorProfileFormProps) {
  const [form, setForm] = useState<VendorFields>(() => toFormFields(vendor));
  const [kycRejectReason, setKycRejectReason] = useState('');
  const [errors, setErrors] = useState<VendorFieldErrors>({});
  // Whether each of the 3 KYC slots currently has a file — staged (pre-creation) or really
  // uploaded — reported up by each VendorDocumentUpload. Drives "at least one KYC document"
  // for the Save/Create-Vendor button, independent of `form` (KYC is file-based, not a field).
  const [kycSlotHasFile, setKycSlotHasFile] = useState<Record<VendorDocumentType, boolean>>({
    GST: false,
    PAN: false,
    AADHAAR: false,
  });
  const [documents, setDocuments] = useState<VendorDocument[]>(vendor?.documents ?? []);
  const show = (section: VendorFormSection) => sections.includes(section);

  // Same double-submit guard used by every other create flow in this app (DealDialog,
  // ProductFormDialog, TherapistFormDialog, categories.tsx) — the `saving` prop alone is a React
  // state re-render and can't stop a second click/tap/Enter that fires before that re-render
  // commits. `onSave` here is fire-and-forget (the parent owns the async lifecycle and reports
  // completion back via the `saving` prop going false again), so the guard resets itself off of
  // that prop rather than a local try/finally.
  const submittingRef = useRef(false);
  // Belt-and-suspenders on top of submittingRef: disables the actual DOM element synchronously,
  // in the same tick as the click, rather than waiting on React's `disabled={saving}` re-render
  // to commit — see vendor-branches.tsx's `DealDialog` for the reference implementation this
  // mirrors.
  const saveButtonRef = useRef<MdFilledButton>(null);

  useEffect(() => {
    setForm(toFormFields(vendor));
    setDocuments(vendor?.documents ?? []);
    setErrors({});
  }, [vendor]);

  useEffect(() => {
    if (!saving) submittingRef.current = false;
  }, [saving]);

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
  /** Latitude/Longitude are `number | undefined` on `VendorFields` (not strings, unlike every
   *  other field here) — parses the raw input text, storing `undefined` for an empty/invalid
   *  value rather than `NaN` riding into the payload. */
  const numberInput = (key: 'latitude' | 'longitude') => (e: Event) => {
    const raw = (e.target as HTMLInputElement).value;
    const parsed = raw.trim() === '' ? undefined : Number(raw);
    set(key, (parsed === undefined || Number.isNaN(parsed) ? undefined : parsed) as never);
  };

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

  const canSubmitForVerification =
    Boolean(onSubmitForVerification) && vendor && (vendor.status === 'PROFILE_INCOMPLETE' || vendor.status === 'REJECTED');

  /** Required-field-non-empty AND no active inline error, across every currently-shown
   *  section — plus, when `show('kyc')`, at least one of the 3 KYC slots has a file (uploaded or
   *  staged pre-creation). This is what actually gates the Save/Create-Vendor button now,
   *  replacing the old "businessName only" check. Also re-checked inside `handleSave` itself
   *  (not just the button's `disabled` prop) — belt-and-suspenders against anything that could
   *  invoke it despite the button appearing disabled (e.g. an Enter keypress). */
  const requiredFieldsFilled = sections.every((section) =>
    REQUIRED_FIELDS[section].every((key) => {
      const value = form[key];
      return value !== undefined && value !== null && String(value).trim() !== '';
    }),
  );
  const noActiveErrors = Object.values(errors).every((message) => !message);
  const kycSatisfied = !show('kyc') || Object.values(kycSlotHasFile).some(Boolean);
  const canSubmit = requiredFieldsFilled && noActiveErrors && kycSatisfied;

  const handleSave = () => {
    if (submittingRef.current) return;
    if (!validateVisibleFields()) return;
    if (!canSubmit) return;
    submittingRef.current = true;
    // Disables the real DOM element in the same synchronous tick, rather than waiting on
    // React's `disabled={saving}` re-render to commit — see saveButtonRef's own doc comment.
    if (saveButtonRef.current) saveButtonRef.current.disabled = true;
    // Only the currently visible section(s)' own fields are ever submitted — the actual fix for
    // a hidden section's stale/incomplete data riding along in an unrelated save (see `pick`'s
    // own doc comment).
    const visibleKeys = sections.flatMap((s) => SECTION_FIELDS[s]);
    onSave(cleanForSubmit(pick(form, visibleKeys)) as VendorFields);
  };

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
            error={Boolean(errors.businessName)}
          />
          {errors.businessName && <p className="error-state" role="alert">{errors.businessName}</p>}
          <OutlinedTextField label="Description" value={form.businessDescription ?? ''} disabled={!canEdit} onInput={text('businessDescription')} />
          <OutlinedTextField
            label="Business email"
            type="email"
            value={form.businessEmail ?? ''}
            disabled={!canEdit}
            onInput={text('businessEmail')}
            error={Boolean(errors.businessEmail)}
          />
          {errors.businessEmail && <p className="error-state" role="alert">{errors.businessEmail}</p>}
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
        </>
      )}

      {show('owner') && (
        <>
          <h3 className="section-title">Personal Information</h3>
          <OutlinedTextField label="First Name" value={form.ownerFirstName ?? ''} disabled={!canEdit} onInput={text('ownerFirstName')} />
          <OutlinedTextField label="Last Name" value={form.ownerLastName ?? ''} disabled={!canEdit} onInput={text('ownerLastName')} />
          <OutlinedTextField
            label="Phone Number"
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
            label="Email"
            type="email"
            value={form.ownerEmail ?? ''}
            disabled={!canEdit}
            onInput={text('ownerEmail')}
            error={Boolean(errors.ownerEmail)}
          />
          {errors.ownerEmail && <p className="error-state" role="alert">{errors.ownerEmail}</p>}
        </>
      )}

      {show('address') && (
        <>
          <h3 className="section-title">Registered Address</h3>
          <OutlinedTextField label="Address 1" value={form.address ?? ''} disabled={!canEdit} onInput={text('address')} />
          <OutlinedTextField label="Address 2" value={form.addressLine2 ?? ''} disabled={!canEdit} onInput={text('addressLine2')} />
          <OutlinedTextField label="City" value={form.city ?? ''} disabled={!canEdit} onInput={text('city')} />
          <OutlinedTextField label="State" value={form.state ?? ''} disabled={!canEdit} onInput={text('state')} />
          <OutlinedTextField
            label="PIN Code"
            value={form.pincode ?? ''}
            disabled={!canEdit}
            onInput={text('pincode')}
            error={Boolean(errors.pincode)}
          />
          {errors.pincode && <p className="error-state" role="alert">{errors.pincode}</p>}
          <OutlinedTextField
            label="Latitude"
            type="number"
            value={form.latitude !== undefined ? String(form.latitude) : ''}
            disabled={!canEdit}
            onInput={numberInput('latitude')}
          />
          <OutlinedTextField
            label="Longitude"
            type="number"
            value={form.longitude !== undefined ? String(form.longitude) : ''}
            disabled={!canEdit}
            onInput={numberInput('longitude')}
          />
        </>
      )}

      {show('kyc') && (
        <>
          <h3 className="section-title">KYC Documents</h3>
          <p className="field-hint">Upload any ONE of the following.</p>
          {KYC_DOCUMENT_TYPES.map(({ type, label }) => (
            <VendorDocumentUpload
              key={type}
              documentType={type}
              label={label}
              vendorId={vendor?.id ?? null}
              selfService={selfService}
              existingDocument={documents.find((d) => d.documentType === type)}
              token={token}
              onUploaded={(doc) => setDocuments((prev) => [...prev.filter((d) => d.documentType !== type), doc])}
              onDeleted={() => setDocuments((prev) => prev.filter((d) => d.documentType !== type))}
              onStagedChange={(hasFile) => setKycSlotHasFile((prev) => ({ ...prev, [type]: hasFile }))}
            />
          ))}

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
            ref={saveButtonRef}
            onClick={handleSave}
            disabled={saving || !canSubmit}
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

export default VendorProfileForm;
