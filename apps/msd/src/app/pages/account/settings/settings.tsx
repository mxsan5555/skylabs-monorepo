import { useEffect, useState } from 'react';
import { FilledButton, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMyProfile, updateMyProfile } from '../../../../api/rbac/me';
import type { UserRecord } from '../../../../api/rbac/users';
import { ApiRequestError } from '../../../../api/rbac/client';
import { extractFieldErrors } from '../../../../utils/field-errors';

type ProfileFieldKey = 'name' | 'email' | 'phone';

/**
 * Every authenticated user's own profile — Name/Email/Phone editable, Role always read-only.
 * `PATCH /rbac/users/me` has no `role`/`roleIds` field on its schema at all, so "a Superadmin
 * can't change their own role" holds by construction here, not as a special case: the field is
 * never even sent, and the backend would ignore it regardless.
 */
export function MyProfileSettings() {
  const { token } = useAuth();
  const [user, setUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProfileFieldKey, string>> | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    getMyProfile(token)
      .then(({ data }) => {
        setUser(data);
        setForm({ name: data.name, email: data.email ?? '', phone: data.phone ?? '' });
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load your profile.'))
      .finally(() => setLoading(false));
  }, [token]);

  const save = async () => {
    setSaving(true);
    setError('');
    setFieldErrors(null);
    setMessage('');
    try {
      const { data } = await updateMyProfile(token, {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
      });
      setUser(data);
      setMessage('Profile saved.');
    } catch (err) {
      const fields = extractFieldErrors<ProfileFieldKey>(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not save your profile.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page">
      <title>My Profile · MSD</title>
      <header className="page-head">
        <div>
          <h1>My Profile</h1>
          <p>View and update your own account details.</p>
        </div>
      </header>

      {loading ? (
        <p className="loading-state">Loading your profile…</p>
      ) : (
        <>
          {message && <p className="field-hint" role="status">{message}</p>}
          {error && <p className="error-state" role="alert">{error}</p>}

          <div className="form-grid">
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
            {/* Read-only by design — never an editable field. See this component's own doc comment. */}
            <OutlinedTextField label="Role" value={user?.roles.map((r) => r.name).join(', ') || '—'} disabled />

            <div className="form-actions">
              <FilledButton onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </FilledButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default MyProfileSettings;