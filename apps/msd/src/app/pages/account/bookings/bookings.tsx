import { AdminPage } from '../../../admin/admin-page';
import { DataTable, type DataTableColumn } from '../../../admin/data-table';
import { StatusPill } from '../../../admin/status-pill';
import { useResource } from '../../../admin/use-resource';
import { formatINR } from '../../../../utils/format';

interface MyOrder {
  id: string;
  orderNumber: string;
  status: string;
  payable: { amount: number };
  placedAt: string;
  items: { dealTitle: string; quantity: number }[];
}

export function BookingsPage() {
  const { items, loading, error } = useResource<MyOrder>('/me/orders');

  const columns: DataTableColumn<MyOrder>[] = [
    { key: 'order', header: 'Order', render: (o) => <strong>{o.orderNumber}</strong> },
    { key: 'items', header: 'Booking', render: (o) => o.items.map((i) => `${i.dealTitle} × ${i.quantity}`).join(', ') },
    { key: 'amount', header: 'Paid', render: (o) => formatINR(o.payable.amount / 100) },
    { key: 'date', header: 'Placed', render: (o) => new Date(o.placedAt).toLocaleString('en-IN') },
    { key: 'status', header: 'Status', render: (o) => <StatusPill status={o.status} /> },
  ];

  return (
    <AdminPage title="My Bookings" subtitle="Your order history and payment status." wide>
      {error && <p className="console-banner console-banner--error">Couldn't load your bookings ({error}).</p>}
      <DataTable
        columns={columns}
        rows={items}
        rowKey={(o) => o.id}
        loading={loading}
        emptyMessage="No bookings yet — book a deal to see it here."
      />
    </AdminPage>
  );
}

export default BookingsPage;
