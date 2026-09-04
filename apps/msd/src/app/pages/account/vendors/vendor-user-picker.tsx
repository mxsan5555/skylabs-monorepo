import { useEffect, useState } from 'react';
import { OutlinedTextField, OutlinedButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { searchUsersForVendor, type UserSummary } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

interface VendorUserPickerProps {
  selectedUser: UserSummary | null;
  onSelect: (user: UserSummary | null) => void;
  disabled?: boolean;
}

/**
 * "Add Vendor → Select Existing User" — search-and-pick UI so it's unambiguous which
 * existing login a new vendor profile is linked to. Vendor.ownerUserId is set from the
 * selected user's id; no new user/auth record is ever created here.
 */
export function VendorUserPicker({ selectedUser, onSelect, disabled }: VendorUserPickerProps) {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (selectedUser || !query.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      setLoading(true);
      setError('');
      searchUsersForVendor(token, query.trim())
        .then(({ data }) => setResults(data))
        .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not search users.'))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [token, query, selectedUser]);

  if (selectedUser) {
    return (
      <fieldset>
        <legend>Vendor Account</legend>
        <dl className="form-grid">
          <div>
            <dt className="field-hint">User</dt>
            <dd>{selectedUser.name}</dd>
          </div>
          <div>
            <dt className="field-hint">Email</dt>
            <dd>{selectedUser.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="field-hint">Mobile</dt>
            <dd>{selectedUser.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="field-hint">Status</dt>
            <dd className={`status-pill ${selectedUser.status === 'active' ? 'status-pill--active' : 'status-pill--inactive'}`}>
              {selectedUser.status}
            </dd>
          </div>
          <div>
            <dt className="field-hint">Role</dt>
            <dd>{selectedUser.roles.map((r) => r.name).join(', ') || '—'}</dd>
          </div>
          <div>
            <dt className="field-hint">User ID</dt>
            <dd>{selectedUser.id}</dd>
          </div>
        </dl>
        {!disabled && (
          <OutlinedButton onClick={() => onSelect(null)}>
            <Icon slot="icon" aria-hidden="true">close</Icon>
            Change user
          </OutlinedButton>
        )}
      </fieldset>
    );
  }

  return (
    <fieldset>
      <legend>Vendor User</legend>
      <OutlinedTextField
        label="Search existing user by name / email / mobile"
        value={query}
        // disabled={disabled}
        onInput={(e: Event) => setQuery((e.target as HTMLInputElement).value)}
      />
      {loading && <p className="loading-state">Searching…</p>}
      {error && <p className="error-state" role="alert">{error}</p>}
      {results.length > 0 && (
        <ul className="entity-list">
          {results.map((user) => (
            <li key={user.id}>
              <button type="button" className="entity-list__item" onClick={() => onSelect(user)}>
                <span className="role-list__name">
                  {user.name}
                  <span className="field-hint">
                    {' '}
                    · {user.email ?? user.phone ?? user.id} · {user.roles.map((r) => r.name).join(', ') || 'no roles'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && query.trim() && results.length === 0 && !error && (
        <p className="empty-state">No matching users found.</p>
      )}
    </fieldset>
  );
}
