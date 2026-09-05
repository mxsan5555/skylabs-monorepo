import { useRef, useState } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { Dialog, FilledButton, OutlinedTextField, TextButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { createUser, type UserRecord } from '../../../../api/rbac/users';
import { ApiRequestError } from '../../../../api/rbac/client';
import type { Role } from '../../../../api/rbac/roles';

export function CreateUserDialog({ roles, onCreated }: { roles: Role[]; onCreated: (user: UserRecord) => void }) {
  const { token } = useAuth();
  const dialogRef = useRef<MdDialog>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleRole = (roleId: string) => {
    setRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  const submit = async () => {
    setError('');
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!form.email.trim() && !form.phone.trim()) {
      setError('Provide at least an email or a phone number.');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await createUser(token, {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        roleIds: Array.from(roleIds),
      });
      onCreated(data);
      setForm({ name: '', email: '', phone: '' });
      setRoleIds(new Set());
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create user.');
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
            value={form.name}
            onInput={(e: Event) => setForm((f) => ({ ...f, name: (e.target as HTMLInputElement).value }))}
          />
          <OutlinedTextField
            label="Email"
            type="email"
            value={form.email}
            onInput={(e: Event) => setForm((f) => ({ ...f, email: (e.target as HTMLInputElement).value }))}
          />
          <OutlinedTextField
            label="Phone"
            type="tel"
            value={form.phone}
            onInput={(e: Event) => setForm((f) => ({ ...f, phone: (e.target as HTMLInputElement).value }))}
          />
          <fieldset>
            <legend>Roles</legend>
            {roles.map((role) => (
              <label key={role.id} className="widget-assign-row__label">
                <input type="checkbox" checked={roleIds.has(role.id)} onChange={() => toggleRole(role.id)} />
                {role.name}
              </label>
            ))}
          </fieldset>
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
