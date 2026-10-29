import { createElement, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
import { FilledButton, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import {
  listMyKycDocuments,
  listVendorKycDocuments,
  type Vendor,
  type VendorFields,
  type VendorDocument,
  type VendorDocumentType,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { MEMBER_STATUS_LABEL } from './member-status';
import { EMAIL_REGEX, MOBILE_REGEX } from '../../../../utils/format';
import { VendorDocumentUpload } from '../../../components/vendor-document-upload';
import { STATES, citiesForState } from '@skylabs-monorepo/shared-utils';
import { asOptions, renderSelect } from './form-controls';

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
  mapLocationUrl: '',
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
        PHONE_FIELDS.includes(key) && typeof raw === 'string'
          ? stripIndiaPrefix(raw)
          : raw;
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
    if (key in obj) {
      result[key] = obj[key];
    }
  }

  return result;
}

/** Strips empty-string optional fields so PATCH bodies don't send `""` where the API expects `undefined`. */
function cleanForSubmit(form: Partial<VendorFields>): Partial<VendorFields> {
  const entries = Object.entries(form).filter(([, value]) => value !== '');
  return Object.fromEntries(entries) as Partial<VendorFields>;
}

export type VendorFormSection = 'business' | 'owner' | 'address' | 'kyc' | 'bank';

const ALL_SECTIONS: VendorFormSection[] = [
  'business',
  'owner',
  'address',
  'kyc',
  'bank',
];

/** Which `VendorFields` keys render in each section — used to scope Save-time validation AND
 *  submission to only the fields the user can currently see, matching `sections`. `kyc` has no
 *  scalar fields any more (see `VendorDocumentUpload` below) — its "at least one required" rule
 *  is enforced separately, based on real uploaded/staged documents, not a form field. */
const SECTION_FIELDS: Record<VendorFormSection, (keyof VendorFields)[]> = {
  business: [
    'businessName',
    'businessDescription',
    'businessEmail',
    'businessPhone',
  ],
  owner: [
    'ownerFirstName',
    'ownerLastName',
    'ownerEmail',
    'ownerMobile',
  ],
  address: [
    'address',
    'addressLine2',
    'city',
    'state',
    'pincode',
    'mapLocationUrl',
  ],
  kyc: [],
  bank: [
    'bankAccountHolder',
    'bankName',
    'bankAccountNumber',
    'bankIfsc',
    'upiId',
  ],
};

/** Required (non-empty) fields per section — everything else in `SECTION_FIELDS` is optional.
 *  Drives both the inline "this field is required" messages and the Save/Create-Vendor button's
 *  enablement (see `canSubmit` below). `kyc`/`bank` have no required scalar fields. */
/** Names for the fields a save can stop on, in form order (the item 8 summary alert). */
const FIELD_LABELS: Partial<Record<keyof VendorFields, string>> = {
  businessName: 'Business name',
  businessEmail: 'Business email',
  businessPhone: 'Business phone',
  ownerFirstName: 'First name',
  ownerLastName: 'Last name',
  ownerEmail: 'Email',
  ownerMobile: 'Phone number',
  address: 'Address 1',
  state: 'State',
  city: 'City',
  pincode: 'PIN code',
  mapLocationUrl: 'Map location',
  bankIfsc: 'IFSC',
  bankAccountNumber: 'Account number',
  upiId: 'UPI ID',
};

const KYC_REQUIRED = 'Upload at least one KYC document.';

const REQUIRED_FIELDS: Record<VendorFormSection, (keyof VendorFields)[]> = {
  business: ['businessName', 'businessEmail', 'businessPhone'],
  owner: ['ownerFirstName', 'ownerLastName', 'ownerEmail', 'ownerMobile'],
  address: [
    'address',
    'city',
    'state',
    'pincode',
    'mapLocationUrl',
  ],
  kyc: [],
  bank: [],
};

const KYC_DOCUMENT_TYPES: {
  type: VendorDocumentType;
  label: string;
}[] = [
    { type: 'GST', label: 'GST Certificate' },
    { type: 'PAN', label: 'PAN Card' },
    { type: 'AADHAAR', label: 'Aadhaar Card' },
  ];

// ─── Field-level validation (UX only) ─────────────────────────────────────────
// Mirrors `VendorFieldsSchema` in msd-api's `vendor.schema.ts` exactly — same regexes, same
// messages — so the user sees the problem before submitting instead of only after a 422. The
// backend re-validates and remains the authority; this is not a security layer.

const PINCODE_REGEX = /^\d{6}$/;
// MOBILE_REGEX (utils/format) matches msd-api's `INDIA_MOBILE_LOCAL_REGEX` in `vendor.schema.ts`,
// applied to the plain 10-digit value this form holds (the backend stores it `+91`-prefixed).

function validatePincode(value: string): string | null {
  if (!value) return null;

  return PINCODE_REGEX.test(value)
    ? null
    : 'Enter a valid 6-digit pincode';
}

function validateMobileNumber(value: string): string | null {
  if (!value) return null;

  return MOBILE_REGEX.test(value)
    ? null
    : 'Enter a valid 10-digit mobile number';
}

function validateEmail(value: string): string | null {
  if (!value) return null;

  return EMAIL_REGEX.test(value)
    ? null
    : 'Enter a valid email address';
}

/** A light, client-side "does this look like a URL" check only — the real validation (host,
 *  whether the link resolves to a place) happens server-side in
 *  `googleMapsUrlResolver.provider.ts`; its error message is surfaced via `serverFieldErrors`/
 *  the submit handler's catch block (see `vendor-business-profile.tsx` and friends), not here. */
function validateMapLocationUrl(value: string): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:'
      ? null
      : 'Enter a valid Google Maps link';
  } catch {
    return 'Enter a valid Google Maps link';
  }
}

