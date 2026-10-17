import { createElement, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { createMember, type MemberCreateInput } from '../../../../api/rbac/members';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { useConfirmDialog } from '../../../components/confirm-dialog';

// sky-feature-card shrink-wraps slotted content; it is a size container with 24px padding, so this fills it.
const FILL_CARD = { inlineSize: 'calc(100cqw - 48px)' } as const;

const SECTION_HEADING = { margin: '0 0 16px', color: 'var(--md-sys-color-on-surface)' } as const;

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

/** First message per field from a Zod `flatten()` (`details.fieldErrors`), limited to this form's fields. */
function zodFieldErrors(details: unknown): FieldErrors | null {
  const fieldErrors = (details as { fieldErrors?: Record<string, string[] | undefined> } | undefined)?.fieldErrors;
  if (!fieldErrors) return null;
  const found: FieldErrors = {};
  for (const key of FIELD_ORDER) {
    const first = fieldErrors[key]?.[0];
    if (first) found[key] = first;
  }
  return Object.keys(found).length > 0 ? found : null;
}

function zodFormError(details: unknown): string | null {
  const formErrors = (details as { formErrors?: string[] } | undefined)?.formErrors;
  return formErrors?.[0] ?? null;
}

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
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const idBase = useId();
  const errorId = (key: FieldKey) => `${idBase}-${key}-error`;

  useSetBreadcrumbs([{ label: 'Members' }, { label: 'All members', to: '/account/members' }, { label: 'Add member' }]);

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

  const cancel = () => navigate('/account/members');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const found = validateMember(form);
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length > 0) {
      setFocusRequest((n) => n + 1);
      return;
    }
    // Valid form: ask before creating. Discard (or Escape) throws the entry away and leaves the page.
    const create = await confirm({
      title: 'Create this member?',
      message: `Create "${form.businessName.trim()}" as a new member? They are active straight away and get a welcome message.`,
      confirmLabel: 'Create member',
      cancelLabel: 'Discard',
    });
    if (!create) {
      cancel();
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
        // A conflict sends `details.fields`; a 400 or 422 sends Zod's `fieldErrors` / `formErrors`.
        const fields = (err.details as { fields?: FieldErrors } | undefined)?.fields ?? zodFieldErrors(err.details);
        if (fields) {
          setErrors(fields);
          setFocusRequest((n) => n + 1);
        } else {
          setFormError(zodFormError(err.details) ?? err.message);
        }
      } else {
        setFormError('Could not create the member. Try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  // The M3 text field keeps its input in shadow DOM, so the browser's implicit submission on Enter
  // never reaches this form. Submit it ourselves.
  const submitOnEnter = (e: KeyboardEvent<HTMLFormElement>) => {
    const target = e.target as HTMLElement;
    if (e.key !== 'Enter' || target.tagName !== 'MD-OUTLINED-TEXT-FIELD') return;
    e.preventDefault();
    e.currentTarget.requestSubmit();
  };

  // md-filled-button submits its form a task after the click unless the click was prevented. Submit
  // straight away instead, which also works where form-associated elements are missing (jsdom).
  const submitFromButton = (e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.currentTarget.closest('form')?.requestSubmit();
  };

  // Raw M3 element: the @lit/react wrapper does not bind input events or labels under jsdom, so
  // tests could not drive it. Same convention as therapist-form-page.tsx.
  const field = (key: FieldKey, label: string, extra: Record<string, unknown> = {}, full = false) => (
    <div className="vendor-field" style={full ? { gridColumn: '1 / -1' } : undefined}>
      {createElement('md-outlined-text-field', {
        ref: (el: HTMLElement | null) => {
          fieldRefs.current[key] = el;
        },
        label,
        value: form[key],
        required: true,
        error: Boolean(errors[key]),
        // M3 shows error-text as the field's supporting text and links it to the inner input.
        'error-text': errors[key] ?? '',
        ...(errors[key] ? { 'aria-describedby': errorId(key) } : {}),
        onInput: set(key),
        ...extra,
      })}
      {/* Announced once for screen readers; the field shows the same text visibly as error-text. */}
      {errors[key] && (
        <p id={errorId(key)} className="error-state sr-only" role="alert">
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

      <form aria-label="Member details" noValidate onSubmit={submit} onKeyDown={submitOnEnter}>
        <sky-feature-card color="surface" variant="filled" shape="medium">
          <section aria-labelledby={`${idBase}-business`} style={{ ...FILL_CARD, marginBlockEnd: 24 }}>
            <h2 id={`${idBase}-business`} className="title-medium" style={SECTION_HEADING}>
              Business details
            </h2>
            <div className="vendor-fields-grid">{field('businessName', 'Business name', { maxlength: MAX_BUSINESS_NAME }, true)}</div>
          </section>
          <section aria-labelledby={`${idBase}-owner`} style={{ ...FILL_CARD, marginBlockEnd: 24 }}>
            <h2 id={`${idBase}-owner`} className="title-medium" style={SECTION_HEADING}>
              Owner details
            </h2>
            <div className="vendor-fields-grid">
              {field('ownerFirstName', 'Owner first name', { autocomplete: 'given-name', maxlength: MAX_PERSON_NAME })}
              {field('ownerLastName', 'Owner last name', { autocomplete: 'family-name', maxlength: MAX_PERSON_NAME })}
              {field('ownerEmail', 'Owner email', { type: 'email', autocomplete: 'email', maxlength: MAX_EMAIL })}
              {field('ownerMobile', 'Owner mobile number', { type: 'tel', inputmode: 'numeric', maxlength: 10, autocomplete: 'tel-national' })}
            </div>
          </section>
          <div slot="actions" className="page-head__actions" style={{ ...FILL_CARD, justifyContent: 'flex-end' }}>
            {createElement('md-text-button', { type: 'button', disabled: saving, onClick: cancel }, 'Cancel')}
            {createElement('md-filled-button', { type: 'submit', disabled: saving, onClick: submitFromButton }, 'Create member')}
          </div>
        </sky-feature-card>
      </form>
      {ConfirmDialog}
    </div>
  );
}

export default MemberNewPage;
