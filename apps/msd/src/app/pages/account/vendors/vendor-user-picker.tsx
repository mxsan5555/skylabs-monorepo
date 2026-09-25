import { useEffect, useState } from 'react';
import { OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getVendorOwnerAvailability, type VendorOwnerAvailability } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

/** What Step 1 of "Add Vendor" submits — a brand-new owner identity only. A Vendor's owner is
 *  ALWAYS a new User; there is no "pick/reuse an existing account" path anywhere in this flow
 *  (see msd-api's `vendorService.createVendorOwner` doc comment) — `vendor-pipeline.tsx#saveUser`
 *  sends these fields straight through to `createVendor`/`registerPublicVendor`, which reject
 *  outright if the email/mobile already belongs to anyone. */
export interface PendingVendorOwner {
  ownerFirstName?: string;
  ownerLastName?: string;
  ownerEmail?: string;
  ownerMobile?: string;
}

interface VendorUserPickerProps {
  value: PendingVendorOwner | null;
  onChange: (value: PendingVendorOwner | null) => void;
  disabled?: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INDIA_MOBILE_REGEX = /^[6-9]\d{9}$/;

/**
 * "Add Vendor → Vendor User" — Step 1 of the onboarding pipeline. Type the new owner's name/
 * email/mobile directly; a debounced availability check (`GET /vendors/users/lookup`) shows a
 * blocking "this email/phone is already taken" message if either identifier already belongs to
 * any existing account — there is no way to proceed with a taken identifier, and no "use this
 * existing account anyway" option, by design. The actual `POST /vendors`/public-register call
 * independently re-checks regardless of what this preview showed — this component is UX
 * assistance only, never a "trust me" shortcut.
 */
export function VendorUserPicker({ value, onChange, disabled }: VendorUserPickerProps) {
  const { token } = useAuth();

  const [firstName, setFirstName] = useState(value?.ownerFirstName ?? '');
  const [lastName, setLastName] = useState(value?.ownerLastName ?? '');
  const [email, setEmail] = useState(value?.ownerEmail ?? '');
  const [mobile, setMobile] = useState(value?.ownerMobile ?? '');
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [availability, setAvailability] = useState<VendorOwnerAvailability | null>(null);

  const emailValid = !email.trim() || EMAIL_REGEX.test(email.trim());
  const mobileValid = !mobile.trim() || INDIA_MOBILE_REGEX.test(mobile.trim());

  // Debounced availability check (mirrors the original search box's own 300ms debounce) —
  // re-runs, and clears any prior result, on every email/mobile edit.
  useEffect(() => {
    setAvailability(null);
    setCheckError('');
    const emailArg = emailValid && email.trim() ? email.trim() : undefined;
    const mobileArg = mobileValid && mobile.trim() ? mobile.trim() : undefined;
    if (!emailArg && !mobileArg) return;
    const handle = setTimeout(() => {
      setChecking(true);
      getVendorOwnerAvailability(token, { email: emailArg, mobile: mobileArg })
        .then(({ data }) => setAvailability(data))
        .catch((err) => setCheckError(err instanceof ApiRequestError ? err.message : 'Could not verify this email/mobile.'))
        .finally(() => setChecking(false));
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, email, mobile, emailValid, mobileValid]);

  const blocked = Boolean(checkError) || (availability !== null && !availability.available);

  // Reports the identity payload up only once it's actually submittable: valid formats, no
  // taken identifier, no check still in flight.
  useEffect(() => {
    const trimmedEmail = email.trim();
    const trimmedMobile = mobile.trim();
    if (!trimmedEmail && !trimmedMobile) return onChange(null);
    if (!emailValid || !mobileValid) return onChange(null);
    if (checking || blocked) return onChange(null);
    onChange({
      ownerFirstName: firstName.trim() || undefined,
      ownerLastName: lastName.trim() || undefined,
      ownerEmail: trimmedEmail || undefined,
      ownerMobile: trimmedMobile || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName, lastName, email, mobile, emailValid, mobileValid, checking, blocked]);

  return (
    <fieldset>
      <legend>Vendor User</legend>
      <div className="form-grid">
        <OutlinedTextField
          label="First name"
          value={firstName}
          disabled={disabled}
          onInput={(e: Event) => setFirstName((e.target as HTMLInputElement).value)}
        />
        <OutlinedTextField
          label="Last name"
          value={lastName}
          disabled={disabled}
          onInput={(e: Event) => setLastName((e.target as HTMLInputElement).value)}
        />
        <OutlinedTextField
          label="Email"
          type="email"
          value={email}
          disabled={disabled}
          onInput={(e: Event) => setEmail((e.target as HTMLInputElement).value)}
          error={!emailValid}
        />
        {!emailValid && <p className="error-state" role="alert">Enter a valid email address.</p>}
        <OutlinedTextField
          label="Mobile"
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={mobile}
          disabled={disabled}
          onInput={(e: Event) => setMobile((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 10))}
          error={!mobileValid}
        />
        {!mobileValid && <p className="error-state" role="alert">Enter a valid 10-digit mobile number.</p>}
        <p className="field-hint">
          Provide at least an email or a mobile number for the new Vendor owner's login. A fresh account is always
          created — if either already belongs to an existing user, choose different details.
        </p>

        {checking && <p className="loading-state">Checking availability…</p>}
        {checkError && <p className="error-state" role="alert">{checkError}</p>}
        {availability && !availability.available && (
          <p className="error-state" role="alert">
            A user with this {availability.conflicts.join(' and ')} already exists. Please use a different
            email/phone to create this Vendor.
          </p>
        )}
      </div>
    </fieldset>
  );
}

export default VendorUserPicker;
