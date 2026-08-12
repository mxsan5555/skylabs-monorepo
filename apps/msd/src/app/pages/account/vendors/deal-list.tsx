import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listAllDeals, type Deal } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

/** Cross-vendor Deals sidebar page — read list only; editing a deal happens on its vendor's
 *  own page (`VendorBranches`, reused there), reached via the "View vendor" link. */
export function DealList() {
  const { token } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listAllDeals(token, { search: search || undefined, pageSize: 50 });
      setDeals(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load deals.');
    } finally {
      setLoading(false);
    }
  }, [token, search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Deals · MSD</title>
      <header className="page-head">
        <div>
          <h1>Deals</h1>
          <p>Every deal across every vendor and branch.</p>
        </div>
      </header>

      <OutlinedTextField
        label="Search by deal, vendor, or branch name"
        value={search}
        onInput={(e: Event) => setSearch((e.target as HTMLInputElement).value)}
      />

      {loading ? (
        <p className="loading-state">Loading deals…</p>
      ) : error ? (
        <p className="error-state">{error}</p>
      ) : deals.length === 0 ? (
        <p className="empty-state">No deals yet.</p>
      ) : (
        <>
          <p className="field-hint">{total} deal{total === 1 ? '' : 's'}</p>
          <ul className="entity-list">
            {deals.map((deal) => (
              <li key={deal.id}>
                <div className="entity-list__item">
                  <span className="role-list__name">
                    {deal.title}
                    <span className="field-hint">
                      {' '}
                      · {deal.service ? `Service: ${deal.service.name}` : deal.product ? `Product: ${deal.product.name}` : 'Unlinked'}
                      {' '}
                      · {deal.vendor?.businessName ?? 'Unlinked vendor'} · {deal.branch?.name ?? '—'} · {deal.category?.name ?? '—'} · ₹{deal.salePrice}
                      {deal.durationMinutes && ` · ${deal.durationMinutes} min`}
                    </span>
                  </span>
                  <span className={`status-pill ${deal.status === 'ACTIVE' ? 'status-pill--active' : 'status-pill--inactive'}`}>
                    {deal.status} / {deal.approvalStatus}
                  </span>
                </div>
                {deal.vendor && (
                  <Link to={`/account/vendors?vendorId=${deal.vendor.id}`} className="field-hint">
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

export default DealList;
