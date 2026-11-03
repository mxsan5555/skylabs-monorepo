import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate , useSearchParams} from 'react-router-dom';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listMyOrders, type Order } from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import { CustomerOrderCard } from './customer-order-card';
import { SectionHead } from '../../components/section-head/section-head';
import { ChipNav } from '../../components/chip-nav/chip-nav';
import { CardGrid } from '../../components/card-grid/card-grid';
import { StatusPanel } from '../../components/status-panel/status-panel';
import { Seo } from '../../seo/seo';
import content from '../../../content.json';


const t = content.orders;
type Filter = 'ALL' | 'CANCELLED';

/** Customer's own orders, newest first: every purchase kind (deal, product, therapist) from one
 *  checkout is one order; each shows as a receipt panel with all its lines. */
export function Orders() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedType = searchParams.get('type');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');

  // All: every order except those still awaiting payment. Cancelled: cancelled only.
  const shown = useMemo(
    () => orders.filter((order) => (filter === 'CANCELLED' ? order.status === 'CANCELLED' : order.status !== 'PENDING_PAYMENT')),
    [orders, filter],
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
  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Seo title={t.metaTitle} description={content.meta.orders.description} path={content.meta.orders.path} noindex="follow" />
      <SectionHead as="h1" id="orders-heading" titleClassName="headline-medium" heading={t.title} subheading={t.subtitle} />
      <ChipNav
        ariaLabel={t.filtersLabel}
        items={[
          { value: 'ALL', label: t.filters.all },
          { value: 'CANCELLED', label: t.filters.cancelled },
        ]}
        value={filter}
        onSelect={(value) => setFilter(value as Filter)}
      />
      <CardGrid
        layout="list"
        fallback={
          loading ? (
            <p className="loading-state" role="status">
              {t.loading}
            </p>
          ) : error ? (
            <p className="error-state" role="alert">
              {error}
            </p>
          ) : shown.length === 0 ? (
            <StatusPanel
              id="orders-empty"
              as="h2"
              icon="receipt_long"
              tone="neutral"
              heading={t.empty.title}
              text={t.empty.description}
              actions={<FilledButton onClick={() => navigate('/deals')}>{t.empty.cta}</FilledButton>}
            />
          ) : undefined
        }
      >
        {shown.map((order) => (
          <CustomerOrderCard key={order.id} order={order} onViewDetails={(selected) => navigate(`/orders/${selected.id}`)} />
        ))}
      </CardGrid>
    </>
  );
}

export default Orders;
