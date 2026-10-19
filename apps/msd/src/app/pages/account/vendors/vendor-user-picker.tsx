import { createElement, useEffect, useRef, useState, type ChangeEvent, type Ref } from 'react';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  createVendor,
  getVendorOwnerAvailability,
  type Vendor,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null; // optional
  return EMAIL_REGEX.test(trimmed) ? null : 'Enter a valid email address.';
}

/** Required on this screen only (see this file's own doc comment) — `ownerMobile` stays
 *  optional everywhere else in the system (business-details edits, drafts). */
function validateMobile(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (!digits) return 'Mobile number is required.';
  if (digits.length !== 10) return 'Enter exactly 10 digits.';
  if (!/^[6-9]/.test(digits)) return 'Mobile number must start with 6, 7, 8 or 9.';
  return null;
}

interface FieldErrors {
  firstName?: string;
  email?: string;
  mobile?: string;
}

type DrivenChangeEvent = ChangeEvent<HTMLElement & { value: string }>;

/** Raw M3 `<md-outlined-text-field>` (not the shared-ui React wrapper) so tests can drive the
 *  field's value and native `input`/`blur` events directly — same convention as
 *  `branch-form-page.tsx`'s own `renderTextField` (see that file's doc comment: the shared-ui
 *  wrapper sets element state via an imperative property effect that does not run under
 *  Vitest's `@lit/react` resolution). */
function renderTextField({
  label,
  value,
  required,
  disabled,
  error,
  type,
  inputmode,
  maxlength,
  onInput,
  onBlur,
  elRef,
}: {
  label: string;
  value: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  type?: string;
  inputmode?: string;
  maxlength?: number;
  onInput: (value: string) => void;
  onBlur?: () => void;
  elRef?: Ref<HTMLElement>;
}) {
  return createElement('md-outlined-text-field', {
    ref: elRef,
    label,
    value,
    required,
    disabled,
    error,
    type,
    inputmode,
    maxlength,
    onInput: (e: DrivenChangeEvent) => onInput(e.currentTarget.value),
    onBlur,
  });
}

/**
 * "Add Member" Step 1 of 4 — Owner & Login. A standalone, self-contained screen (not merely a
 * field-collection step reported up to a parent): it owns its own submit, calling `createVendor`
 * directly and handing the newly-created Member back to the caller via `onCreated`, which opens
 * the existing Member Details page. First name + Mobile are required here; Last name/Email stay
 * optional (Email still validated for format when supplied). Mobile is ALWAYS a plain 10-digit
 * national number in state — `+91` is shown as a fixed, non-editable prefix, never part of the
 * input value, and the backend's own `normalizeIdentifier()` re-adds it on save.
 *
 * The owner identity created here is ALWAYS a brand-new User — there is no "reuse an existing
 * account" path anywhere in this flow (see msd-api's `createVendorOwner` doc comment). The
 * debounced pre-submit availability check below is UX only; the real rejection is `POST
 * /vendors`'s own validation (surfaced here via its `CONFLICT` error's per-field `details.conflicts`).
 */
