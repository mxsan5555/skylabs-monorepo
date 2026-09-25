import { useState, type FormEvent } from 'react';
import { OutlinedTextField, OutlinedSelect, SelectOption, FilledButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { registerPublicVendor, type VendorSelfInput } from '../../../api/rbac/vendors';
import { ApiRequestError } from '../../../api/rbac/client';
import { extractBecomeVendorFieldErrors, type BecomeVendorFieldKey } from '../account/cms/field-errors';
import { STATES, citiesForState } from '../../../data/india-locations';
import './become-vendor.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_REGEX = /^[6-9]\d{9}$/;
const PINCODE_REGEX = /^\d{6}$/;

interface BecomeVendorForm {
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerMobile: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

const EMPTY_FORM: BecomeVendorForm = {
  businessName: '',
  businessEmail: '',
  businessPhone: '',
  ownerFirstName: '',
  ownerLastName: '',
  ownerEmail: '',
  ownerMobile: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
};

type FormErrors = Partial<Record<BecomeVendorFieldKey, string>>;

/**
 * Public, unauthenticated "Become a Vendor" application (`POST /vendors/public/register`) — the
 * storefront-facing counterpart of the admin "Add Vendor" wizard, trimmed to a first-pass
 * application only: business name + the same owner identity fields (name/email/mobile) + basic
 * address. No KYC/bank/branch/category UI here at all — `VendorSelfCreateSchema` structurally has
 * no fields for any of that, so there is nothing privileged this form could even send; the admin
 * fills in the rest via the existing onboarding pipeline once the application is approved.
 *
 * Always lands as `PENDING_VERIFICATION` — never auto-approved, never auto-logged-in. The
 * applicant is never authenticated by this page: no token is sent with the request, and success
 * shows an inline confirmation instead of any redirect into the admin console.
 */
export function BecomeVendor() {
  const [form, setForm] = useState<BecomeVendorForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const set = <K extends keyof BecomeVendorForm>(key: K, value: string) => {
    setForm((f) => ({ ...f, [key]: value, ...(key === 'state' ? { city: '' } : {}) }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };
  const text = (key: keyof BecomeVendorForm) => (e: Event) => set(key, (e.target as HTMLInputElement).value);
  const phoneInput = (key: keyof BecomeVendorForm) => (e: Event) =>
    set(key, (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 10));

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!form.businessName.trim()) next.businessName = 'Business name is required.';
    if (form.businessEmail.trim() && !EMAIL_REGEX.test(form.businessEmail.trim())) {
      next.businessEmail = 'Enter a valid email address.';
    }
    if (form.ownerEmail.trim() && !EMAIL_REGEX.test(form.ownerEmail.trim())) {
      next.ownerEmail = 'Enter a valid email address.';
    }
    if (form.businessPhone.trim() && !MOBILE_REGEX.test(form.businessPhone.trim())) {
      next.businessPhone = 'Enter a valid 10-digit mobile number.';
    }
    if (form.ownerMobile.trim() && !MOBILE_REGEX.test(form.ownerMobile.trim())) {
      next.ownerMobile = 'Enter a valid 10-digit mobile number.';
    }
    if (form.pincode.trim() && !PINCODE_REGEX.test(form.pincode.trim())) {
      next.pincode = 'Enter a valid 6-digit PIN code.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const input: VendorSelfInput = {
        businessName: form.businessName.trim(),
        ...(form.businessEmail.trim() && { businessEmail: form.businessEmail.trim() }),
        ...(form.businessPhone.trim() && { businessPhone: form.businessPhone.trim() }),
        ...(form.ownerFirstName.trim() && { ownerFirstName: form.ownerFirstName.trim() }),
        ...(form.ownerLastName.trim() && { ownerLastName: form.ownerLastName.trim() }),
        ...(form.ownerEmail.trim() && { ownerEmail: form.ownerEmail.trim() }),
        ...(form.ownerMobile.trim() && { ownerMobile: form.ownerMobile.trim() }),
        ...(form.address.trim() && { address: form.address.trim() }),
        ...(form.city.trim() && { city: form.city.trim() }),
        ...(form.state.trim() && { state: form.state.trim() }),
        ...(form.pincode.trim() && { pincode: form.pincode.trim() }),
      };
      await registerPublicVendor(input);
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const fieldErrors = extractBecomeVendorFieldErrors(err);
        if (fieldErrors) setErrors((prev) => ({ ...prev, ...fieldErrors }));
        // Covers CONFLICT (email/phone already belongs to an existing account — a Vendor
        // registration is always a brand-new account, never a reuse) and RATE_LIMITED (429,
        // "too many registration attempts") alike — the backend's own message is already clear
        // enough to show directly, no special-casing needed per error code.
        setSubmitError(err.message);
      } else {
        setSubmitError('Could not submit your application — please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const cityOptions = citiesForState(form.state);

  if (submitted) {
    return (
      <main className="become-vendor">
        <title>Application received · MSD</title>
        <section className="become-vendor__success" aria-label="Application received" role="status">
          <Icon aria-hidden="true">check_circle</Icon>
          <h1>Application received</h1>
          <p>
            Thanks for applying to become a vendor on MySpaDeal. Our team will review your business details and get in
            touch by email or phone once it&apos;s been verified — no further action is needed from you right now.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="become-vendor">
      <title>Become a Vendor · MSD</title>
      <meta name="description" content="Apply to list your spa or wellness business on MySpaDeal." />
      <header className="become-vendor__hero">
        <h1>Become a Vendor</h1>
        <p>Tell us about your business — our team will review your application and follow up to complete onboarding.</p>
      </header>

      <form className="form-grid" onSubmit={submit} noValidate>
        <h2 className="section-title">Business details</h2>
        <OutlinedTextField
          label="Business name"
          value={form.businessName}
          required
          onInput={text('businessName')}
          error={Boolean(errors.businessName)}
        />
        {errors.businessName && <p className="error-state" role="alert">{errors.businessName}</p>}
        <OutlinedTextField
          label="Business email"
          type="email"
          value={form.businessEmail}
          onInput={text('businessEmail')}
          error={Boolean(errors.businessEmail)}
        />
        {errors.businessEmail && <p className="error-state" role="alert">{errors.businessEmail}</p>}
        <OutlinedTextField
          label="Business phone"
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={form.businessPhone}
          onInput={phoneInput('businessPhone')}
          error={Boolean(errors.businessPhone)}
        />
        {errors.businessPhone && <p className="error-state" role="alert">{errors.businessPhone}</p>}

        <h2 className="section-title">Your details</h2>
        <OutlinedTextField label="First name" value={form.ownerFirstName} onInput={text('ownerFirstName')} />
        <OutlinedTextField label="Last name" value={form.ownerLastName} onInput={text('ownerLastName')} />
        <OutlinedTextField
          label="Email"
          type="email"
          value={form.ownerEmail}
          onInput={text('ownerEmail')}
          error={Boolean(errors.ownerEmail)}
        />
        {errors.ownerEmail && <p className="error-state" role="alert">{errors.ownerEmail}</p>}
        <OutlinedTextField
          label="Mobile"
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={form.ownerMobile}
          onInput={phoneInput('ownerMobile')}
          error={Boolean(errors.ownerMobile)}
        />
        {errors.ownerMobile && <p className="error-state" role="alert">{errors.ownerMobile}</p>}

        <h2 className="section-title">Business address</h2>
        <OutlinedTextField label="Address" value={form.address} onInput={text('address')} />
        <OutlinedSelect label="State" value={form.state} onChange={(e: Event) => set('state', (e.target as HTMLSelectElement).value)}>
          <SelectOption value="">
            <div slot="headline">Select a state</div>
          </SelectOption>
          {STATES.map((state) => (
            <SelectOption key={state} value={state}>
              <div slot="headline">{state}</div>
            </SelectOption>
          ))}
        </OutlinedSelect>
        <OutlinedSelect
          label="City"
          value={form.city}
          onChange={(e: Event) => set('city', (e.target as HTMLSelectElement).value)}
          disabled={!form.state}
        >
          <SelectOption value="">
            <div slot="headline">{form.state ? 'Select a city' : 'Select a state first'}</div>
          </SelectOption>
          {cityOptions.map((city) => (
            <SelectOption key={city} value={city}>
              <div slot="headline">{city}</div>
            </SelectOption>
          ))}
        </OutlinedSelect>
        <OutlinedTextField
          label="PIN code"
          inputMode="numeric"
          maxLength={6}
          value={form.pincode}
          onInput={(e: Event) => set('pincode', (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6))}
          error={Boolean(errors.pincode)}
        />
        {errors.pincode && <p className="error-state" role="alert">{errors.pincode}</p>}

        {submitError && <p className="error-state" role="alert">{submitError}</p>}

        <div className="form-actions">
          <FilledButton type="submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit application'}
          </FilledButton>
        </div>
      </form>
    </main>
  );
}

export default BecomeVendor;
