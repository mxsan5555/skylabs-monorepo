
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCustomerDashboardSummary, type CustomerDashboardSummary } from '../../../api/customer-dashboard';
import { listMyOrders, type Order } from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import { SectionHead } from '../../components/section-head/section-head';
import { StatTile } from '../../components/stat-tile/stat-tile';
import { CardGrid } from '../../components/card-grid/card-grid';
import { CustomerOrderCard } from '../orders/customer-order-card';
import { Seo } from '../../seo/seo';
import content from '../../../content.json';

const t = content.customerDashboard;
const RECENT_ORDERS = 3;
const RECENT_ID = 'dashboard-recent-orders';

/**
 * `/my-dashboard`: the customer's counts (booked deals, purchased products, cart, wishlist) as
 * dashboard stat tiles that open each list, then the latest orders as receipt panels. The sidebar
 * already holds profile and sign-out, so the page does not repeat them.
 */
export function CustomerDashboard() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<CustomerDashboardSummary | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    getCustomerDashboardSummary(token)
      .then(({ data }) => live && setSummary(data))
      .catch((err) => live && setError(err instanceof ApiRequestError ? err.message : t.loadError));
    listMyOrders(token, { page: 1, pageSize: RECENT_ORDERS })
      .then(({ data }) => live && setOrders(data.filter((order) => order.status !== 'PENDING_PAYMENT')))
      .catch(() => live && setOrders([]));
    return () => {
      live = false;
    };
  }, [token]);

  const count = (value: number | undefined) => (summary ? String(value ?? 0) : '–');
  const stats = [
    { key: 'deals', icon: 'spa', value: count(summary?.totalDealCount), label: t.stats.deals, to: '/orders' },
    { key: 'products', icon: 'inventory_2', value: count(summary?.totalProductBoughtCount), label: t.stats.products, to: '/orders' },
    { key: 'cart', icon: 'shopping_cart', value: count(summary?.cartItemCount), label: t.stats.cart, to: '/my-account/cart' },
    { key: 'wishlist', icon: 'favorite', value: count(summary?.wishlistItemCount), label: t.stats.wishlist, to: '/my-account/wishlist' },
  ];

  return (
    <>
      <Seo title={t.metaTitle} description={t.metaDescription} path={t.path} noindex />
      <SectionHead as="h1" id="dashboard-heading" titleClassName="headline-medium" heading={t.title} subheading={t.subtitle} />
      {error && (
        <p className="error-state" role="alert">
          {error}
        </p>
      )}
      <ul className="dashboard-stats" aria-label={t.statsLabel}>
        {stats.map(({ key, ...stat }) => (
          <li key={key}>
            <StatTile {...stat} />
          </li>
        ))}
      </ul>
      <section aria-labelledby={RECENT_ID}>
        <SectionHead id={RECENT_ID} heading={t.recentHeading} titleClassName="title-large" seeAll={t.seeAll} seeAllTo="/orders" />
        <CardGrid
          layout="list"
          fallback={
            orders === null ? (
              <p className="loading-state" role="status">
                {content.orders.loading}
              </p>
            ) : orders.length === 0 ? (
              <p className="text-muted body-large">{t.noOrders}</p>
            ) : undefined
          }
        >
          {(orders ?? []).map((order) => (
            <CustomerOrderCard key={order.id} order={order} headingLevel="h3" onViewDetails={(selected) => navigate(`/orders/${selected.id}`)} />
          ))}
        </CardGrid>
      </section>
    </>
  );
}

export default CustomerDashboard;
