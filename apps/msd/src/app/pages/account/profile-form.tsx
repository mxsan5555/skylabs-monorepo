import { useEffect, useState } from 'react';
import { FilledButton, OutlinedButton, TextButton, IconButton, OutlinedTextField, Icon, } from '@skylabs-monorepo/shared-ui/react';
import { useAccount } from '../../../account/account-context';
import type { Address } from '../../../types';
import { validateEmail, validatePhone } from '../../../utils/validation';
import content from '../../../content.json';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMyProfile, updateMyProfile, } from '../../../api/rbac/me';
import { ApiRequestError } from '../../../api/rbac/client';
import { useToast } from '../../../toast/toast-context';
type Draft = Omit<Address, 'id'>;
const EMPTY: Draft = {
  label: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
};
/** One source of truth for the address form — add a field by extending this. */
const ADDRESS_FIELDS: {
  key: keyof Draft;
  label: string;
  span2?: boolean;
}[] = [
    { key: 'label', label: 'Label (e.g. Home, Work)', span2: true },
    { key: 'line1', label: 'Address line 1', span2: true },
    { key: 'line2', label: 'Address line 2', span2: true },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'postalCode', label: 'Postal code' },
    { key: 'country', label: 'Country' },
  ];
const value = (e: Event) =>
  (e.target as HTMLInputElement).value;
/**
 * The actual "edit email/phone + manage saved addresses" form.
 *
 * Email and phone are loaded/saved through the authenticated user's
 * `/me` API. Addresses still use the existing account store until
 * address APIs are available.
 */
export function ProfileForm() {
  const { addresses, addAddress, updateAddress, removeAddress, } = useAccount();
  const { token } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [originalPhone, setOriginalPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  useEffect(() => {
    setLoading(true);
    setError('');
    getMyProfile(token)
      .then(({ data }) => { setName(data.name ?? ''); setEmail(data.email ?? ''); setPhone(data.phone ?? ''); setOriginalPhone(data.phone ?? ''); })
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.message : 'Could not load your profile.',);
      })
      .finally(() => { setLoading(false); });
  }, [token]);
  const saveProfile = async () => {
    setError('');

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setError('Name is required.');
      return;
    }

    if (trimmedEmail && !validateEmail(trimmedEmail)) {
      setError(content.validation.email.invalid);
      return;
    }

    try {
      const { data } = await updateMyProfile(token, {
        name: trimmedName,
        email: trimmedEmail || undefined,
      });

      setName(data.name ?? '');
      setEmail(data.email ?? '');
      setPhone(data.phone ?? '');
      setEditing(false);
      showToast('Profile updated successfully.', 'success');
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'Could not save your profile.',
      );
    }
  };
  const startAdd = () => {
    setDraft(EMPTY);
    setEditingId('new');
  };
  const startEdit = (a: Address) => {
    const { id, ...rest } = a;
    void id;
    setDraft({ line2: '', ...rest, });
    setEditingId(a.id);
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
    setDraft((d) => ({ ...d, [key]: value(e), }));
  return (
    <>
      {loading ? (<p className="loading-state">Loading your profile…</p>
      ) : (
        <>
          {error && (<p className="error-state" role="alert">{error}</p>)}
          <section className="account-card">
            <div className="account-fields">
              <OutlinedTextField
                label="Name"
                value={name}
                readOnly={!editing}
                onInput={(e: Event) => setName(value(e))}
              />

              <OutlinedTextField
                label="Email"
                type="email"
                autocomplete="email"
                value={email}
                readOnly={!editing}
                onInput={(e: Event) => setEmail(value(e))}
              />

              <OutlinedTextField
                label="Phone"
                type="tel"
                autocomplete="tel"
                value={phone}
                readOnly
              />
            </div>

            <div className="account-card__actions">
              {!editing ? (
                <OutlinedButton onClick={() => setEditing(true)}>
                  <Icon slot="icon" aria-hidden="true">
                    edit
                  </Icon>
                  Edit
                </OutlinedButton>
              ) : (
                <>
                  <OutlinedButton onClick={() => setEditing(false)}>
                    Cancel
                  </OutlinedButton>

                  <OutlinedButton onClick={saveProfile}>
                    Update
                  </OutlinedButton>
                </>
              )}
            </div>


          </section>
          {/* <section className="account-card">
            <div className="account-card__head">
              <h2>Addresses</h2>
              {editingId === null && (
                <OutlinedButton onClick={startAdd}>
                  <Icon slot="icon" aria-hidden="true">add</Icon>Add address
                </OutlinedButton>
              )}
            </div>
            {editingId !== null && (
              <div className="address-form">
                {ADDRESS_FIELDS.map((f) => (
                  <OutlinedTextField
                    key={f.key}
                    className={f.span2 ? 'span-2' : undefined}
                    label={f.label}
                    value={draft[f.key] ?? ''}
                    onInput={patch(f.key)}
                  />
                ))}
                <div className="address-form__actions">
                  <TextButton onClick={() => setEditingId(null)}>Cancel</TextButton>
                  <FilledButton onClick={submitAddress}>{editingId === 'new' ? 'Add' : 'Save'}</FilledButton>
                </div>
              </div>
            )}
            {addresses.length === 0 &&
              editingId === null ? (
              <p className="address-empty">No addresses yet.</p>
            ) : (
              <ul className="address-list">
                {addresses.map((a) => (
                  <li className="address-card" key={a.id}>
                    <div>
                      <div className="address-card__label">{a.label}
                      </div>
                      <div className="address-card__lines">
                        {a.line1}
                        {a.line2 ? `, ${a.line2}` : ''}
                        <br />
                        {a.city}, {a.state}{' '}
                        {a.postalCode}
                        <br />
                        {a.country}
                      </div>
                    </div>
                    <div className="address-card__actions">
                      <IconButton aria-label={`Edit ${a.label} address`}
                        onClick={() => startEdit(a)}>
                        <Icon aria-hidden="true">edit</Icon>
                      </IconButton>
                      <IconButton aria-label={`Delete ${a.label} address`} onClick={() => removeAddress(a.id)}>
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
    </>
  );
}
export default ProfileForm;