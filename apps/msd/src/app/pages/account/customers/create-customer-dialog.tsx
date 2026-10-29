import { useRef, useState } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { Dialog, FilledButton, OutlinedTextField, TextButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { createCustomer, type Customer } from '../../../../api/rbac/customers';
import { ApiRequestError } from '../../../../api/rbac/client';
import { extractFieldErrors } from '../../../../utils/field-errors';
import content from '../../../../content.json';
import { validateEmail, validatePhone } from '../../../../utils/validation';

type CreateCustomerFieldKey = 'name' | 'email' | 'phone';

/** Super Admin adding a customer directly (matrix: Customers = VC). No internal-role selector —
 *  the backend resolves and assigns the existing `customer` role server-side; this form never
 *  offers a role to pick. Reuses the existing identity rules (no verified-mobile shortcut — an
 *  admin-created customer looks exactly like a brand-new unauthenticated signup until they
 *  complete a real OTP login themselves). */
export function CreateCustomerDialog({ onCreated }: { onCreated: (customer: Customer) => void }) {
  const { token } = useAuth();
  const dialogRef = useRef<MdDialog>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CreateCustomerFieldKey, string>> | null>(null);

  const submit = async () => {
    setError('');
    setFieldErrors(null);

    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const errors: Partial<Record<CreateCustomerFieldKey, string>> = {};

    if (!name) {
      setError('Name is required.');
      return;
    }
    if (!email && !phone) {
      setError('Provide at least an email or a phone number.');
      return;
    }
    if (email && !validateEmail(email)) errors.email = content.validation.email.invalid;
    if (phone && !validatePhone(phone)) errors.phone = content.validation.phone.invalid;

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError('Fix the highlighted fields and try again.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await createCustomer(token, { name, email: email || undefined, phone: phone || undefined });
      onCreated(data);
      setForm({ name: '', email: '', phone: '' });
      dialogRef.current?.close();
    } catch (err) {
      const fields = extractFieldErrors<CreateCustomerFieldKey>(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not create customer.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <FilledButton onClick={() => dialogRef.current?.show()}>
        <Icon slot="icon" aria-hidden="true">person_add</Icon>
        New customer
      </FilledButton>
      <Dialog ref={dialogRef}>
        <div slot="headline">Create customer</div>
        <div slot="content" className="form-grid">
          <OutlinedTextField
            label="Name"
            required
            value={form.name}
            onInput={(e: Event) => setForm((f) => ({ ...f, name: (e.target as HTMLInputElement).value }))}
            error={Boolean(fieldErrors?.name)}
          />
          {fieldErrors?.name && <p className="error-state" role="alert">{fieldErrors.name}</p>}
          <OutlinedTextField
            label="Email"
            type="email"
            value={form.email}
            onInput={(e: Event) => setForm((f) => ({ ...f, email: (e.target as HTMLInputElement).value }))}
            error={Boolean(fieldErrors?.email)}
          />
          {fieldErrors?.email && <p className="error-state" role="alert">{fieldErrors.email}</p>}
          <OutlinedTextField
            label="Phone"
            type="tel"
            value={form.phone}
            onInput={(e: Event) => setForm((f) => ({ ...f, phone: (e.target as HTMLInputElement).value }))}
            error={Boolean(fieldErrors?.phone)}
          />
          {fieldErrors?.phone && <p className="error-state" role="alert">{fieldErrors.phone}</p>}
          {error && <p className="error-state" role="alert">{error}</p>}
        </div>
        <div slot="actions">
          <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
          <FilledButton onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </FilledButton>
        </div>
      </Dialog>
    </>
  );
}

export default CreateCustomerDialog;