const FIELD_VALIDATORS: Partial<
  Record<keyof VendorFields, (value: string) => string | null>
> = {
  pincode: validatePincode,
  businessPhone: validateMobileNumber,
  ownerMobile: validateMobileNumber,
  businessEmail: validateEmail,
  ownerEmail: validateEmail,
  mapLocationUrl: validateMapLocationUrl,
};

/** Extracts a flat `{field: message}` map from a 422's Zod-flattened `details.fieldErrors`
 *  (see msd-api's `middleware/validate.ts`) — first message per field only, matching how this
 *  form already surfaces one message per field. Returns `null` for anything else (network
 *  error, a non-validation ApiError, etc.) so the caller falls back to its own generic message. */
export function extractVendorFieldErrors(
  err: unknown,
): VendorFieldErrors | null {
  if (!(err instanceof ApiRequestError) || err.code !== 'VALIDATION_ERROR') {
    return null;
  }

  const details = err.details as {
    fieldErrors?: Record<string, string[]>;
  } | undefined;

  if (!details?.fieldErrors) return null;

  const flat: VendorFieldErrors = {};

  for (const [key, messages] of Object.entries(details.fieldErrors)) {
    if (messages?.[0]) {
      flat[key as keyof VendorFields] = messages[0];
    }
  }

  return Object.keys(flat).length > 0 ? flat : null;
}

export type VendorFieldErrors = Partial<
  Record<keyof VendorFields, string>
>;

interface VendorProfileFormProps {
  vendor: Vendor | null;
  canEdit: boolean;
  saving: boolean;

  /** Needed for the KYC document upload/delete calls (see `VendorDocumentUpload`) — every other
   *  save in this form goes through the parent's own `onSave` callback instead. */
  token: string | null;

  onSave: (input: VendorFields) => void;

  /** Which field groups to render — defaults to all (the existing self-service single-page
   *  usage). The admin onboarding pipeline passes a single section per step. */
  sections?: VendorFormSection[];

  /** Overrides the built-in save button's label — the pipeline uses "Save & Continue". */
  saveLabel?: string;

