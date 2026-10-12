
import { useEffect, useRef, useState } from 'react';
import { Dialog, OutlinedButton, OutlinedTextField, TextButton, } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMyProfile, updateMyProfile } from '../../../api/rbac/me';
import { ApiRequestError } from '../../../api/rbac/client';
import { listMyOrders } from '../../../api/orders';
import type { Order } from '../../../api/orders';
import { validateEmail } from '../../../utils/validation';
import content from '../../../content.json';

type AddressDraft = {
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingPincode: string;
};

const EMPTY_ADDRESS: AddressDraft = {
  shippingAddress: '',
  shippingCity: '',
  shippingState: '',
  shippingPincode: '',
};
const value = (event: Event) => (event.target as HTMLInputElement).value;
export function ProfileForm() {
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [originalEmail, setOriginalEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [shippingOrder, setShippingOrder] = useState<Order | null>(null);
  const [addressLoading, setAddressLoading] = useState(true);
  const [addressError, setAddressError] = useState('');
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressDraft, setAddressDraft] = useState<AddressDraft>(EMPTY_ADDRESS);
  const [originalAddress, setOriginalAddress] = useState<AddressDraft>(EMPTY_ADDRESS);
  const dialogRef = useRef<HTMLElement & { show: () => void; close: () => void }>(null);
  const addressDialogRef = useRef<HTMLElement & { show: () => void; close: () => void }>(null)
  const snackbarRef = useRef<HTMLElement & { show: (message: string) => void }>(null);
  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      setLoading(true);
      setError('');
      try {
        const { data } = await getMyProfile(token);
        if (cancelled) return;
        const profileName = data.name ?? '';
        const profileEmail = data.email ?? '';
        const profilePhone = data.phone ?? '';
        setName(profileName);
        setEmail(profileEmail);
        setPhone(profilePhone);
        setOriginalName(profileName);
        setOriginalEmail(profileEmail);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : 'Could not load your profile.',);
        }
      } finally {
        if (!cancelled) { setLoading(false); }
      }
    }
    void loadProfile();
    return () => { cancelled = true; };
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    async function loadAddress() {
      setAddressLoading(true);
      setAddressError('');
      try {
        const { data } = await listMyOrders(token, { page: 1, pageSize: 1, });
        if (cancelled) return;
        const latestOrder = [...data].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime(),
        )[0];
        setShippingOrder(latestOrder ?? null);
      } catch (err) {
        if (!cancelled) {
          setAddressError(err instanceof ApiRequestError ? err.message : 'Could not load your address.',);
        }
      } finally {
        if (!cancelled) { setAddressLoading(false); }
      }
    }
    void loadAddress();
    return () => { cancelled = true; };
  }, [token]);
  useEffect(() => {
    if (!shippingOrder) {
      setAddressDraft(EMPTY_ADDRESS);
      setOriginalAddress(EMPTY_ADDRESS);
      return;
    }
    const address: AddressDraft = {
      shippingAddress: shippingOrder.shippingAddress ?? '',
      shippingCity: shippingOrder.shippingCity ?? '',
      shippingState: shippingOrder.shippingState ?? '',
      shippingPincode: shippingOrder.shippingPincode ?? '',
    };
    setAddressDraft(address);
    setOriginalAddress(address);
  }, [shippingOrder]);
  const hasChanges =
    name.trim() !== originalName.trim() ||
    email.trim() !== originalEmail.trim();
  const hasAddressChanges = (Object.keys(addressDraft) as Array<keyof AddressDraft>
  ).some(
    (key) => addressDraft[key].trim() !== originalAddress[key].trim(),);
  const requestProfileUpdate = () => {
    setError('');
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      setError('Name is required.');
      return;
    }
    if (
      trimmedEmail &&
      !validateEmail(trimmedEmail)
    ) {
      setError(content.validation.email.invalid);
      return;
    }
    if (!hasChanges || saving) return;
    dialogRef.current?.show();
  };
  const confirmProfileUpdate = async () => {
    if (saving || !hasChanges) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await updateMyProfile(token, {
        name: name.trim(),
        email: email.trim() || undefined,
      });
      const updatedName = data.name ?? '';
      const updatedEmail = data.email ?? '';
      const updatedPhone = data.phone ?? '';
      setName(updatedName);
      setEmail(updatedEmail);
      setPhone(updatedPhone);
      setOriginalName(updatedName);
      setOriginalEmail(updatedEmail);
      dialogRef.current?.close();
      snackbarRef.current?.show('Your profile was updated successfully.',);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save your profile.',);
    } finally { setSaving(false); }
  };
  const updateAddressField =
    (key: keyof AddressDraft) => (event: Event) => {
      setAddressDraft((previous) => ({
        ...previous, [key]: value(event),
      }));
    };
  const requestAddressUpdate = () => {
    setAddressError('');
    if (!hasAddressChanges || addressSaving) return;
    addressDialogRef.current?.show();
  };
  const confirmAddressUpdate = () => {
    if (addressSaving || !hasAddressChanges) return;
    setAddressSaving(true);
    try {
      const updatedAddress = { ...addressDraft };
      setOriginalAddress(updatedAddress);
      setShippingOrder((previous) => previous ? { ...previous, ...updatedAddress } : previous,);
      addressDialogRef.current?.close();
      snackbarRef.current?.show('Address updated successfully.',);
    } finally { setAddressSaving(false); }
  };
  return (
    <>
      {loading ? (
        <p className="loading-state">Loading your profile…</p>
      ) : (
        <>
          {error && (<p className="error-state" role="alert">{error}</p>)}
          <section className="account-card">
            <div className="account-fields">
              <OutlinedTextField
                label="Name"
                value={name}
                onInput={(event: Event) => setName(value(event))}
              />
              <OutlinedTextField
                label="Email"
                type="email"
                autocomplete="email"
                value={email}
                onInput={(event: Event) => setEmail(value(event))}
              />
              <OutlinedTextField
                label="Phone"
                type="tel"
                autocomplete="tel"
                value={phone}
                required
                readOnly
              />
            </div>
            <div className="account-card__actions">
              <OutlinedButton
                disabled={!hasChanges || saving}
                onClick={requestProfileUpdate}
              >Update</OutlinedButton>
            </div>
          </section>
          <Dialog ref={dialogRef}>
            <div slot="headline">Update profile?</div>
            <div slot="content">Are you sure you want to update your records?</div>
            <div slot="actions">
              <TextButton disabled={saving} onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
              <TextButton
                disabled={saving}
                onClick={() => { void confirmProfileUpdate(); }}
              >{saving ? 'Updating…' : 'Okay'}</TextButton>
            </div>
          </Dialog>
          <section className="account-card">
            <div className="account-card__head">
              <h2>Delivery Address</h2>
            </div>
            {addressLoading ? (<p className="loading-state">Loading address…</p>
            ) : addressError ? (
              <p className="error-state" role="alert">{addressError}</p>
            ) : (
              <>
                <div className="account-fields address-fields">
                  <OutlinedTextField
                    label="Address"
                    value={addressDraft.shippingAddress}
                    onInput={updateAddressField('shippingAddress')}
                  />
                  <OutlinedTextField
                    label="City"
                    value={addressDraft.shippingCity}
                    onInput={updateAddressField('shippingCity')}
                  />
                  <OutlinedTextField
                    label="State"
                    value={addressDraft.shippingState}
                    onInput={updateAddressField('shippingState')}
                  />
                  <OutlinedTextField
                    label="Pincode"
                     required
                    value={addressDraft.shippingPincode}
                    onInput={updateAddressField('shippingPincode')}
                  />
                </div>
                <div className="account-card__actions">
                  <OutlinedButton
                    disabled={!hasAddressChanges || addressSaving}
                    onClick={requestAddressUpdate}
                  >{addressSaving ? 'Updating…' : 'Update'}
                  </OutlinedButton>
                </div>
              </>
            )}
          </section>
          <Dialog ref={addressDialogRef}>
            <div slot="headline">Update address?</div>
            <div slot="content">Are you sure you want to update your delivery address?</div>
            <div slot="actions">
              <TextButton disabled={addressSaving} onClick={() => addressDialogRef.current?.close()}>Cancel</TextButton>
              <TextButton disabled={addressSaving} onClick={confirmAddressUpdate}>
                {addressSaving ? 'Updating…' : 'Okay'}
              </TextButton>
            </div>
          </Dialog>
          <sky-snackbar ref={snackbarRef as React.RefObject<HTMLElement>}
            duration={4000}
            variant="success"
            role="status"
            aria-live="polite"
          />
        </>
      )}
    </>
  );
}
export default ProfileForm;
