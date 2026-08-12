import { useCallback, useEffect, useState } from 'react';
import { OutlinedSelect, SelectOption } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listOrders, setOrderStatus, type Order, type OrderStatus } from '../../../../api/rbac/orders';
import { ApiRequestError } from '../../../../api/rbac/client';

const STATUS_OPTIONS: OrderStatus[] = ['PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];

/** One list serves both audiences: an admin sees every order, a vendor caller is force-scoped
 *  server-side to its own vendor (order.service.ts#listOrders) — no second vendor-only page. */
export function OrderManagement() {
  const { token, can } = useAuth();
  const canChangeStatus = can('orders', 'status_change');

  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listOrders(token, { status: statusFilter || undefined, pageSize: 100 });
      setOrders(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load orders.');
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (order: Order, status: OrderStatus) => {
    setError('');
    try {
      const { data } = await setOrderStatus(token, order.id, status);
      setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change order status.');
    }
  };

  const ALLOWED_NEXT: Record<OrderStatus, OrderStatus[]> = {
    PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };

  return (
    <div className="admin-page admin-page--wide">
      <title>Orders · MSD</title>
      <header className="page-head">
        <div>
          <h1>Orders</h1>
          <p>Every order from the marketplace catalogue (Booking or Cart checkout).</p>
        </div>
        <div className="page-head__actions">
          <OutlinedSelect label="Status" value={statusFilter} onChange={(e: Event) => setStatusFilter((e.target as HTMLSelectElement).value as OrderStatus | '')}>
            <SelectOption value="">
              <div slot="headline">All</div>
            </SelectOption>
            {STATUS_OPTIONS.map((s) => (
              <SelectOption key={s} value={s}>
                <div slot="headline">{s}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      {loading ? (
        <p className="loading-state">Loading orders…</p>
      ) : orders.length === 0 ? (
        <p className="empty-state">No orders yet.</p>
      ) : (
        <>
          <p className="field-hint">{total} order{total === 1 ? '' : 's'}</p>
          <ul className="entity-list">
            {orders.map((order) => (
              <li key={order.id}>
                <div className="entity-list__item">
                  <span className="role-list__name">
                    {order.items.map((i) => i.itemName).join(', ')}
                    <span className="field-hint">
                      {' '}
                      · {order.type} · {order.customer.name} ({order.customer.phone ?? order.customer.email ?? '—'}) · {order.vendorNameSnapshot} · {order.branchNameSnapshot}
                      {' '}
                      · {order.items.reduce((n, i) => n + i.quantity, 0)} item(s) · ₹{order.total}
                      {' '}
                      · {new Date(order.createdAt).toLocaleString()}
                    </span>
                  </span>
                  <span className={`status-pill ${order.status === 'CANCELLED' ? 'status-pill--inactive' : 'status-pill--active'}`}>
                    {order.status}
                  </span>
                </div>
                {order.cancellationReason && <p className="error-state">Cancelled: {order.cancellationReason}</p>}
                {canChangeStatus && ALLOWED_NEXT[order.status].length > 0 && (
                  <div className="page-head__actions">
                    <OutlinedSelect
                      label="Change status"
                      value=""
                      onChange={(e: Event) => {
                        const next = (e.target as HTMLSelectElement).value as OrderStatus;
                        if (next) changeStatus(order, next);
                      }}
                    >
                      <SelectOption value="">
                        <div slot="headline">Select…</div>
                      </SelectOption>
                      {ALLOWED_NEXT[order.status].map((next) => (
                        <SelectOption key={next} value={next}>
                          <div slot="headline">{next}</div>
                        </SelectOption>
                      ))}
                    </OutlinedSelect>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default OrderManagement;
