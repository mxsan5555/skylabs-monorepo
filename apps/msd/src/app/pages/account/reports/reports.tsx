import { useCallback, useEffect, useState } from 'react';
import { Tabs, PrimaryTab, OutlinedSelect, SelectOption, FilledButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  getOverallSummary,
  getVendorWiseReport,
  getBranchWiseReport,
  getMonthWiseReport,
  getServiceVsProductReport,
  getTopVendors,
  getTopProducts,
  getTopServices,
  getPaymentMethodReport,
  type ReportFilters,
  type OverallSummary,
  type VendorReportRow,
  type BranchReportRow,
  type MonthReportRow,
  type ServiceVsProductReport,
  type TopItemRow,
  type PaymentMethodRow,
} from '../../../../api/rbac/reports';
import { listVendors, listAllBranches, type Vendor, type Branch } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { formatINR } from '../../../../utils/format';

type ReportTab = 'overview' | 'vendors' | 'branches' | 'monthly' | 'top-items';

const TAB_DEFS: { key: ReportTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'vendors', label: 'Vendors' },
  { key: 'branches', label: 'Branches' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'top-items', label: 'Top Items' },
];

const ORDER_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const;
const PAYMENT_STATUSES = ['CREATED', 'PAID', 'FAILED', 'CANCELLED'] as const;

interface AllReportData {
  summary: OverallSummary;
  vendorWise: VendorReportRow[];
  branchWise: BranchReportRow[];
  monthWise: MonthReportRow[];
  serviceVsProduct: ServiceVsProductReport;
  topVendors: VendorReportRow[];
  topProducts: TopItemRow[];
  topServices: TopItemRow[];
  paymentMethods: PaymentMethodRow[];
}

/** Simple CSS-width bar next to a revenue figure — no chart library installed for this (see the
 *  request's own "do not install a new chart library unnecessarily"), just a styled div sized by
 *  percentage of the max value in its own list. */
