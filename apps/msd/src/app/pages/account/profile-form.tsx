import { useState } from 'react';
import {
  FilledButton,
  OutlinedButton,
  TextButton,
  IconButton,
  OutlinedTextField,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';
import { useAccount } from '../../../account/account-context';
import type { Address } from '../../../types';

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
const ADDRESS_FIELDS: { key: keyof Draft; label: string; span2?: boolean }[] = [
  { key: 'label', label: 'Label (e.g. Home, Work)', span2: true },
  { key: 'line1', label: 'Address line 1', span2: true },
  { key: 'line2', label: 'Address line 2', span2: true },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postalCode', label: 'Postal code' },
  { key: 'country', label: 'Country' },
];

const value = (e: Event) => (e.target as HTMLInputElement).value;

/**
 * The actual "edit email/phone + manage saved addresses" form — extracted out of the page
 * shell so both the admin-console `/account/profile` (staff/vendor, wrapped in `AdminPage`
 * inside `AdminLayout`) and the storefront `/my-account` (customers, wrapped in `AdminPage`
 * inside `PublicLayout`) render the exact same logic without duplicating it. Reads/writes
 * through `useAccount()` (the shared, localStorage-backed account store) same as before —
 * that data layer is unchanged by this split.
 */
export function ProfileForm() {
  const {
    profile,
    addresses,
    updateProfile,
    addAddress,
    updateAddress,
    removeAddress,
  } = useAccount();

  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [saved, setSaved] = useState(false);

  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const saveProfile = () => {
    updateProfile({ email, phone });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const startAdd = () => {
    setDraft(EMPTY);
    setEditingId('new');
  };
  const startEdit = (a: Address) => {
    const { id, ...rest } = a;
    void id;
    setDraft({ line2: '', ...rest });
    setEditingId(a.id);
  };
  const submitAddress = () => {
    if (editingId === 'new') addAddress(draft);
    else if (editingId) updateAddress(editingId, draft);
    setEditingId(null);
  };
  const patch = (key: keyof Draft) => (e: Event) =>
    setDraft((d) => ({ ...d, [key]: value(e) }));

  return (
    <>
      <section className="account-card">
        <div className="account-card__head">
          <h2>Contact details</h2>
          {saved && (
            <span className="otp-muted" role="status">
              Saved
            </span>
          )}
        </div>
        <div className="account-fields">
          <OutlinedTextField
            label="Email"
            type="email"
            autocomplete="email"
            value={email}
            onInput={(e: Event) => setEmail(value(e))}
          />
          <OutlinedTextField
            label="Phone"
            type="tel"
            autocomplete="tel"
            value={phone}
            onInput={(e: Event) => setPhone(value(e))}
          />
        </div>
        <div>
          <FilledButton onClick={saveProfile}>Save changes</FilledButton>
        </div>
      </section>

      <section className="account-card">
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
            {addresses.map((a) => (
              <li className="address-card" key={a.id}>
                <div>
                  <div className="address-card__label">{a.label}</div>
                  <div className="address-card__lines">
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ''}
                    <br />
                    {a.city}, {a.state} {a.postalCode}
                    <br />
                    {a.country}
                  </div>
                </div>
                <div className="address-card__actions">
                  <IconButton
                    aria-label={`Edit ${a.label} address`}
                    onClick={() => startEdit(a)}
                  >
                    <Icon aria-hidden="true">edit</Icon>
                  </IconButton>
                  <IconButton
                    aria-label={`Delete ${a.label} address`}
                    onClick={() => removeAddress(a.id)}
                  >
                    <Icon aria-hidden="true">delete</Icon>
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default ProfileForm;
