import { useEffect, useState } from 'react';
import { FilledButton, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMyProfile, updateMyProfile } from '../../../../api/rbac/me';
import type { UserRecord } from '../../../../api/rbac/users';
import { ApiRequestError } from '../../../../api/rbac/client';

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
      setError(err instanceof ApiRequestError ? err.message : 'Could not save your profile.');
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
