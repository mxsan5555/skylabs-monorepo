import { useState, type FormEvent } from 'react';
import {
  FilledButton,
  Icon,
  OutlinedTextField,
} from '@skylabs-monorepo/shared-ui/react';
import { showSnackbar } from '../../../snackbar/snackbar';
import { EMAIL_REGEX, MOBILE_REGEX, fillTemplate, inputValue } from '../../../utils/format';
import { submitContactMessage } from '../../../api/contact';
import { ApiRequestError } from '../../../api/rbac/client';
import content from '../../../content.json';

const t = content.contact.form;

type Field = 'name' | 'email' | 'phone' | 'subject' | 'message';
const EMPTY: Record<Field, string> = {
  name: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
};

export function ContactForm({ to }: { to: string }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (key: Field) => (e: Event) =>
    setForm((f) => ({ ...f, [key]: inputValue(e) }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const v = Object.fromEntries(
      Object.entries(form).map(([k, x]) => [k, x.trim()]),
    ) as Record<Field, string>;

    const problem =
      !v.name || !v.email || !v.subject || !v.message
        ? t.required
        : !EMAIL_REGEX.test(v.email)
          ? t.invalidEmail
          : v.phone && !MOBILE_REGEX.test(v.phone)
            ? t.invalidPhone
            : '';

    setError(problem);
    if (problem) return;

    try {
      setSubmitting(true);

      // 1. Pehle DB mein save (proper API client se)
      await submitContactMessage({
        name: v.name,
        email: v.email,
        phone: v.phone || undefined,
        subject: v.subject,
        message: v.message,
      });

      // 2. Phir Outlook / Gmail open karo
      const body = fillTemplate(t.mailBody, v).trim();
      window.location.href = `mailto:${to}?subject=${encodeURIComponent(
        v.subject,
      )}&body=${encodeURIComponent(body)}`;

      showSnackbar(t.opened, { variant: 'success' });
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : 'Something went wrong. Please try again.';
      showSnackbar(message, { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className="form-grid"
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="contact-form-heading"
    >
      <h2 id="contact-form-heading" className="form-grid__full headline-small">
        {t.heading}
      </h2>

      <OutlinedTextField
        label={t.name}
        value={form.name}
        required
        autocomplete="name"
        onInput={set('name')}
      />
      <OutlinedTextField
        label={t.email}
        type="email"
        value={form.email}
        required
        autocomplete="email"
        onInput={set('email')}
      />
      <OutlinedTextField
        label={t.phone}
        type="tel"
        value={form.phone}
        autocomplete="tel-national"
        onInput={set('phone')}
      />
      <OutlinedTextField
        label={t.subject}
        value={form.subject}
        required
        onInput={set('subject')}
      />
      <OutlinedTextField
        className="form-grid__full"
        label={t.message}
        type="textarea"
        rows={5}
        value={form.message}
        required
        onInput={set('message')}
      />

      {error && (
        <p className="error-state" role="alert">
          {error}
        </p>
      )}

      <p className="form-grid__full body-medium text-muted">{t.hint}</p>

      <div className="form-actions">
        <FilledButton type="submit" disabled={submitting}>
          <Icon slot="icon" aria-hidden="true">
            send
          </Icon>
          {t.submit}
        </FilledButton>
      </div>
    </form>
  );
}