import { useCallback, useMemo, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FilledButton, Tabs, SecondaryTab, ChipSet, FilterChip, } from '@skylabs-monorepo/shared-ui/react';
import { CustomerOrderCard } from './customer-order-card';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listMyOrders, type Order, type OrderStatus, } from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import './orders.css';
import content from '../../../content.json';
import { CardGrid } from '../../components/card-grid/card-grid';
import { Breadcrumb } from '../../components/breadcrumb';

/** Customer's own orders — the Cart convergence point (every purchase kind, Deal/Product/
 *  Therapist alike, becomes an Order here). Reuses `entity-list`/`status-pill`. Relocated here
 *  from the old marketplace orders route now that the marketplace route namespace is retired —
 *  this page never had a mock/static equivalent, so it moved rather than merged. */

export function Orders() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'ALL'>('ALL');
  const { orders: ordersContent } = content;
  const [searchParams] = useSearchParams();
  const typeFilter = searchParams.get('type');
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesStatus = selectedStatus === 'ALL' || order.status === selectedStatus;
      const matchesType = !typeFilter || order.type === typeFilter;
      return matchesStatus && matchesType;
    });
  }, [orders, selectedStatus, typeFilter]);
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    listMyOrders(token, { pageSize: 50 })
      .then(({ data }) => setOrders(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : ordersContent.errors.load))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="category-page">
      <title>{ordersContent.metaTitle}</title>
      <meta name="robots" content="noindex" />
      <Breadcrumb
        items={[{ label: 'Home', to: '/' }, { label: 'Orders' },]}
      />
      {/* <div className="customer-orders-filters">
        <Tabs>
          <SecondaryTab onClick={() => setSelectedStatus('ALL')}>All</SecondaryTab>
          <SecondaryTab onClick={() => setSelectedStatus('CANCELLED')}>Cancelled</SecondaryTab>
        </Tabs>
      </div> */}
      <div className="customer-orders-filters">
        <ChipSet className="chip-nav" aria-label="Order status filters">
          < FilterChip selected={selectedStatus === 'ALL'} onClick={() => setSelectedStatus('ALL')}  >All</ FilterChip>
          <FilterChip selected={selectedStatus === 'CANCELLED'} onClick={() => setSelectedStatus('CANCELLED')}> Cancelled </ FilterChip>
        </ChipSet>
      </div>
      <section className="category-page__grid-wrap">
        <div className="category-page__grid-inner">
          {loading ? (<p className="loading-state">{ordersContent.loading}</p>
          ) : error ? (<p className="error-state" role="alert">{error || ordersContent.errors.load}</p>
          ) : filteredOrders.length === 0 ? (
            <div className="category-page__empty">
              <sky-info-card icon="receipt_long" heading={ordersContent.empty.title} subheading={ordersContent.empty.description} />
              <FilledButton onClick={() => navigate('/')}>{ordersContent.empty.cta}</FilledButton>
            </div>
          ) : (
            <CardGrid layout="list">
              {filteredOrders.map((order) => (
                <CustomerOrderCard
                  key={order.id}
                  order={order}
                  onViewDetails={(selectedOrder) => navigate(`/orders/${selectedOrder.id}`)}
                />
              ))}
            </CardGrid>
          )}
        </div>
      </section>
    </div>
  );
}
export default Orders;
