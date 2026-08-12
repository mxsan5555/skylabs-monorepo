import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listAllBranches, type Branch } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

/** Cross-vendor Branches sidebar page — read list only; editing a branch happens on its
 *  vendor's own page (`VendorBranches`, reused there), reached via the "View vendor" link. */
export function BranchList() {
  const { token } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listAllBranches(token, { search: search || undefined, pageSize: 50 });
      setBranches(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load branches.');
    } finally {
      setLoading(false);
    }
  }, [token, search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Branches · MSD</title>
      <header className="page-head">
        <div>
          <h1>Branches</h1>
          <p>Every branch across every vendor.</p>
        </div>
      </header>

      <OutlinedTextField
        label="Search by branch or vendor name"
        value={search}
        onInput={(e: Event) => setSearch((e.target as HTMLInputElement).value)}
      />

      {loading ? (
        <p className="loading-state">Loading branches…</p>
      ) : error ? (
        <p className="error-state">{error}</p>
      ) : branches.length === 0 ? (
        <p className="empty-state">No branches yet.</p>
      ) : (
        <>
          <p className="field-hint">{total} branch{total === 1 ? '' : 'es'}</p>
          <ul className="entity-list">
            {branches.map((branch) => (
              <li key={branch.id}>
                <div className="entity-list__item">
                  <span className="role-list__name">
                    {branch.name}
                    <span className="field-hint">
                      {' '}
                      · {branch.vendor?.businessName ?? 'Unlinked vendor'} · {branch.city ?? '—'}, {branch.state ?? '—'}
                    </span>
                  </span>
                  <span className={`status-pill ${branch.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
                    {branch.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {branch.vendor && (
                  <Link to={`/account/vendors?vendorId=${branch.vendor.id}`} className="field-hint">
                    View vendor →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default BranchList;
