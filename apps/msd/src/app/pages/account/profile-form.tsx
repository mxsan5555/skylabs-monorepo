import { useEffect, useRef, useState, type ComponentRef } from 'react';

import {
  Dialog,
  Icon,
  OutlinedButton,
  OutlinedTextField,
  TextButton,
} from '@skylabs-monorepo/shared-ui/react';
import type { SkySnackbar } from '@skylabs-monorepo/shared-ui';
import { useAccount } from '../../../account/account-context';
import type { Address } from '../../../types';
import { validateEmail } from '../../../utils/validation';
import content from '../../../content.json';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  getMyProfile,
  updateMyProfile,
} from '../../../api/rbac/me';
import { ApiRequestError } from '../../../api/rbac/client';

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
    {
      key: 'label',
      label: 'Label (e.g. Home, Work)',
      span2: true,
    },
    {
      key: 'line1',
      label: 'Address line 1',
      span2: true,
    },
    {
      key: 'line2',
      label: 'Address line 2',
      span2: true,
    },
    {
      key: 'city',
      label: 'City',
    },
    {
      key: 'state',
      label: 'State',
    },
    {
      key: 'postalCode',
      label: 'Postal code',
    },
    {
      key: 'country',
      label: 'Country',
    },
  ];

const value = (e: Event) =>
  (e.target as HTMLInputElement).value;

export function ProfileForm() {
  const {
    addresses,
    addAddress,
    updateAddress,
    removeAddress,
  } = useAccount();

  const { token } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  /*
   * Original values are kept so we can determine
   * whether the user has actually changed anything.
   */
  const [originalName, setOriginalName] = useState('');
  const [originalEmail, setOriginalEmail] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [editingId, setEditingId] = useState<
    string | 'new' | null
  >(null);

  const [draft, setDraft] = useState<Draft>(EMPTY);

  /*
   * Confirmation dialog.
   */
  const dialogRef = useRef<
    HTMLElement & {
      show: () => void;
      close: () => void;
    }
  >(null);

  /*
   * Snackbar.
   */
  const snackbarRef = useRef<
    HTMLElement & {
      show: (message: string) => void;
    }
  >(null);

  /*
   * Load profile.
   */
  useEffect(() => {
    setLoading(true);
    setError('');

    getMyProfile(token)
      .then(({ data }) => {
        const profileName = data.name ?? '';
        const profileEmail = data.email ?? '';
        const profilePhone = data.phone ?? '';

        setName(profileName);
        setEmail(profileEmail);
        setPhone(profilePhone);

        setOriginalName(profileName);
        setOriginalEmail(profileEmail);
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
   * Check whether the user changed any editable field.
   */
  const hasChanges =
    name.trim() !== originalName.trim() ||
    email.trim() !== originalEmail.trim();

  /*
   * Open confirmation dialog.
   */
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

    dialogRef.current?.show();
  };

  /*
   * Confirm and update profile.
   */
  const confirmProfileUpdate = async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      const { data } = await updateMyProfile(
        token,
        {
          name: name.trim(),
          email: email.trim() || undefined,
        },
      );

      const updatedName = data.name ?? '';
      const updatedEmail = data.email ?? '';
      const updatedPhone = data.phone ?? '';

      setName(updatedName);
      setEmail(updatedEmail);
      setPhone(updatedPhone);

      setOriginalName(updatedName);
      setOriginalEmail(updatedEmail);

      dialogRef.current?.close();

      snackbarRef.current?.show(
        'Your profile was updated successfully.',
      );
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'Could not save your profile.',
      );
    } finally {
      setSaving(false);
    }
  };

  const startAdd = () => {
    setDraft(EMPTY);
    setEditingId('new');
  };

  const startEdit = (a: Address) => {
    const { id, ...rest } = a;

    void id;

    setDraft({
      line2: '',
      ...rest,
    });

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

  const patch =
    (key: keyof Draft) =>
      (e: Event) =>
        setDraft((d) => ({
          ...d,
          [key]: value(e),
        }));

  return (
    <>
      {loading ? (
        <p className="loading-state">
          Loading your profile…
        </p>
      ) : (
        <>
          {error && (
            <p
              className="error-state"
              role="alert"
            >
              {error}
            </p>
          )}

          <section className="account-card">
            <div className="account-fields">
              <OutlinedTextField
                label="Name"
                value={name}
                onInput={(e: Event) =>
                  setName(value(e))
                }
              />

              <OutlinedTextField
                label="Email"
                type="email"
                autocomplete="email"
                value={email}
                onInput={(e: Event) =>
                  setEmail(value(e))
                }
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
              >
                Update
              </OutlinedButton>
            </div>
          </section>

          {/* Confirmation dialog */}

          <Dialog ref={dialogRef}>
            <div slot="headline">
              Update profile?
            </div>

            <div slot="content">
              Are you sure you want to update
              your records?
            </div>

            <div slot="actions">
              <TextButton
                disabled={saving}
                onClick={() =>
                  dialogRef.current?.close()
                }
              >
                Cancel
              </TextButton>

              <TextButton
                disabled={saving}
                onClick={() => {
                  void confirmProfileUpdate();
                }}
              >
                {saving
                  ? 'Updating…'
                  : 'Okay'}
              </TextButton>
            </div>
          </Dialog>


          <sky-snackbar
            ref={
              snackbarRef as React.RefObject<HTMLElement>
            }
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