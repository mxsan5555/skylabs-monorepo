import { useRef, useState } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { Dialog, FilledButton, OutlinedTextField, OutlinedSelect, SelectOption, TextButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { createUser, type UserRecord } from '../../../../api/rbac/users';
import { ApiRequestError } from '../../../../api/rbac/client';
import type { Role } from '../../../../api/rbac/roles';
import { extractFieldErrors } from '../../../../utils/field-errors';
import content from '../../../../content.json';
import { validateEmail, validatePhone } from '../../../../utils/validation';
type CreateUserFieldKey = 'name' | 'email' | 'phone' | 'roleId';

/** Role keys that mean "this account owns a member business" — mirrors msd-api's
 *  `lib/role-keys.ts#MEMBER_ROLE_KEYS` ('member' is canonical; 'vendor' tolerated during the
 *  in-progress rename so this stays correct regardless of which key a given environment's Role
 *  row still carries). */
const MEMBER_ROLE_KEYS = ['member', 'vendor'];

/** Eligible internal staff roles — Member is excluded here even though `roles` (from
 *  `GET /rbac/roles`) already excludes Customer server-side, since Member must never be an
 *  option in staff Add/Edit even though it's still shown in Role Management itself. */
export function eligibleStaffRoles(roles: Role[]): Role[] {
  return roles.filter((r) => !MEMBER_ROLE_KEYS.includes(r.key));
}

export function CreateUserDialog({ roles, onCreated }: { roles: Role[]; onCreated: (user: UserRecord) => void }) {
  const { token } = useAuth();
  const dialogRef = useRef<MdDialog>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [roleId, setRoleId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CreateUserFieldKey, string>> | null>(null);

  const staffRoles = eligibleStaffRoles(roles);

  const submit = async () => {
    setError('');
    setFieldErrors(null);

    const errors: Partial<Record<CreateUserFieldKey, string>> = {};

    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();

    if (!name) {
      setError('Name is required.');
      return;
    }

    if (!email && !phone) {
      setError('Provide at least an email or a phone number.');
      return;
    }

    if (email && !validateEmail(email)) {
      errors.email = content.validation.email.invalid;
    }

    if (phone && !validatePhone(phone)) {
      errors.phone = content.validation.phone.invalid;
    }

    if (!roleId) {
      setError('Select one role.');
      return;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError('Fix the highlighted fields and try again.');
      return;
    }

    setSubmitting(true);

    try {
      const { data } = await createUser(token, {
        name,
        email: email || undefined,
        phone: phone || undefined,
        roleId,
      });

      onCreated(data);
      setForm({ name: '', email: '', phone: '' });
      setRoleId('');
      dialogRef.current?.close();
    } catch (err) {
      const fields = extractFieldErrors<CreateUserFieldKey>(err);

      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : 'Could not create user.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <>
      <FilledButton onClick={() => dialogRef.current?.show()}>
        <Icon slot="icon" aria-hidden="true">person_add</Icon>
        New user
      </FilledButton>
      <Dialog ref={dialogRef}>
        <div slot="headline">Create user</div>
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
          <OutlinedSelect
            label="Role"
            required
            value={roleId}
            onChange={(e: Event) => setRoleId((e.target as HTMLSelectElement).value)}
          >
            {staffRoles.map((role) => (
              <SelectOption key={role.id} value={role.id}>
                <div slot="headline">{role.name}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>
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