function BarViz({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="bar-viz">
      <div className="bar-viz__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Superadmin Reports dashboard — replaces the old `AdminPage title="Reports" subtitle="Module
 * coming soon."` stub. Every figure comes from `apps/msd-api`'s new `reports.routes.ts` (real
 * DB aggregation, see that file's own doc comment) — nothing is computed client-side from a full
 * order list. Filters (date range, vendor, branch, order/payment status) apply to every report
 * section at once; reuses the same `Tabs`/`PrimaryTab` pattern already established for
 * `vendor-profile-tabs.tsx` and the Vendor detail page, and the same `.stat-card`/`.widget-grid`
 * CSS the admin Dashboard already uses — no new design system.
 */
export function Reports() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>({});

  const [data, setData] = useState<AllReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listVendors(token, { pageSize: 100 }).then(({ data }) => setVendors(data)).catch(() => {});
    listAllBranches(token, { pageSize: 100 }).then(({ data }) => setBranches(data)).catch(() => {});
  }, [token]);

  const load = useCallback((filters: ReportFilters) => {
    setLoading(true);
    setError('');
    Promise.all([
      getOverallSummary(token, filters),
      getVendorWiseReport(token, filters),
      getBranchWiseReport(token, filters),
      getMonthWiseReport(token, filters),
      getServiceVsProductReport(token, filters),
      getTopVendors(token, { ...filters, limit: 10 }),
      getTopProducts(token, { ...filters, limit: 10 }),
      getTopServices(token, { ...filters, limit: 10 }),
      getPaymentMethodReport(token, filters),
    ])
      .then(([summary, vendorWise, branchWise, monthWise, serviceVsProduct, topVendors, topProducts, topServices, paymentMethods]) => {
        setData({
          summary: summary.data,
          vendorWise: vendorWise.data,
          branchWise: branchWise.data,
          monthWise: monthWise.data,
          serviceVsProduct: serviceVsProduct.data,
          topVendors: topVendors.data,
          topProducts: topProducts.data,
          topServices: topServices.data,
          paymentMethods: paymentMethods.data,
        });
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load reports.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load(appliedFilters);
  }, [load, appliedFilters]);

  const applyFilters = () => {
    setAppliedFilters({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      vendorId: vendorId || undefined,
      branchId: branchId || undefined,
      orderStatus: (orderStatus || undefined) as ReportFilters['orderStatus'],
      paymentStatus: (paymentStatus || undefined) as ReportFilters['paymentStatus'],
    });
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setVendorId('');
    setBranchId('');
    setOrderStatus('');
    setPaymentStatus('');
    setAppliedFilters({});
  };

  return (
    <div className="admin-page admin-page--wide">
      <title>Reports · MSD</title>
      <header className="page-head">
        <div>
          <h1>Reports</h1>
          <p>Real-time revenue, orders, and performance across the marketplace.</p>
        </div>
      </header>

      <div className="panel" style={{ marginBottom: 20 }}>
        <h2>Filters</h2>
        <div className="form-grid">
          <div>
            <label className="field-hint" htmlFor="reports-date-from">From</label>
            <input id="reports-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="field-hint" htmlFor="reports-date-to">To</label>
            <input id="reports-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <OutlinedSelect label="Vendor" value={vendorId} onChange={(e: Event) => setVendorId((e.target as HTMLSelectElement).value)}>
            <SelectOption value=""><div slot="headline">All vendors</div></SelectOption>
            {vendors.map((v) => (
              <SelectOption key={v.id} value={v.id}><div slot="headline">{v.businessName ?? v.id}</div></SelectOption>
            ))}
          </OutlinedSelect>
          <OutlinedSelect label="Branch" value={branchId} onChange={(e: Event) => setBranchId((e.target as HTMLSelectElement).value)}>
            <SelectOption value=""><div slot="headline">All branches</div></SelectOption>
            {branches.map((b) => (
              <SelectOption key={b.id} value={b.id}><div slot="headline">{b.name}</div></SelectOption>
            ))}
          </OutlinedSelect>
          <OutlinedSelect label="Order Status" value={orderStatus} onChange={(e: Event) => setOrderStatus((e.target as HTMLSelectElement).value)}>
            <SelectOption value=""><div slot="headline">All statuses</div></SelectOption>
            {ORDER_STATUSES.map((s) => (
              <SelectOption key={s} value={s}><div slot="headline">{s}</div></SelectOption>
            ))}
          </OutlinedSelect>
          <OutlinedSelect label="Payment Status" value={paymentStatus} onChange={(e: Event) => setPaymentStatus((e.target as HTMLSelectElement).value)}>
            <SelectOption value=""><div slot="headline">All statuses</div></SelectOption>
            {PAYMENT_STATUSES.map((s) => (
              <SelectOption key={s} value={s}><div slot="headline">{s}</div></SelectOption>
            ))}
          </OutlinedSelect>
          <div className="form-actions">
            <FilledButton onClick={applyFilters}>Apply Filters</FilledButton>
            <FilledButton onClick={clearFilters}>Clear</FilledButton>
          </div>
        </div>
      </div>

      {error && <p className="error-state" role="alert">{error}</p>}

      <div className="admin-tabs-wrap">
        <Tabs
          className="admin-tabs"
          onChange={(e) => setActiveTab(TAB_DEFS[(e.target as unknown as { activeTabIndex: number }).activeTabIndex].key)}
        >
          {TAB_DEFS.map((tab) => (
            <PrimaryTab key={tab.key} active={activeTab === tab.key}>{tab.label}</PrimaryTab>
          ))}
        </Tabs>
      </div>

      {loading ? (
        <p className="loading-state">Loading reports…</p>
      ) : !data ? (
        <p className="empty-state">No data yet.</p>
      ) : (
        <div className="admin-tab-panel">
          {activeTab === 'overview' && <OverviewSection data={data} />}
          {activeTab === 'vendors' && <VendorsSection data={data} />}
          {activeTab === 'branches' && <BranchesSection data={data} />}
          {activeTab === 'monthly' && <MonthlySection data={data} />}
          {activeTab === 'top-items' && <TopItemsSection data={data} />}
        </div>
      )}
    </div>
  );
}

function OverviewSection({ data }: { data: AllReportData }) {
  const { summary, serviceVsProduct, paymentMethods } = data;
  return (
    <>
      <div className="widget-grid">
        <article className="stat-card">
          <h2 className="stat-card__title">Total Orders</h2>
          <p className="stat-card__value">{summary.totalOrders.toLocaleString('en-IN')}</p>
        </article>
        <article className="stat-card">
          <h2 className="stat-card__title">Total Revenue</h2>
          <p className="stat-card__value">{formatINR(Number(summary.totalRevenue))}</p>
        </article>
        <article className="stat-card">
          <h2 className="stat-card__title">Paid Revenue</h2>
          <p className="stat-card__value">{formatINR(Number(summary.paidRevenue))}</p>
        </article>
        <article className="stat-card">
          <h2 className="stat-card__title">Pending Amount</h2>
          <p className="stat-card__value">{formatINR(Number(summary.pendingAmount))}</p>
        </article>
        <article className="stat-card">
          <h2 className="stat-card__title">Completed Orders</h2>
          <p className="stat-card__value">{summary.completedOrders.toLocaleString('en-IN')}</p>
        </article>
        <article className="stat-card">
          <h2 className="stat-card__title">Cancelled Orders</h2>
          <p className="stat-card__value">{summary.cancelledOrders.toLocaleString('en-IN')}</p>
        </article>
        <article className="stat-card">
          <h2 className="stat-card__title">Products Sold</h2>
          <p className="stat-card__value">{summary.totalProductsSold.toLocaleString('en-IN')}</p>
        </article>
        <article className="stat-card">
          <h2 className="stat-card__title">Services Booked</h2>
          <p className="stat-card__value">{summary.totalServicesBooked.toLocaleString('en-IN')}</p>
        </article>
      </div>

      <h3 className="section-title">Service vs Product</h3>
      <div className="widget-grid">
        <article className="stat-card">
          <h2 className="stat-card__title">Services Sold</h2>
          <p className="stat-card__value">{serviceVsProduct.servicesSold.toLocaleString('en-IN')}</p>
        </article>
        <article className="stat-card">
          <h2 className="stat-card__title">Service Revenue</h2>
          <p className="stat-card__value">{formatINR(Number(serviceVsProduct.serviceRevenue))}</p>
        </article>
        <article className="stat-card">
          <h2 className="stat-card__title">Products Sold</h2>
          <p className="stat-card__value">{serviceVsProduct.productsSold.toLocaleString('en-IN')}</p>
        </article>
        <article className="stat-card">
          <h2 className="stat-card__title">Product Revenue</h2>
          <p className="stat-card__value">{formatINR(Number(serviceVsProduct.productRevenue))}</p>
        </article>
      </div>

      <h3 className="section-title">Payment Methods</h3>
      {paymentMethods.length === 0 ? (
        <p className="empty-state">No payments yet.</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col">Orders</th>
                <th scope="col">Revenue</th>
                <th scope="col">Successful</th>
                <th scope="col">Pending</th>
                <th scope="col">Failed</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethods.map((row) => (
                <tr key={row.provider}>
                  <td>{row.provider}</td>
                  <td>{row.orders}</td>
                  <td>{formatINR(Number(row.revenue))}</td>
                  <td>{row.successful}</td>
                  <td>{row.pending}</td>
                  <td>{row.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function VendorsSection({ data }: { data: AllReportData }) {
  return (
    <>
      <h3 className="section-title">Vendor-wise Revenue</h3>
      {data.vendorWise.length === 0 ? (
        <p className="empty-state">No orders match these filters.</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Vendor</th>
                <th scope="col">Orders</th>
                <th scope="col">Revenue</th>
                <th scope="col">Paid</th>
                <th scope="col">Pending</th>
                <th scope="col">Cancelled</th>
              </tr>
            </thead>
            <tbody>
              {data.vendorWise.map((row) => (
                <tr key={row.vendorId}>
                  <td>{row.vendorName}</td>
                  <td>{row.orders}</td>
                  <td>{formatINR(Number(row.revenue))}</td>
                  <td>{formatINR(Number(row.paid))}</td>
                  <td>{formatINR(Number(row.pending))}</td>
                  <td>{row.cancelled}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="section-title">Top Vendors by Revenue</h3>
      {data.topVendors.length === 0 ? (
        <p className="empty-state">No data yet.</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Vendor</th>
                <th scope="col">Orders</th>
                <th scope="col">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.topVendors.map((row) => {
                const max = Math.max(...data.topVendors.map((r) => Number(r.revenue)), 1);
                return (
                  <tr key={row.vendorId}>
                    <td>{row.vendorName}</td>
                    <td>{row.orders}</td>
                    <td>
                      {formatINR(Number(row.revenue))}
                      <BarViz value={Number(row.revenue)} max={max} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function BranchesSection({ data }: { data: AllReportData }) {
  return (
    <>
      <h3 className="section-title">Branch-wise Report</h3>
      {data.branchWise.length === 0 ? (
        <p className="empty-state">No orders match these filters.</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Vendor</th>
                <th scope="col">Branch</th>
                <th scope="col">Orders</th>
                <th scope="col">Revenue</th>
                <th scope="col">Services</th>
                <th scope="col">Products</th>
              </tr>
            </thead>
            <tbody>
              {data.branchWise.map((row) => (
                <tr key={row.branchId}>
                  <td>{row.vendorName}</td>
                  <td>{row.branchName}</td>
                  <td>{row.orders}</td>
                  <td>{formatINR(Number(row.revenue))}</td>
                  <td>{row.services}</td>
                  <td>{row.products}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function MonthlySection({ data }: { data: AllReportData }) {
  const max = Math.max(...data.monthWise.map((r) => Number(r.revenue)), 1);
  return (
    <>
      <h3 className="section-title">Month-wise Report</h3>
      {data.monthWise.length === 0 ? (
        <p className="empty-state">No orders match these filters.</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Orders</th>
                <th scope="col">Revenue</th>
                <th scope="col">Services</th>
                <th scope="col">Products</th>
              </tr>
            </thead>
            <tbody>
              {data.monthWise.map((row) => (
                <tr key={row.month}>
                  <td>{row.month}</td>
                  <td>{row.orders}</td>
                  <td>
                    {formatINR(Number(row.revenue))}
                    <BarViz value={Number(row.revenue)} max={max} />
                  </td>
                  <td>{row.services}</td>
                  <td>{row.products}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function TopItemsSection({ data }: { data: AllReportData }) {
  return (
    <>
      <h3 className="section-title">Top Products</h3>
      {data.topProducts.length === 0 ? (
        <p className="empty-state">No product sales match these filters.</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Vendor</th>
                <th scope="col">Quantity Sold</th>
                <th scope="col">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.topProducts.map((row) => (
                <tr key={row.dealId}>
                  <td>{row.itemName}</td>
                  <td>{row.vendorName}</td>
                  <td>{row.quantitySold}</td>
                  <td>{formatINR(Number(row.revenue))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="section-title">Top Services / Deals</h3>
      {data.topServices.length === 0 ? (
        <p className="empty-state">No service bookings match these filters.</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Deal / Service</th>
                <th scope="col">Vendor</th>
                <th scope="col">Bookings</th>
                <th scope="col">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.topServices.map((row) => (
                <tr key={row.dealId}>
                  <td>{row.itemName}</td>
                  <td>{row.vendorName}</td>
                  <td>{row.quantitySold}</td>
                  <td>{formatINR(Number(row.revenue))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default Reports;
