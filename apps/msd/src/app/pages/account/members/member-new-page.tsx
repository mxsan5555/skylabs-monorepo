import { createElement, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { createMember, type MemberCreateInput } from '../../../../api/rbac/members';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';

type FieldKey = keyof MemberCreateInput;
type FieldErrors = Partial<Record<FieldKey, string>>;

const EMPTY: MemberCreateInput = { businessName: '', ownerFirstName: '', ownerLastName: '', ownerEmail: '', ownerMobile: '' };
const FIELD_ORDER: FieldKey[] = ['businessName', 'ownerFirstName', 'ownerLastName', 'ownerEmail', 'ownerMobile'];

// These limits mirror MemberCreateSchema in apps/msd-api/src/schemas/vendor.schema.ts.
const MAX_BUSINESS_NAME = 200;
const MAX_PERSON_NAME = 75;
const MAX_EMAIL = 254;
// Same pattern Zod 3 uses for `.email()`, so the client never accepts an address the server rejects.
const EMAIL_RE = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
// The server normalises a 10-digit number to +91 and requires the first digit to be 6 to 9.
const MOBILE_RE = /^[6-9]\d{9}$/;

export function validateMember(input: MemberCreateInput): FieldErrors {
  const errors: FieldErrors = {};
  const business = input.businessName.trim();
  const first = input.ownerFirstName.trim();
  const last = input.ownerLastName.trim();
  const email = input.ownerEmail.trim();
  if (!business) errors.businessName = 'Enter the business name.';
  else if (business.length > MAX_BUSINESS_NAME) errors.businessName = `Use ${MAX_BUSINESS_NAME} characters or fewer.`;
  if (!first) errors.ownerFirstName = 'Enter the owner first name.';
  else if (first.length > MAX_PERSON_NAME) errors.ownerFirstName = `Use ${MAX_PERSON_NAME} characters or fewer.`;
  if (!last) errors.ownerLastName = 'Enter the owner last name.';
  else if (last.length > MAX_PERSON_NAME) errors.ownerLastName = `Use ${MAX_PERSON_NAME} characters or fewer.`;
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) errors.ownerEmail = 'Enter a valid email address.';
  if (!MOBILE_RE.test(input.ownerMobile.trim())) errors.ownerMobile = 'Enter a valid 10-digit mobile number.';
  return errors;
}

/** Add member: the short form. The rest of the profile is completed on the detail page. */
export function MemberNewPage() {
  const { token, can } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<MemberCreateInput>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({});
  const [focusRequest, setFocusRequest] = useState(0);

  useSetBreadcrumbs([{ label: 'Members' }, { label: 'All Member', to: '/account/members' }, { label: 'Add member' }]);

  // Move focus to the first invalid field after a failed submit.
  useEffect(() => {
    if (focusRequest === 0) return;
    const first = FIELD_ORDER.find((key) => errors[key]);
    if (first) fieldRefs.current[first]?.focus();
  }, [focusRequest, errors]);

  if (!can('members', 'create')) {
    return <p className="empty-state">You do not have access to add a member.</p>;
  }

  const set = (key: FieldKey) => (e: { currentTarget: { value: string } }) => {
    const { value } = e.currentTarget;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async () => {
    const found = validateMember(form);
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length > 0) {
      setFocusRequest((n) => n + 1);
      return;
    }
    setSaving(true);
    try {
      const { data } = await createMember(token, {
        businessName: form.businessName.trim(),
        ownerFirstName: form.ownerFirstName.trim(),
        ownerLastName: form.ownerLastName.trim(),
        ownerEmail: form.ownerEmail.trim(),
        ownerMobile: form.ownerMobile.trim(),
      });
      navigate(`/account/members/${data.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const fields = (err.details as { fields?: FieldErrors } | undefined)?.fields;
        if (fields) {
          setErrors(fields);
          setFocusRequest((n) => n + 1);
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Could not create the member. Try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  // Raw M3 element: the @lit/react wrapper does not bind input events or labels under jsdom, so
  // tests could not drive it. Same convention as therapist-form-page.tsx.
  const field = (key: FieldKey, label: string, extra: Record<string, unknown> = {}) => (
    <div className="vendor-field">
      {createElement('md-outlined-text-field', {
        ref: (el: HTMLElement | null) => {
          fieldRefs.current[key] = el;
        },
        label,
        value: form[key],
        required: true,
        error: Boolean(errors[key]),
        onInput: set(key),
        ...extra,
      })}
      {errors[key] && (
        <p className="error-state" role="alert">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <div className="admin-page admin-page--wide">
      <title>Add member · MSD</title>
      <header className="page-head">
        <div>
          <h1>Add member</h1>
          <p>Create the member's login. They are active straight away and get a welcome message. You complete the rest of the profile next.</p>
        </div>
      </header>

      {formError && (
        <p className="error-state" role="alert">
          {formError}
        </p>
      )}

      <section className="panel" aria-label="Member details">
        {field('businessName', 'Business name', { maxlength: MAX_BUSINESS_NAME })}
        {field('ownerFirstName', 'Owner first name', { autocomplete: 'given-name', maxlength: MAX_PERSON_NAME })}
        {field('ownerLastName', 'Owner last name', { autocomplete: 'family-name', maxlength: MAX_PERSON_NAME })}
        {field('ownerEmail', 'Owner email', { type: 'email', autocomplete: 'email', maxlength: MAX_EMAIL })}
        {field('ownerMobile', 'Owner mobile number', { type: 'tel', inputmode: 'numeric', maxlength: 10, autocomplete: 'tel-national' })}
        <FilledButton disabled={saving} onClick={submit}>
          Create member
        </FilledButton>
      </section>
    </div>
  );
}

export default MemberNewPage;