  /** Set by the parent after a failed save whose 422 response carried per-field messages (see
   *  `extractVendorFieldErrors`) — merged into this form's own `errors` state so a field the
   *  frontend's own `FIELD_VALIDATORS` missed still gets a correct inline error instead of only
   *  a generic top-level snackbar. */
  serverFieldErrors?: VendorFieldErrors | null;

  /** Self-service (`/vendors/me/kyc-documents/...`) vs. admin-on-behalf
   *  (`/vendors/:id/kyc-documents/...`) — only matters when `show('kyc')`. */
  selfService?: boolean;

  /**
   * Called after a KYC document is uploaded or deleted so the parent
   * VendorPipeline can refresh its vendor state immediately.
   */
  onKycDocumentChanged?: (
    change:
      | { action: 'uploaded'; document: VendorDocument }
      | { action: 'deleted'; documentType: VendorDocumentType },
  ) => void;
}

/**
 * The Business/Personal/Address/KYC/Bank multi-section form — reused for both admin
 * create-or-edit-any-vendor (one section at a time, via `sections`, in the onboarding
 * pipeline) and vendor self-service create-or-edit-own-profile (all sections at once).
 */
export function VendorProfileForm({
  vendor,
  canEdit,
  saving,
  token,
  onSave,
  sections = ALL_SECTIONS,
  saveLabel,
  serverFieldErrors,
  selfService = false,
  onKycDocumentChanged,
}: VendorProfileFormProps) {
  const [form, setForm] = useState<VendorFields>(() => toFormFields(vendor));
  const [errors, setErrors] = useState<VendorFieldErrors>({});
  // What a save stopped on (item 8): named in one alert above the save bar, never a silently
  // disabled button.
  const [summary, setSummary] = useState<string[]>([]);
  const formId = useId();
  const saved = useMemo(() => toFormFields(vendor), [vendor]);

  // Whether each of the 3 KYC slots currently has a file — staged (pre-creation) or really
  // uploaded — reported up by each VendorDocumentUpload. Drives "at least one KYC document"
  // for the Save/Create-Vendor button, independent of `form` (KYC is file-based, not a field).
  const [kycSlotHasFile, setKycSlotHasFile] = useState<
    Record<VendorDocumentType, boolean>
  >({
    GST: false,
    PAN: false,
    AADHAAR: false,
  });

  // Member responses carry only each document's type and status, so the file details shown in
  // the KYC slots come from the documents endpoint.
  const [documents, setDocuments] = useState<VendorDocument[]>([]);

  const show = (section: VendorFormSection) =>
    sections.includes(section);

  const showKyc = show('kyc');
  const vendorId = vendor?.id ?? null;

  useEffect(() => {
    setDocuments([]);
    if (!showKyc || !vendorId) return;
    let live = true;
    const request = selfService ? listMyKycDocuments(token) : listVendorKycDocuments(token, vendorId);
    request
      .then(({ data }) => {
        if (live) setDocuments(data);
      })
      .catch(() => {
        // The slots stay empty and the member can still upload; the save itself is unaffected.
      });
    return () => {
      live = false;
    };
  }, [showKyc, vendorId, selfService, token]);

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
    setErrors({});
    setSummary([]);
  }, [vendor]);

  useEffect(() => {
    if (!saving) {
      submittingRef.current = false;
    }
  }, [saving]);

  useEffect(() => {
    if (
      serverFieldErrors &&
      Object.keys(serverFieldErrors).length > 0
    ) {
      setErrors((e) => ({
        ...e,
        ...serverFieldErrors,
      }));
    }
  }, [serverFieldErrors]);

  const set = <K extends keyof VendorFields>(
    key: K,
    value: VendorFields[K],
  ) => {
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === 'state' && value !== f.state ? { city: '' } : {}),
    }));

    // Clear a field's inline error as soon as the user edits it — the next Save click
    // re-validates and re-populates it if the new value is still bad.
    setErrors((e) =>
      e[key]
        ? {
          ...e,
          [key]: undefined,
        }
        : e,
    );
  };

  const text =
    (key: keyof VendorFields) =>
      (e: Event) =>
        set(
          key,
          (e.target as HTMLInputElement).value as never,
        );

  /** Phone fields only ever hold digits, max 10 — strips anything else (letters, spaces,
   *  `+`/`-`, a pasted `+91` prefix) on every keystroke AND on paste, since a paste also fires
   *  `input`. Re-reads the resulting `e.target.value`, so a pasted "+91 98765-43210" or
   *  "98765abc10" both collapse to a clean "9876543210" — the browser's own input element is
   *  then re-synced to the filtered value on the next render via the controlled `value` prop. */
  const phoneInput =
    (key: keyof VendorFields) =>
      (e: Event) => {
        const digitsOnly = (e.target as HTMLInputElement)
          .value.replace(/\D/g, '')
          .slice(0, 10);

        set(key, digitsOnly as never);
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

        const message = validator(
          (form[key] as string | undefined) ?? '',
        );

        if (message) {
          nextErrors[key] = message;
        }
      }
      for (const key of REQUIRED_FIELDS[section]) {
        if (!nextErrors[key] && String(form[key] ?? '').trim() === '') {
          nextErrors[key] = `Enter the ${(FIELD_LABELS[key] ?? key).toLowerCase()}.`;
        }
      }
    }

    setErrors(nextErrors);
    const missing = (Object.keys(FIELD_LABELS) as (keyof VendorFields)[])
      .filter((key) => nextErrors[key])
      .map((key) => FIELD_LABELS[key] as string);
    const kycMissing = show('kyc') && !Object.values(kycSlotHasFile).some(Boolean);
    setSummary(kycMissing ? [...missing, KYC_REQUIRED] : missing);
    const first = (Object.keys(FIELD_LABELS) as (keyof VendorFields)[]).find((key) => nextErrors[key]);
    if (first) {
      const field = document.querySelector<HTMLElement>(`[data-field="${formId}-${first}"] md-outlined-text-field, [data-field="${formId}-${first}"] md-outlined-select`);
      field?.focus();
    }

    return Object.keys(nextErrors).length === 0 && !kycMissing;
  };

  /** Required-field-non-empty AND no active inline error, across every currently-shown
   *  section — plus, when `show('kyc')`, at least one of the 3 KYC slots has a file (uploaded or
   *  staged pre-creation). This is what actually gates the Save/Create-Vendor button now,
   *  replacing the old "businessName only" check. Also re-checked inside `handleSave` itself
   *  (not just the button's `disabled` prop) — belt-and-suspenders against anything that could
   *  invoke it despite the button appearing disabled (e.g. an Enter keypress). */
  const requiredFieldsFilled = sections.every((section) =>
    REQUIRED_FIELDS[section].every((key) => {
      const value = form[key];

      return (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ''
      );
    }),
  );

  // Scoped to only the currently-visible sections' own fields — the actual fix for the Save
  // button staying permanently disabled after switching away from a tab that had left a stale
  // error behind (e.g. a section-B server/inline error, never cleared, silently poisoning
  // section A's own otherwise-valid Save). `errors` itself isn't pruned on a tab switch (only on
  // `vendor` identity change), so checking the whole map here would re-introduce exactly that bug.
  const visibleErrorKeys = sections.flatMap(
    (s) => SECTION_FIELDS[s],
  );

  const noActiveErrors = visibleErrorKeys.every(
    (key) => !errors[key],
  );

  const kycSatisfied =
    !show('kyc') ||
    Object.values(kycSlotHasFile).some(Boolean);

  const canSubmit =
    requiredFieldsFilled &&
    noActiveErrors &&
    kycSatisfied;

  const visibleFields = sections.flatMap((s) => SECTION_FIELDS[s]);
  const dirty = visibleFields.some((key) => String(form[key] ?? '') !== String(saved[key] ?? ''));

  /** Puts the saved values back (item 8). */
  const discard = () => {
    setForm(toFormFields(vendor));
    setErrors({});
    setSummary([]);
  };

  const handleSave = () => {
    if (submittingRef.current) return;

    if (!validateVisibleFields()) return;

    submittingRef.current = true;

    // Disables the real DOM element in the same synchronous tick, rather than waiting on
    // React's `disabled={saving}` re-render to commit — see saveButtonRef's own doc comment.
    if (saveButtonRef.current) {
      saveButtonRef.current.disabled = true;
    }

    // Only the currently visible section(s)' own fields are ever submitted — the actual fix for
    // a hidden section's stale/incomplete data riding along in an unrelated save (see `pick`'s
    // own doc comment).
    const visibleKeys = sections.flatMap(
      (s) => SECTION_FIELDS[s],
    );

    onSave(
      cleanForSubmit(
        pick(form, visibleKeys),
      ) as VendorFields,
    );
  };

  return (
    <div className="form-grid">
      {vendor && <p className="field-hint">Status: {MEMBER_STATUS_LABEL[vendor.status]}</p>}

      {vendor?.kycStatus === 'REJECTED' &&
        vendor.kycRejectionReason && (
          <p className="error-state" role="alert">
            KYC rejected: {vendor.kycRejectionReason}
          </p>
        )}

      {show('business') && (
        <section className="vendor-section" aria-labelledby={`${formId}-business-title`}>
          <h3 id={`${formId}-business-title`} className="vendor-section__title title-small">Business details</h3>
          <p className="vendor-section__hint body-small">Basic information about the business.</p>
          <div className="vendor-fields-grid">
            <div className="vendor-field" data-field={`${formId}-businessName`}>
              <OutlinedTextField
                label="Business name"
                value={form.businessName ?? ''}
                disabled={!canEdit}
                onInput={text('businessName')}
                error={Boolean(errors.businessName)}
              />

              {errors.businessName && (
                <p className="error-state" role="alert">
                  {errors.businessName}
                </p>
              )}
            </div>

            <div className="vendor-field" data-field={`${formId}-businessDescription`}>
              <OutlinedTextField
                label="Description"
                value={form.businessDescription ?? ''}
                disabled={!canEdit}
                onInput={text('businessDescription')}
              />
            </div>

            <div className="vendor-field" data-field={`${formId}-businessEmail`}>
              <OutlinedTextField
                label="Business email"
                type="email"
                value={form.businessEmail ?? ''}
                disabled={!canEdit}
                onInput={text('businessEmail')}
                error={Boolean(errors.businessEmail)}
              />

              {errors.businessEmail && (
                <p className="error-state" role="alert">
                  {errors.businessEmail}
                </p>
              )}
            </div>

            <div className="vendor-field" data-field={`${formId}-businessPhone`}>
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

              {errors.businessPhone && (
                <p className="error-state" role="alert">
                  {errors.businessPhone}
                </p>
              )}
            </div>
          </div>
        </section>
      )}
      {show('owner') && (
        <section className="vendor-section" aria-labelledby={`${formId}-owner-title`}>
          <h3 id={`${formId}-owner-title`} className="vendor-section__title title-small">Owner</h3>
          <p className="vendor-section__hint body-small">Owner and primary contact information.</p>
          <div className="vendor-fields-grid">
            <div className="vendor-field" data-field={`${formId}-ownerFirstName`}>
              <OutlinedTextField
                label="First Name"
                value={form.ownerFirstName ?? ''}
                disabled={!canEdit}
                onInput={text('ownerFirstName')}
              />
            </div>

            <div className="vendor-field" data-field={`${formId}-ownerLastName`}>
              <OutlinedTextField
                label="Last Name"
                value={form.ownerLastName ?? ''}
                disabled={!canEdit}
                onInput={text('ownerLastName')}
              />
            </div>

            <div className="vendor-field" data-field={`${formId}-ownerMobile`}>
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
              {errors.ownerMobile && (
                <p className="error-state" role="alert">
                  {errors.ownerMobile}
                </p>
              )}
            </div>

            <div className="vendor-field" data-field={`${formId}-ownerEmail`}>
              <OutlinedTextField
                label="Email"
                type="email"
                value={form.ownerEmail ?? ''}
                disabled={!canEdit}
                onInput={text('ownerEmail')}
                error={Boolean(errors.ownerEmail)}
              />
              {errors.ownerEmail && (
                <p className="error-state" role="alert">
                  {errors.ownerEmail}
                </p>
              )}
            </div>
          </div>
        </section>
      )}
      {show('address') && (
        <section className="vendor-section" aria-labelledby={`${formId}-address-title`}>
          <h3 id={`${formId}-address-title`} className="vendor-section__title title-small">Registered address</h3>
          <p className="vendor-section__hint body-small">Business address and map location.</p>
          <div className="vendor-fields-grid">
            <div className="vendor-field" data-field={`${formId}-address`}>
              <OutlinedTextField
                label="Address 1"
                value={form.address ?? ''}
                disabled={!canEdit}
                onInput={text('address')}
                error={Boolean(errors.address)}
              />
              {errors.address && (
                <p className="error-state" role="alert">
                  {errors.address}
                </p>
              )}
            </div>

            <div className="vendor-field" data-field={`${formId}-addressLine2`}>
              <OutlinedTextField
                label="Address 2"
                value={form.addressLine2 ?? ''}
                disabled={!canEdit}
                onInput={text('addressLine2')}
              />
            </div>

            <div className="vendor-field" data-field={`${formId}-state`}>
              {renderSelect({
                label: 'State',
                value: form.state ?? '',
                disabled: !canEdit,
                placeholder: 'Select a state',
                options: asOptions(STATES),
                // A saved state outside the list stays selectable instead of being cleared.
                extraOption: form.state && !STATES.includes(form.state) ? { value: form.state, label: form.state } : undefined,
                onChange: (value) => set('state', value),
              })}
              {errors.state && <p className="error-state" role="alert">{errors.state}</p>}
            </div>

            <div className="vendor-field" data-field={`${formId}-city`}>
              {renderSelect({
                label: 'City',
                value: form.city ?? '',
                disabled: !canEdit || !form.state,
                placeholder: form.state ? 'Select a city' : 'Select a state first',
                options: asOptions(citiesForState(form.state ?? '')),
                extraOption:
                  form.city && !citiesForState(form.state ?? '').includes(form.city) ? { value: form.city, label: form.city } : undefined,
                onChange: (value) => set('city', value),
              })}
              {errors.city && <p className="error-state" role="alert">{errors.city}</p>}
            </div>

            <div className="vendor-field" data-field={`${formId}-pincode`}>
              <OutlinedTextField
                label="PIN Code"
                value={form.pincode ?? ''}
                disabled={!canEdit}
                onInput={text('pincode')}
                error={Boolean(errors.pincode)}
              />
              {errors.pincode && (
                <p className="error-state" role="alert">
                  {errors.pincode}
                </p>
              )}
            </div>

            <div className="vendor-field" data-field={`${formId}-mapLocationUrl`}>
              <OutlinedTextField
                label="Map Location"
                type="url"
                placeholder="Paste Google Maps location link"
                value={form.mapLocationUrl ?? ''}
                disabled={!canEdit}
                onInput={text('mapLocationUrl')}
                error={Boolean(errors.mapLocationUrl)}
              />
              {errors.mapLocationUrl && (
                <p className="error-state" role="alert">
                  {errors.mapLocationUrl}
                </p>
              )}
            </div>
          </div>
        </section>
      )}
      {show('kyc') && (
        <section className="vendor-section" aria-labelledby={`${formId}-kyc-title`}>
          <h3 id={`${formId}-kyc-title`} className="vendor-section__title title-small">KYC documents</h3>
          <p className="vendor-section__hint body-small">Upload one document for vendor verification.</p>
          <div className="vendor-section-content">
            {canEdit && (
              <p className="field-hint">
                Upload any ONE of the following documents.
              </p>
            )}

            <div className="kyc-document-list">
              {KYC_DOCUMENT_TYPES.map(({ type, label }) => (
                <VendorDocumentUpload
                  key={type}
                  documentType={type}
                  label={label}
                  vendorId={vendor?.id ?? null}
                  selfService={selfService}
                  existingDocument={documents.find(
                    (d) => d.documentType === type
                  )}
                  token={token}
                  readOnly={!canEdit}
                  onUploaded={(doc) =>
                    {
                      setDocuments((prev) => [
                        ...prev.filter((d) => d.documentType !== type),
                        doc,
                      ]);
                      onKycDocumentChanged?.({ action: 'uploaded', document: doc });
                    }
                  }
                  onDeleted={() =>
                    {
                      setDocuments((prev) =>
                        prev.filter((d) => d.documentType !== type)
                      );
                      onKycDocumentChanged?.({ action: 'deleted', documentType: type });
                    }
                  }
                  onStagedChange={(hasFile) =>
                    setKycSlotHasFile((prev) => ({
                      ...prev,
                      [type]: hasFile,
                    }))
                  }
                />
              ))}
            </div>

          </div>
        </section>
      )}
      {show('bank') && (
        <section className="vendor-section" aria-labelledby={`${formId}-bank-title`}>
          <h3 id={`${formId}-bank-title`} className="vendor-section__title title-small">Bank details</h3>
          <p className="vendor-section__hint body-small">Payment and settlement account information.</p>
          <div className="vendor-fields-grid">
            <div className="vendor-field" data-field={`${formId}-bankAccountHolder`}>
              <OutlinedTextField
                label="Account holder"
                value={form.bankAccountHolder ?? ''}
                disabled={!canEdit}
                onInput={text('bankAccountHolder')}
              />
            </div>

            <div className="vendor-field" data-field={`${formId}-bankName`}>
              <OutlinedTextField
                label="Bank name"
                value={form.bankName ?? ''}
                disabled={!canEdit}
                onInput={text('bankName')}
              />
            </div>

            <div className="vendor-field" data-field={`${formId}-bankAccountNumber`}>
              <OutlinedTextField
                label="Account number"
                value={form.bankAccountNumber ?? ''}
                disabled={!canEdit}
                onInput={text('bankAccountNumber')}
              />
            </div>

            <div className="vendor-field" data-field={`${formId}-bankIfsc`}>
              <OutlinedTextField
                label="IFSC"
                value={form.bankIfsc ?? ''}
                disabled={!canEdit}
                onInput={text('bankIfsc')}
              />
            </div>

            <div className="vendor-field" data-field={`${formId}-upiId`}>
              <OutlinedTextField
                label="UPI ID"
                value={form.upiId ?? ''}
                disabled={!canEdit}
                onInput={text('upiId')}
              />
            </div>
          </div>
        </section>
      )}

      {canEdit && summary.length > 0 && (
        <div className="vendor-form__summary" role="alert" aria-labelledby={`${formId}-summary`}>
          <p id={`${formId}-summary`} className="title-small">Fix these fields to save</p>
          <ul className="body-medium">
            {summary.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && (
        <div className="form-actions vendor-form__actions">
          {vendor && dirty && (
            <>
              <p className="vendor-form__dirty body-medium" role="status">You have unsaved changes.</p>
              {createElement('md-text-button', { onClick: discard, disabled: saving || undefined }, 'Discard')}
            </>
          )}
          <FilledButton ref={saveButtonRef} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : (saveLabel ?? (vendor ? 'Save changes' : 'Create vendor'))}
          </FilledButton>
        </div>
      )}
    </div>
  );
}

export default VendorProfileForm;