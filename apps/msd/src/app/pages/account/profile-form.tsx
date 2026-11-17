import { useEffect, useRef, useState } from 'react';
import { createElement } from 'react';
import {
  Dialog,
  FilledButton,
  TextButton,
} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { STATES, citiesForState } from '@skylabs-monorepo/shared-utils';
import {
  getMyProfile,
  saveMyAddress,
  updateMyProfile,
  type MyAddressInput,
} from '../../../api/rbac/me';
import { ApiRequestError } from '../../../api/rbac/client';
import {
  FormField,
  asOptions,
  renderSelect,
  renderTextField,
} from '../../components/form-controls/form-controls';
import {
  FormPanel,
  FormPanelSection,
} from '../../components/form-panel/form-panel';
import { validateEmail } from '../../../utils/validation';
import { showSnackbar } from '../../../snackbar/snackbar';
import content from '../../../content.json';

const s = content.profileSettings;
const c = s.contact;
const t = s.address;
const fields = content.checkout.fields;
const EMPTY_ADDRESS: MyAddressInput = {
  address: '',
  state: '',
  city: '',
  pincode: '',
};
const PINCODE = /^\d{6}$/;

/** Profile page (`/my-account`, `/account/profile`): contact details and the saved delivery address
 *  (D37), each a `FormPanel` with its own save. */
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
  const [addressError, setAddressError] = useState('');
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressDraft, setAddressDraft] =
    useState<MyAddressInput>(EMPTY_ADDRESS);
  const [originalAddress, setOriginalAddress] =
    useState<MyAddressInput>(EMPTY_ADDRESS);
  const dialogRef = useRef<
    HTMLElement & { show: () => void; close: () => void }
  >(null);
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
        // The saved delivery address (D37), the same one checkout pre-fills.
        const saved = {
          address: data.address ?? '',
          state: data.state ?? '',
          city: data.city ?? '',
          pincode: data.pincode ?? '',
        };
        setAddressDraft(saved);
        setOriginalAddress(saved);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : s.loadFailed);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [token]);
  const hasChanges =
    name.trim() !== originalName.trim() ||
    email.trim() !== originalEmail.trim();
  const hasAddressChanges = (
    Object.keys(addressDraft) as (keyof MyAddressInput)[]
  ).some((key) => addressDraft[key].trim() !== originalAddress[key].trim());
  const requestProfileUpdate = () => {
    setError('');
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      setError(s.nameRequired);
      return;
    }
    if (trimmedEmail && !validateEmail(trimmedEmail)) {
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
      showSnackbar(s.saved, {
        variant: 'success',
      });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : s.saveFailed);
    } finally {
      setSaving(false);
    }
  };
  const setAddress = (key: keyof MyAddressInput) => (next: string) =>
    setAddressDraft((previous) => ({ ...previous, [key]: next }));
  /** A new state clears the city, which belonged to the old one. */
  const chooseState = (next: string) =>
    setAddressDraft((previous) => ({
      ...previous,
      state: next,
      city: next === previous.state ? previous.city : '',
    }));
  const saveAddress = async () => {
    if (!hasAddressChanges || addressSaving) return;
    const input = {
      address: addressDraft.address.trim(),
      state: addressDraft.state,
      city: addressDraft.city,
      pincode: addressDraft.pincode.trim(),
    };
    if (
      !input.address ||
      !input.state ||
      !input.city ||
      !PINCODE.test(input.pincode)
    ) {
      setAddressError(t.incomplete);
      return;
    }
    setAddressSaving(true);
    setAddressError('');
    try {
      await saveMyAddress(token, input);
      setAddressDraft(input);
      setOriginalAddress(input);
      showSnackbar(t.saved, { variant: 'success' });
    } catch (err) {
      setAddressError(
        err instanceof ApiRequestError ? err.message : t.saveFailed,
      );
    } finally {
      setAddressSaving(false);
    }
  };
  return loading ? (
    <p className="loading-state" role="status">
      {s.loading}
    </p>
  ) : (
    <>
      <FormPanel
        id="contact-details-title"
        heading={c.heading}
        intro={c.intro}
        footerLead={
          error && (
            <p className="form-field__error body-medium" role="alert">
              {error}
            </p>
          )
        }
        actions={
          <FilledButton
            disabled={!hasChanges || saving}
            onClick={requestProfileUpdate}
          >
            {saving ? c.saving : c.save}
          </FilledButton>
        }
      >
        <FormPanelSection>
          <div className="form-grid">
            <FormField>
              {renderTextField({
                label: c.name,
                value: name,
                required: true,
                onInput: setName,
              })}
            </FormField>
            <FormField>
              {renderTextField({
                label: c.email,
                type: 'email',
                value: email,
                onInput: setEmail,
              })}
            </FormField>
            <FormField>
              {renderTextField({
                label: c.phone,
                type: 'tel',
                value: phone,
                readOnly: true,
                onInput: setPhone,
              })}
            </FormField>
          </div>
        </FormPanelSection>
      </FormPanel>
      <Dialog ref={dialogRef}>
        <div slot="headline">{c.confirmHeading}</div>
        <div slot="content">{c.confirmText}</div>
        <div slot="actions">
          <TextButton
            disabled={saving}
            onClick={() => dialogRef.current?.close()}
          >
            {c.cancel}
          </TextButton>
          <TextButton
            disabled={saving}
            onClick={() => {
              void confirmProfileUpdate();
            }}
          >
            {saving ? c.saving : c.confirm}
          </TextButton>
        </div>
      </Dialog>
      <FormPanel
        id="delivery-address-title"
        heading={t.heading}
        intro={t.hint}
        footerLead={
          addressError && (
            <p className="form-field__error body-medium" role="alert">
              {addressError}
            </p>
          )
        }
        actions={createElement(
          'md-filled-button',
          {
            ...(!hasAddressChanges || addressSaving ? { disabled: true } : {}),
            onClick: () => void saveAddress(),
          },
          addressSaving ? t.saving : t.save,
        )}
      >
        <FormPanelSection>
          <div className="form-grid">
            <FormField wide>
              {renderTextField({
                label: fields.address,
                value: addressDraft.address,
                required: true,
                onInput: setAddress('address'),
              })}
            </FormField>
            <FormField>
              {renderSelect({
                label: fields.state,
                value: addressDraft.state,
                required: true,
                placeholder: fields.selectState,
                options: asOptions(STATES),
                onChange: chooseState,
              })}
            </FormField>
            <FormField>
              {renderSelect({
                selectKey: addressDraft.state,
                label: fields.city,
                value: addressDraft.city,
                required: true,
                disabled: !addressDraft.state,
                placeholder: addressDraft.state
                  ? fields.selectCity
                  : fields.selectStateFirst,
                options: asOptions(citiesForState(addressDraft.state)),
                onChange: setAddress('city'),
              })}
            </FormField>
            <FormField>
              {renderTextField({
                label: fields.pincode,
                value: addressDraft.pincode,
                required: true,
                maxLength: 6,
                inputMode: 'numeric',
                onInput: setAddress('pincode'),
              })}
            </FormField>
          </div>
        </FormPanelSection>
      </FormPanel>
    </>
  );
}
export default ProfileForm;
