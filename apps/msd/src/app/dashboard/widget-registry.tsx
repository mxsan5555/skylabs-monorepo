import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardStats } from '../../api/rbac/dashboard';
import { formatINR } from '../../utils/format';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
interface WidgetProps {
  title: string;
  /** Marketplace-wide counts from `GET /dashboard/stats`, fetched once by the Dashboard page
   *  and handed down to every widget — `undefined` while the very first fetch hasn't resolved,
   *  `null` if it failed (see `statsError`). Widgets that don't need it (e.g.
   *  `VendorProfileWidget`) simply ignore these props — kept optional so the registry's
   *  `ComponentType<WidgetProps>` typing stays a single shape for every entry. */
  stats?: DashboardStats | null;
  statsLoading?: boolean;
  statsError?: string;
}

/**
 * Local app registry mapping a `WidgetConfig.key` (as assigned to a role by
 * `PUT /rbac/roles/:id/widgets`) to the component that renders it. Keys are
 * data, not code — new widgets get added here as the catalog grows; unknown
 * keys are skipped by the dashboard page rather than crashing.
 */

/** Shared stat-card body: loading/error/empty states, reusing the same classes every other
 *  data-fetching page in this app uses — no bespoke card style for widgets. */
function StatCardBody({ loading, error, value }: { loading?: boolean; error?: string; value: string | undefined }) {
  if (loading) return <p className="loading-state">Loading…</p>;
  if (error) return <p className="error-state" role="alert">{error}</p>;
  if (value === undefined) return <p className="empty-state">No data yet.</p>;
  return <p className="stat-card__value">{value}</p>;
}

type CountKey = Exclude<keyof DashboardStats, 'revenue'>;

/** Factory for the plain "one number" widgets — every stat except revenue renders identically,
 *  just reading a different `DashboardStats` field, so there's no value in hand-writing eight
 *  near-identical components. */
function makeCountWidget(key: CountKey, displayName: string, icon: string): ComponentType<WidgetProps> {
  function CountWidget({ title, stats, statsLoading, statsError }: WidgetProps) {
    const value = stats ? stats[key].toLocaleString('en-IN') : undefined;
    return (
      <article className="stat-card">
        <div className="stat-card__icon">
          <Icon aria-hidden="true">{icon}</Icon>
        </div>
        <h2 className="stat-card__title">{title}</h2>
        <StatCardBody loading={statsLoading} error={statsError} value={value} />
      </article>
    );
  }
  CountWidget.displayName = displayName;
  return CountWidget;
}

const CustomersCountWidget = makeCountWidget('customers', 'CustomersCountWidget', 'group');
const VendorsCountWidget = makeCountWidget('vendors', 'VendorsCountWidget', 'storefront');
const BranchesCountWidget = makeCountWidget('branches', 'BranchesCountWidget', 'location_on');
const CategoriesCountWidget = makeCountWidget('categories', 'CategoriesCountWidget', 'category');
const SubCategoriesCountWidget = makeCountWidget('subCategories', 'SubCategoriesCountWidget', 'subdirectory_arrow_right');
const ProductsCountWidget = makeCountWidget('products', 'ProductsCountWidget', 'inventory_2');
const DealsCountWidget = makeCountWidget('deals', 'DealsCountWidget', 'local_offer');
const OrdersCountWidget = makeCountWidget('orders', 'OrdersCountWidget', 'shopping_bag');

function RevenueSummaryWidget({ title, stats, statsLoading, statsError }: WidgetProps) {
  const value = stats ? formatINR(Number(stats.revenue)) : undefined;
  return (
    <article className="stat-card">
      <h2 className="stat-card__title">{title}</h2>
      <StatCardBody loading={statsLoading} error={statsError} value={value} />
    </article>
  );
}

/** The vendor role's entry point to `/account/vendors` — that sidebar item itself is
 *  admin-only (gated on `vendors:view`), so this widget is how a vendor user reaches
 *  their own business profile/branches/deals instead. */
function VendorProfileWidget({ title }: WidgetProps) {
  return (
    <article className="stat-card">
      <h2 className="stat-card__title">{title}</h2>
      <p>Manage your business profile, branches, and deals.</p>
      <Link to="/account/vendors">Go to My Business →</Link>
    </article>
  );
}

export const WIDGET_REGISTRY: Record<string, ComponentType<WidgetProps>> = {
  'customers-count': CustomersCountWidget,
  'orders-recent': OrdersCountWidget,
  'revenue-summary': RevenueSummaryWidget,
  'vendor-profile': VendorProfileWidget,
  'vendors-count': VendorsCountWidget,
  'branches-count': BranchesCountWidget,
  'categories-count': CategoriesCountWidget,
  'subcategories-count': SubCategoriesCountWidget,
  'products-count': ProductsCountWidget,
  'deals-count': DealsCountWidget,
};
