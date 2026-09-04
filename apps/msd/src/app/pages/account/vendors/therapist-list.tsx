import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listAllTherapists, type CrossVendorTherapist } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

const THERAPIST_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Vendor', label: 'Vendor' },
  { key: 'Branch', label: 'Branch' },
  { key: 'Type', label: 'Type' },
  { key: 'Specialization', label: 'Specialization' },
  { key: 'Packages', label: 'Packages' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);

/** Not '__view_detail__' — editing a therapist happens on its vendor's own page (the Vendor
 *  Detail view's "Therapists" tab, reused there), so the row action here just deep-links to
 *  that vendor. Mirrors `branch-list.tsx`'s "View vendor" action exactly. */
const THERAPIST_ACTIONS = JSON.stringify([{ icon: 'open_in_new', label: 'View vendor', event: 'view-vendor' }]);

/** Flat row for <sky-data-table> — 'Vendor ID' is an extra (non-column) key used only to drive
 *  the 'view-vendor' row action; it is not one of the visible columns. */
function toTherapistRow(therapist: CrossVendorTherapist): Record<string, string | number> {
  return {
    Name: therapist.personName,
    Vendor: therapist.vendor?.businessName ?? '—',
    Branch: therapist.branch?.name ?? '—',
    Type: therapist.therapistType,
    Specialization: therapist.specialization ?? '—',
    Packages: therapist._count?.packages ?? 0,
    Status: therapist.isActive ? 'Active' : 'Inactive',
    'Vendor ID': therapist.vendor?.id ?? '',
  };
}

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

/** Cross-vendor Therapists sidebar page — read list only; editing a therapist happens on its
 *  vendor's own page (the Vendor Detail view's "Therapists" tab, reused there), reached via the
 *  "View vendor" action. Mirrors `branch-list.tsx`/`deal-list.tsx`'s <sky-data-table> pattern
 *  exactly, following the same Product/Deal sidebar navigation convention. */
export function TherapistList() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [therapists, setTherapists] = useState<CrossVendorTherapist[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listAllTherapists(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      });
      setTherapists(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load therapists.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => JSON.stringify(therapists.map(toTherapistRow)), [therapists]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize, search: detail.search });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown> }>).detail;
      if (detail.action !== 'view-vendor') return;
      const vendorId = detail.row['Vendor ID'];
      if (typeof vendorId === 'string' && vendorId) navigate(`/account/vendors?vendorId=${vendorId}`);
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
  }, [navigate]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Therapists · MSD</title>
      <header className="page-head">
        <div>
          <h1>Therapists</h1>
          <p>Every therapist across every vendor.</p>
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Therapists"
        columns={THERAPIST_COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        searchable
        search-placeholder="Search by therapist, type, or vendor name…"
        actions={THERAPIST_ACTIONS}
      />
    </div>
  );
}

export default TherapistList;