export function VendorOwnerLoginStep({
  onCreated,
}: {
  onCreated: (vendor: Vendor) => void;
}) {
  const { token } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [touched, setTouched] = useState<Record<'firstName' | 'email' | 'mobile', boolean>>({
    firstName: false,
    email: false,
    mobile: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  const submittingRef = useRef(false);
  const saveButtonRef = useRef<MdFilledButton>(null);
  const firstFieldRef = useRef<HTMLElement>(null);

  // Debounced "is this already taken" preview — advisory only (see this file's own doc comment).
  useEffect(() => {
    const mobileOk = validateMobile(mobile) === null;
    const emailOk = validateEmail(email) === null && email.trim().length > 0;
    if (!mobileOk && !emailOk) return;
    const handle = setTimeout(() => {
      setChecking(true);
      getVendorOwnerAvailability(token, {
        email: emailOk ? email.trim() : undefined,
        mobile: mobileOk ? mobile.replace(/\D/g, '') : undefined,
      })
        .then(({ data }) => {
          if (data.available) return;
          setErrors((e) => ({
            ...e,
            ...(data.conflicts.includes('phone') ? { mobile: 'This mobile number already belongs to an account.' } : {}),
            ...(data.conflicts.includes('email') ? { email: 'This email already belongs to an account.' } : {}),
          }));
        })
        .catch(() => undefined) // advisory only — the real check is at submit time
        .finally(() => setChecking(false));
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, mobile, email]);

  const validateField = (field: 'firstName' | 'email' | 'mobile') => {
    if (field === 'firstName') {
      return firstName.trim() ? null : 'First name is required.';
    }
    if (field === 'email') return validateEmail(email);
    return validateMobile(mobile);
  };

  const onBlurField = (field: 'firstName' | 'email' | 'mobile') => {
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors((e) => ({ ...e, [field]: validateField(field) ?? undefined }));
  };

  const validateAll = (): boolean => {
    const next: FieldErrors = {
      firstName: validateField('firstName') ?? undefined,
      email: validateField('email') ?? undefined,
      mobile: validateField('mobile') ?? undefined,
    };
    setErrors(next);
    setTouched({ firstName: true, email: true, mobile: true });
    return !next.firstName && !next.email && !next.mobile;
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (!validateAll()) {
      firstFieldRef.current?.focus();
      return;
    }
    submittingRef.current = true;
    if (saveButtonRef.current) saveButtonRef.current.disabled = true;
    setSaving(true);
    setFormError('');
    try {
      const { data } = await createVendor(token, {
        ownerFirstName: firstName.trim(),
        ownerLastName: lastName.trim() || undefined,
        ownerEmail: email.trim() || undefined,
        ownerMobile: mobile.replace(/\D/g, ''),
      });
      onCreated(data);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'CONFLICT') {
        const conflicts = (err.details as { conflicts?: ('email' | 'phone')[] } | undefined)?.conflicts ?? [];
        setErrors((e) => ({
          ...e,
          ...(conflicts.includes('phone') ? { mobile: 'This mobile number already belongs to an account.' } : {}),
          ...(conflicts.includes('email') ? { email: 'This email already belongs to an account.' } : {}),
        }));
        if (conflicts.length === 0) setFormError(err.message);
      } else {
        setFormError(err instanceof ApiRequestError ? err.message : 'Could not create this member. Please try again.');
      }
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  const showError = (field: 'firstName' | 'email' | 'mobile') => (touched[field] ? errors[field] : undefined);

  return (
    <section aria-labelledby="owner-login-title">
      <h2 id="owner-login-title" className="section-title">Step 1 of 4: Owner &amp; Login</h2>
      {formError && <p className="error-state" role="alert">{formError}</p>}
      <sky-card>
        <div className="form-grid">
          <div className="vendor-field">
            {renderTextField({
              elRef: firstFieldRef,
              label: 'First name',
              required: true,
              value: firstName,
              disabled: saving,
              onInput: setFirstName,
              onBlur: () => onBlurField('firstName'),
              error: Boolean(showError('firstName')),
            })}
            {showError('firstName') && <p className="error-state" role="alert">{showError('firstName')}</p>}
          </div>

          <div className="vendor-field">
            {renderTextField({
              label: 'Last name',
              value: lastName,
              disabled: saving,
              onInput: setLastName,
            })}
          </div>

          <div className="vendor-field vendor-field--phone">
            <span className="vendor-field__prefix" aria-hidden="true">+91</span>
            {renderTextField({
              label: 'Mobile',
              required: true,
              type: 'tel',
              inputmode: 'numeric',
              maxlength: 10,
              value: mobile,
              disabled: saving,
              onInput: (value) => setMobile(value.replace(/\D/g, '').slice(0, 10)),
              onBlur: () => onBlurField('mobile'),
              error: Boolean(showError('mobile')),
            })}
            {checking && <span className="loading-state">Checking…</span>}
            {showError('mobile') && <p className="error-state" role="alert">{showError('mobile')}</p>}
          </div>

          <div className="vendor-field">
            {renderTextField({
              label: 'Email',
              type: 'email',
              value: email,
              disabled: saving,
              onInput: setEmail,
              onBlur: () => onBlurField('email'),
              error: Boolean(showError('email')),
            })}
            {showError('email') && <p className="error-state" role="alert">{showError('email')}</p>}
          </div>

          <p className="field-hint">
            A fresh login is always created for this member's owner — if the mobile or email already belongs to an
            existing account, choose different details.
          </p>
        </div>
      </sky-card>

      <div className="form-actions">
        <FilledButton ref={saveButtonRef} onClick={handleSubmit} disabled={saving}>
          {saving ? 'Creating…' : 'Create Login & Open Details'}
        </FilledButton>
      </div>
    </section>
  );
}

export default VendorOwnerLoginStep;
