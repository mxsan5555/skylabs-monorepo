import { createElement, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  OutlinedTextField,
  OutlinedSelect,
  SelectOption,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';
import {
  registerPublicVendor,
  type VendorSelfInput,
} from '../../../api/rbac/vendors';
import { ApiRequestError } from '../../../api/rbac/client';
import {
  extractBecomeVendorFieldErrors,
  type BecomeVendorFieldKey,
} from '../account/cms/field-errors';
import { STATES, citiesForState } from '@skylabs-monorepo/shared-utils';
import { getCatalogContactUs } from '../../../api/catalog';
import { useCmsContent } from '../../../hooks/use-cms-content';
import {
  ContactDetails,
  contactInfo,
} from '../../components/contact-details/contact-details';
import { PageSection } from '../../components/page-section/page-section';
import { SectionHead } from '../../components/section-head/section-head';
import { SplitLayout } from '../../components/split-layout/split-layout';
import { StaticPage } from '../../components/static-page/static-page';
import { EMAIL_REGEX, MOBILE_REGEX, inputValue } from '../../../utils/format';
import content from '../../../content.json';
import './become-vendor.css';

const t = content.becomeMember;

const PINCODE_REGEX = /^\d{6}$/;

type Field = BecomeVendorFieldKey;
type BecomeVendorForm = Record<Field, string>;
type FormErrors = Partial<Record<Field, string>>;

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

/** Text-field options: input type, autocomplete hint and, for numeric fields, the digit count. */
type TextField = Exclude<Field, 'state' | 'city'>;
const FIELD_OPTIONS: Record<
  TextField,
  { type?: 'email' | 'tel'; autocomplete?: string; digits?: number }
> = {
  businessName: { autocomplete: 'organization' },
  businessEmail: { type: 'email', autocomplete: 'email' },
  businessPhone: { type: 'tel', autocomplete: 'tel-national', digits: 10 },
  ownerFirstName: { autocomplete: 'given-name' },
  ownerLastName: { autocomplete: 'family-name' },
  ownerEmail: { type: 'email', autocomplete: 'email' },
  ownerMobile: { type: 'tel', autocomplete: 'tel-national', digits: 10 },
  address: { autocomplete: 'street-address' },
  pincode: { autocomplete: 'postal-code', digits: 6 },
};

/** Optional fields checked against a pattern when filled in. */
const PATTERNS: Partial<Record<Field, [RegExp, string]>> = {
  businessEmail: [EMAIL_REGEX, t.errors.email],
  ownerEmail: [EMAIL_REGEX, t.errors.email],
  businessPhone: [MOBILE_REGEX, t.errors.mobile],
  ownerMobile: [MOBILE_REGEX, t.errors.mobile],
  pincode: [PINCODE_REGEX, t.errors.pincode],
};

const SECTIONS: { heading: string; fields: TextField[] }[] = [
  {
    heading: t.sections.business,
    fields: ['businessName', 'businessEmail', 'businessPhone'],
  },
  {
    heading: t.sections.owner,
    fields: ['ownerFirstName', 'ownerLastName', 'ownerEmail', 'ownerMobile'],
  },
];

const trimAll = (form: BecomeVendorForm) =>
  Object.fromEntries(
    Object.entries(form).map(([k, v]) => [k, v.trim()]),
  ) as BecomeVendorForm;

/**
 * Public, unauthenticated "Become a member" application (`POST /vendors/public/register`), the
 * storefront counterpart of the admin "Add member" wizard trimmed to a first pass: business name,
 * owner identity (name/email/mobile) and a basic address. `VendorSelfCreateSchema` has no KYC,
 * bank, branch or category fields, so this form cannot send anything privileged.
 *
 * Registration is closed: staff create every member, so the server answers every submit with 403
 * and a "contact our team" message. The page says so at the top and keeps the submit button off.
 * No token is ever sent with the request.
 *
 * Laid out like Contact: the static page header, then the form beside the partner team's contact
 * details (CMS `GET /catalog/contact-us` over content.json defaults).
 */
export function BecomeVendor() {
  const { data } = useCmsContent(getCatalogContactUs);
  const { items } = contactInfo(data);
  const [form, setForm] = useState<BecomeVendorForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const noticeId = useId();

  const set = (key: Field, value: string) => {
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === 'state' ? { city: '' } : {}),
    }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const validate = (v: BecomeVendorForm): boolean => {
    const next: FormErrors = {};
    if (!v.businessName) next.businessName = t.errors.businessName;
    for (const [key, [pattern, message]] of Object.entries(PATTERNS) as [
      Field,
      [RegExp, string],
    ][]) {
      if (v[key] && !pattern.test(v[key])) next[key] = message;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const v = trimAll(form);
    if (!validate(v)) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      // Only the filled-in fields; businessName is always present after validation.
      const input = Object.fromEntries(
        Object.entries(v).filter(([, x]) => x),
      ) as VendorSelfInput;
      await registerPublicVendor(input);
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const fieldErrors = extractBecomeVendorFieldErrors(err);
        if (fieldErrors) setErrors((prev) => ({ ...prev, ...fieldErrors }));
        // CONFLICT (email/phone already has an account) and RATE_LIMITED (429) both carry a
        // message clear enough to show as-is.
        setSubmitError(err.message);
      } else {
        setSubmitError(t.errors.submit);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const hasFieldErrors = Object.values(errors).some(Boolean);
  const cityOptions = citiesForState(form.state);

  /** One labelled text field and, below it, its error. */
  const textField = (key: TextField, required = false) => {
    const { type, autocomplete, digits } = FIELD_OPTIONS[key];
    return [
      <OutlinedTextField
        key={key}
        label={t.fields[key]}
        type={type}
        autocomplete={autocomplete}
        {...(digits && { inputMode: 'numeric', maxLength: digits })}
        value={form[key]}
        required={required}
        onInput={(e: Event) =>
          set(
            key,
            digits
              ? inputValue(e).replace(/\D/g, '').slice(0, digits)
              : inputValue(e),
          )
        }
        error={Boolean(errors[key])}
      />,
      errors[key] && (
        <p key={`${key}-error`} className="error-state">
          {errors[key]}
        </p>
      ),
    ];
  };

  const select = (
    key: 'state' | 'city',
    options: readonly string[],
    placeholder: string,
    disabled = false,
  ) => (
    <OutlinedSelect
      label={t.fields[key]}
      value={form[key]}
      onChange={(e: Event) => set(key, inputValue(e))}
      disabled={disabled}
    >
      <SelectOption value="">
        <div slot="headline">{placeholder}</div>
      </SelectOption>
      {options.map((option) => (
        <SelectOption key={option} value={option}>
          <div slot="headline">{option}</div>
        </SelectOption>
      ))}
    </OutlinedSelect>
  );

  if (submitted) {
    return (
      <PageSection aria-labelledby="become-member-success">
        <title>{t.success.metaTitle}</title>
        <div className="become-vendor__success" role="status">
          <Icon aria-hidden="true">check_circle</Icon>
          <h1 id="become-member-success">{t.success.heading}</h1>
          <p>{t.success.text}</p>
        </div>
      </PageSection>
    );
  }

  return (
    <StaticPage
      path={t.path}
      title={t.title}
      breadcrumb={t.breadcrumb}
      description={t.description}
      metaTitle={t.metaTitle}
      cta={null}
    >
      <PageSection tone="tint" aria-label={t.formLabel}>
        <SplitLayout
          asideLabel={t.asideHeading}
          aside={
            <div className="become-vendor__aside">
              <SectionHead
                id="become-member-contact"
                heading={t.asideHeading}
                subheading={t.asideText}
              />
              <ContactDetails items={items} />
            </div>
          }
        >
          <p id={noticeId} className="become-vendor__notice body-large">
            {t.notice.before}
            <Link className="text-link" to={content.contact.path}>
              {t.notice.link}
            </Link>
            {t.notice.after}
          </p>

          <form className="form-grid" onSubmit={submit} noValidate>
            {hasFieldErrors && (
              <p className="error-state" role="alert">
                {t.errors.summary}
              </p>
            )}
            {SECTIONS.map((section) => [
              <h2 key={section.heading} className="section-title">
                {section.heading}
              </h2>,
              ...section.fields.map((key) =>
                textField(key, key === 'businessName'),
              ),
            ])}

            <h2 className="section-title">{t.sections.address}</h2>
            {textField('address')}
            {select('state', STATES, t.selectState)}
            {select(
              'city',
              cityOptions,
              form.state ? t.selectCity : t.selectStateFirst,
              !form.state,
            )}
            {textField('pincode')}

            {submitError && (
              <p className="error-state" role="alert">
                {submitError}
              </p>
            )}

            <div className="form-actions">
              {/* Off for now: registration always ends in the contact-us answer shown above. */}
              {createElement(
                'md-filled-button',
                {
                  type: 'submit',
                  disabled: true,
                  'aria-describedby': noticeId,
                },
                t.submit,
              )}
            </div>
          </form>
        </SplitLayout>
      </PageSection>
    </StaticPage>
  );
}

export default BecomeVendor;
