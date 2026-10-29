import { useCallback, useMemo, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, ChipSet, FilterChip } from '@skylabs-monorepo/shared-ui/react';
import { CustomerOrderCard } from './customer-order-card';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listMyOrders, type Order, type OrderStatus } from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import './orders.css';
import content from '../../../content.json';
import { Seo } from '../../seo/seo';
import { CardGrid } from '../../components/card-grid/card-grid';
import { SectionHead } from '../../components/section-head/section-head';

const t = content.orders;

/** Customer's own orders: the Cart convergence point (every purchase kind, Deal/Product/
 *  Therapist alike, becomes an Order here). */
export function Orders() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'ALL'>('ALL');

  // All: every order except those still awaiting payment. Cancelled: cancelled only.
  const filteredOrders = useMemo(
    () =>
      orders.filter((order) =>
        selectedStatus === 'CANCELLED' ? order.status === 'CANCELLED' : order.status !== 'PENDING_PAYMENT',
      ),
    [orders, selectedStatus],
  );

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    listMyOrders(token, { pageSize: 50 })
      .then(({ data }) => setOrders(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : t.errors.load))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  const fallback = loading ? (
    <p className="loading-state" role="status">{t.loading}</p>
  ) : error ? (
    <p className="error-state" role="alert">{error}</p>
  ) : filteredOrders.length === 0 ? (
    <div className="empty-state">
      <sky-info-card icon="receipt_long" heading={t.empty.title} subheading={t.empty.description} />
      <FilledButton onClick={() => navigate('/')}>{t.empty.cta}</FilledButton>
    </div>
  ) : undefined;

  return (
    <>
      <Seo title={t.metaTitle} description={content.meta.orders.description} path={content.meta.orders.path} noindex="follow" />
      <SectionHead as="h1" id="orders-heading" heading={t.title} subheading={t.subtitle} />
      <div className="customer-orders-filters">
        <ChipSet className="chip-nav" aria-label={t.filtersLabel}>
          <FilterChip selected={selectedStatus === 'ALL'} onClick={() => setSelectedStatus('ALL')}>
            {t.filters.all}
          </FilterChip>
          <FilterChip selected={selectedStatus === 'CANCELLED'} onClick={() => setSelectedStatus('CANCELLED')}>
            {t.filters.cancelled}
          </FilterChip>
        </ChipSet>
      </div>
      <CardGrid layout="list" fallback={fallback}>
        {filteredOrders.map((order) => (
          <CustomerOrderCard
            key={order.id}
            order={order}
            onViewDetails={(selectedOrder) => navigate(`/orders/${selectedOrder.id}`)}
          />
        ))}
      </CardGrid>
    </>
  );
}
export default Orders;
