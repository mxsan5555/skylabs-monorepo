import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listAllDeals, type Deal } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

const DEAL_COLUMNS = JSON.stringify([
  { key: 'Deal Name', label: 'Deal Name' },
  { key: 'Service', label: 'Service/Product' },
  { key: 'Vendor', label: 'Vendor' },
  { key: 'Branch', label: 'Branch' },
  { key: 'Category', label: 'Category' },
  { key: 'Packages', label: 'Packages' },
  { key: 'Starting Price', label: 'Starting Price' },
  {
    key: 'Status',
    label: 'Status',
    type: 'status',
    statusMap: { ACTIVE: 'success', DRAFT: 'warning', INACTIVE: 'error', EXPIRED: 'error' },
  },
  {
    key: 'Approval Status',
    label: 'Approval Status',
    type: 'status',
    statusMap: { APPROVED: 'success', PENDING: 'warning', REJECTED: 'error' },
  },
  { key: 'Created', label: 'Created', type: 'date' },
]);

/** Not '__view_detail__' — editing a deal happens on its vendor's own page (VendorBranches,
 *  reused there), so the row action here just deep-links to that vendor. */
const DEAL_ACTIONS = JSON.stringify([{ icon: 'open_in_new', label: 'View vendor', event: 'view-vendor' }]);

/** "From ₹X" for a service deal with 2+ active packages, the single package's price for exactly
 *  one, or a plain dash for a product deal (packages are service-only — see DealPackage's schema
 *  doc comment in msd-api) or a service deal with none yet. Mirrors what the customer-facing
 *  storefront already shows for a multi-package deal — never a separate row per package, since
 *  packages are children of one logical Deal, not separate deals (per this request's own "do not
 *  create multiple confusing cards for the same logical Deal" instruction). */
function packagesSummary(deal: Deal): string {
  const active = (deal.packages ?? []).filter((p) => p.isActive);
  if (active.length === 0) return deal.product ? 'N/A' : '—';
  const cheapest = active.reduce((min, p) => (Number(p.sellingPrice) < Number(min.sellingPrice) ? p : min), active[0]);
  const label = active.length > 1 ? `${active.length} packages` : `${cheapest.durationMinutes} min`;
  return `${label} · From ₹${cheapest.sellingPrice}`;
}

function startingPrice(deal: Deal): string {
  const active = (deal.packages ?? []).filter((p) => p.isActive);
  if (active.length > 0) {
    const cheapest = active.reduce((min, p) => (Number(p.sellingPrice) < Number(min.sellingPrice) ? p : min), active[0]);
    return `₹${cheapest.sellingPrice}`;
  }
  return `₹${deal.salePrice}`;
}

/** Flat row for <sky-data-table> — 'Vendor ID' is an extra (non-column) key used only to drive
 *  the 'view-vendor' row action; it is not one of the visible columns. */
function toDealRow(deal: Deal): Record<string, string | number> {
  return {
    'Deal Name': deal.title,
    Service: deal.product?.name ?? 'Service',
    Vendor: deal.vendor?.businessName ?? '—',
    Branch: deal.branch?.name ?? '—',
    Category: deal.category?.name ?? '—',
    Packages: packagesSummary(deal),
    'Starting Price': startingPrice(deal),
    Status: deal.status,
    'Approval Status': deal.approvalStatus,
    Created: deal.createdAt,
    'Vendor ID': deal.vendor?.id ?? '',
  };
}

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

/** Cross-vendor Deals sidebar page — read list only; editing a deal happens on its vendor's
 *  own page (`VendorBranches`, reused there), reached via the "View vendor" action. Mirrors
 *  orders.tsx's <sky-data-table> pattern exactly. */
export function DealList() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listAllDeals(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      });
      setDeals(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load deals.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => JSON.stringify(deals.map(toDealRow)), [deals]);

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
      <title>Deals · MSD</title>
      <header className="page-head">
        <div>
          <h1>Deals</h1>
          <p>Every deal across every vendor and branch.</p>
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Deals"
        columns={DEAL_COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        searchable
        search-placeholder="Search by deal, vendor, or branch name…"
        actions={DEAL_ACTIONS}
      />
    </div>
  );
}

export default DealList;
