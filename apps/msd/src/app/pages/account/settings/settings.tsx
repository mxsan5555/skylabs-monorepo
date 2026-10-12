import { useEffect, useState } from 'react';
import { FilledButton, CircularProgress, OutlinedTextField, } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMyProfile, updateMyProfile } from '../../../../api/rbac/me';
import type { UserRecord } from '../../../../api/rbac/users';
import { ApiRequestError } from '../../../../api/rbac/client';
import { extractFieldErrors } from '../../../../utils/field-errors';
import content from '../../../../content.json';
import { validateEmail, validatePhone, } from '../../../../utils/validation';

type ProfileFieldKey = 'name' | 'email' | 'phone';
export function MyProfileSettings() {
  const { token } = useAuth();
  const [user, setUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', });
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
        setForm({
          name: data.name ?? '',
          email: data.email ?? '',
          phone: data.phone ?? '',
        });
      })
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.message : 'Could not load your profile.');
      })
      .finally(() => { setLoading(false); });
  }, [token]);
  const saveProfile = async () => {
    setError('');
    setFieldErrors(null);
    setMessage('');
    const errors: Partial<Record<ProfileFieldKey, string>> = {};
    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    if (!name) { errors.name = 'Please enter your name.'; }
    if (email && !validateEmail(email)) { errors.email = content.validation.email.invalid; }
    if (phone && !validatePhone(phone)) { errors.phone = content.validation.phone.invalid; }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError('Fix the highlighted fields and try again.');
      return;
    }

    setSaving(true);
    try {
      const { data } = await updateMyProfile(token, {
        name,
        email: email || undefined,
        phone: phone || undefined,
      });
      setUser(data);
      setForm({ name: data.name ?? '', email: data.email ?? '', phone: data.phone ?? '', });
      setMessage('Saved');
    } catch (err) {
      const fields = extractFieldErrors<ProfileFieldKey>(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not save your profile.');
      }
    } finally { setSaving(false); }
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
        <div className="profile-loading">
          <CircularProgress
            indeterminate
            aria-label="Loading your profile"
          />
        </div>
      ) : (
        <>
          {error && (<p className="error-state" role="alert">{error}</p>)}
          <section className="account-card">
            <div className="account-card__head">
              <div>
                <h2>Contact details</h2>
                <p>Update your personal account information.</p>
              </div>
              {message && ( <sky-badge className="otp-muted" role="status">{message} </sky-badge>)}
            </div>
            <div className="account-fields">
              <div>
                <OutlinedTextField
                  label="Name"
                  required
                  value={form.name}
                  onInput={(e: Event) => setForm((current) => ({ ...current, name: (e.target as HTMLInputElement).value, }))}
                  error={Boolean(fieldErrors?.name)}
                />
                {fieldErrors?.name && (
                  <p className="error-state" role="alert">{fieldErrors.name}</p>
                )}
              </div>
              <div>
                <OutlinedTextField
                  label="Email"
                  type="email"
                  value={form.email}
                  onInput={(e: Event) => setForm((current) => ({ ...current, email: (e.target as HTMLInputElement).value, }))}
                  error={Boolean(fieldErrors?.email)}
                />
                {fieldErrors?.email && (<p className="error-state" role="alert">{fieldErrors.email}</p>
                )}
              </div>
              <div>
                <OutlinedTextField
                  label="Phone"
                  type="tel"
                  value={form.phone}
                  onInput={(e: Event) => setForm((current) => ({ ...current, phone: (e.target as HTMLInputElement).value, }))}
                  error={Boolean(fieldErrors?.phone)}
                />
                {fieldErrors?.phone && (
                  <p className="error-state" role="alert">{fieldErrors.phone}</p>
                )}
              </div>
              <div>
                <OutlinedTextField
                  label="Role"
                  value={user?.roles.map((role) => role.name).join(', ') || '—'}
                  disabled
                />
              </div>
            </div>
            <div>
              <FilledButton onClick={saveProfile} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</FilledButton>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
export default MyProfileSettings;