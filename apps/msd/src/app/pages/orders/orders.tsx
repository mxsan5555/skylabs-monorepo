import { useCallback, useMemo, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FilledButton, ChipSet, FilterChip, } from '@skylabs-monorepo/shared-ui/react';
import { CustomerOrderCard } from './customer-order-card';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listMyOrders, type Order, type OrderStatus, } from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import './orders.css';
import content from '../../../content.json';
import { CardGrid } from '../../components/card-grid/card-grid';
import { SectionHead } from '../../components/section-head/section-head';
const t = content.orders;
export function Orders() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedType = searchParams.get('type');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'ALL'>('ALL');
  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (selectedType === 'SERVICE' && order.type !== 'SERVICE') { return false; }
        if (selectedType === 'PRODUCT' && order.type !== 'PRODUCT') { return false; }
        if (selectedStatus === 'CANCELLED') { return order.status === 'CANCELLED'; }
        return order.status !== 'PENDING_PAYMENT';
      }),
    [orders, selectedStatus, selectedType],
  );
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    listMyOrders(token, { pageSize: 50 })
      .then(({ data }) => setOrders(data))
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : t.errors.load,),)
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { load(); }, [load]);
  const fallback = loading ? (
    <p className="loading-state" role="status">{t.loading} </p>
  ) : error ? (
    <p className="error-state" role="alert"> {error} </p>
  ) : filteredOrders.length === 0 ? (
    <div className="empty-state">
      <sky-info-card
        icon="receipt_long"
        heading={t.empty.title}
        subheading={t.empty.description}
      />
      <FilledButton onClick={() => navigate('/')}> {t.empty.cta}  </FilledButton>
    </div>
  ) : undefined;
  return (
    <>
      <title>{t.metaTitle}</title>
      <meta name="robots" content="noindex" />
      <SectionHead
        as="h1"
        id="orders-heading"
        heading={t.title}
        subheading={t.subtitle}
      />
      <div className="customer-orders-filters">
        <ChipSet className="chip-nav" aria-label={t.filtersLabel} >
          <FilterChip selected={selectedStatus === 'ALL'} onClick={() => setSelectedStatus('ALL')}>
            {t.filters.all}
          </FilterChip>
          <FilterChip selected={selectedStatus === 'CANCELLED'} onClick={() => setSelectedStatus('CANCELLED')} >
            {t.filters.cancelled}
          </FilterChip>
        </ChipSet>
      </div>
      <div className="customer-orders-list">
        <CardGrid layout="list" fallback={fallback}>
          {filteredOrders.map((order) => (
            <CustomerOrderCard key={order.id} order={order} />
          ))}
        </CardGrid>
      </div>
    </>
  );
}
export default Orders;