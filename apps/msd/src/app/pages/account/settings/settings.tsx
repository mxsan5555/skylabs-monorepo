import { useEffect, useState } from 'react';
import {
  FilledButton,
  OutlinedButton,
  TextButton,
  IconButton,
  OutlinedTextField,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMyProfile, updateMyProfile } from '../../../../api/rbac/me';
import type { UserRecord } from '../../../../api/rbac/users';
import { ApiRequestError } from '../../../../api/rbac/client';
import { extractFieldErrors } from '../../../../utils/field-errors';

type ProfileFieldKey = 'name' | 'email' | 'phone';

export function MyProfileSettings() {
  const { token } = useAuth();

  /*
   * Backend profile data
   */
  const [user, setUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProfileFieldKey, string>> | null>(null);
  const [message, setMessage] = useState('');

  /*
   * Existing address data and address CRUD.
   * This part intentionally remains the same as ProfileForm.
   */
  const {
    addresses,
    addAddress,
    updateAddress,
    removeAddress,
  } = useAccount();

  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  /*
   * Load logged-in user's profile from backend.
   */
  useEffect(() => {
    setLoading(true);
    setError('');

    getMyProfile(token)
      .then(({ data }) => {
        setUser(data);

        setForm({
          name: data.name,
          email: data.email ?? '',
          phone: data.phone ?? '',
        });
      })
      .catch((err) => {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : 'Could not load your profile.',
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  /*
   * Save logged-in user's profile to backend.
   */
  const saveProfile = async () => {
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

      setForm({
        name: data.name,
        email: data.email ?? '',
        phone: data.phone ?? '',
      });

      setMessage('Profile saved.');

      window.setTimeout(() => {
        setMessage('');
      }, 2000);
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

  /*
   * Address actions — unchanged from ProfileForm.
   */
  const startAdd = () => {
    setDraft(EMPTY);
    setEditingId('new');
  };

  const startEdit = (address: Address) => {
    const { id, ...rest } = address;
    void id;

    setDraft({
      line2: '',
      ...rest,
    });

    setEditingId(address.id);
  };

  const submitAddress = () => {
    if (editingId === 'new') {
      addAddress(draft);
    } else if (editingId) {
      updateAddress(editingId, draft);
    }

    setEditingId(null);
  };

  const patch = (key: keyof Draft) => (e: Event) =>
    setDraft((current) => ({
      ...current,
      [key]: value(e),
    }));

  return (
    <div className="admin-page">
      <title>My Profile · MSD</title>

      <header className="page-head">
        <div>
          <h1>My Account</h1>
          <p>Manage your contact details and saved addresses.</p>
        </div>
      </header>

      {loading ? (
        <p className="loading-state">Loading your profile…</p>
      ) : (
        <>
          {error && (
            <p className="error-state" role="alert">
              {error}
            </p>
          )}

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

              {message && (
                <span className="otp-muted" role="status">
                  Saved
                </span>
              )}
            </div>

            <div className="account-fields">
              <OutlinedTextField
                label="Name"
                value={form.name}
                onInput={(e: Event) =>
                  setForm((current) => ({
                    ...current,
                    name: value(e),
                  }))
                }
              />

              <OutlinedTextField
                label="Email"
                type="email"
                autocomplete="email"
                value={form.email}
                onInput={(e: Event) =>
                  setForm((current) => ({
                    ...current,
                    email: value(e),
                  }))
                }
              />

              <OutlinedTextField
                label="Phone"
                type="tel"
                autocomplete="tel"
                value={form.phone}
                onInput={(e: Event) =>
                  setForm((current) => ({
                    ...current,
                    phone: value(e),
                  }))
                }
              />

              <OutlinedTextField
                label="Role"
                value={
                  user?.roles.map((role) => role.name).join(', ') || '—'
                }
                disabled
              />
            </div>

            <div>
              <FilledButton onClick={saveProfile} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </FilledButton>
            </div>
          </section>

          {/* ================================
              ADDRESSES
              Existing implementation kept
             ================================= */}
          {/* <section className="account-card">
            <div className="account-card__head">
              <h2>Addresses</h2>

              {editingId === null && (
                <OutlinedButton onClick={startAdd}>
                  <Icon slot="icon" aria-hidden="true">
                    add
                  </Icon>
                  Add address
                </OutlinedButton>
              )}
            </div>

            {editingId !== null && (
              <div className="address-form">
                {ADDRESS_FIELDS.map((field) => (
                  <OutlinedTextField
                    key={String(field.key)}
                    className={field.span2 ? 'span-2' : undefined}
                    label={field.label}
                    value={draft[field.key] ?? ''}
                    onInput={patch(field.key)}
                  />
                ))}

                <div className="address-form__actions">
                  <TextButton onClick={() => setEditingId(null)}>
                    Cancel
                  </TextButton>

                  <FilledButton onClick={submitAddress}>
                    {editingId === 'new' ? 'Add' : 'Save'}
                  </FilledButton>
                </div>
              </div>
            )}

            {addresses.length === 0 && editingId === null ? (
              <p className="address-empty">No addresses yet.</p>
            ) : (
              <ul className="address-list">
                {addresses.map((address: Address) => (
                  <li className="address-card" key={address.id}>
                    <div>
                      <div className="address-card__label">
                        {address.label}
                      </div>

                      <div className="address-card__lines">
                        {address.line1}
                        {address.line2 ? `, ${address.line2}` : ''}
                        <br />
                        {address.city}, {address.state}{' '}
                        {address.postalCode}
                        <br />
                        {address.country}
                      </div>
                    </div>

                    <div className="address-card__actions">
                      <IconButton
                        aria-label={`Edit ${address.label} address`}
                        onClick={() => startEdit(address)}
                      >
                        <Icon aria-hidden="true">edit</Icon>
                      </IconButton>

                      <IconButton
                        aria-label={`Delete ${address.label} address`}
                        onClick={() => removeAddress(address.id)}
                      >
                        <Icon aria-hidden="true">delete</Icon>
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section> */}
        </>
      )}
    </div>
  );
}

export default MyProfileSettings;