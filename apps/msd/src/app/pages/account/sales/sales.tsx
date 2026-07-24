import { AdminPage } from '../../../admin/admin-page';
import { DataTable, type DataTableColumn } from '../../../admin/data-table';
import { StatusPill } from '../../../admin/status-pill';
import { useResource } from '../../../admin/use-resource';
import { formatINR } from '../../../../utils/format';

interface AdminOrder {
  id: string;
  orderNumber: string;
  status: string;
  payable: { amount: number };
  placedAt: string;
  items: { dealTitle: string; quantity: number }[];
}

export function SalesPage() {
  const { items, loading, error } = useResource<AdminOrder>('/admin/orders');

  const columns: DataTableColumn<AdminOrder>[] = [
    { key: 'order', header: 'Order', render: (o) => <strong>{o.orderNumber}</strong> },
    { key: 'items', header: 'Items', render: (o) => o.items.map((i) => `${i.dealTitle} × ${i.quantity}`).join(', ') },
    { key: 'amount', header: 'Amount', render: (o) => formatINR(o.payable.amount / 100) },
    { key: 'date', header: 'Placed', render: (o) => new Date(o.placedAt).toLocaleString('en-IN') },
    { key: 'status', header: 'Status', render: (o) => <StatusPill status={o.status} /> },
  ];

  return (
    <AdminPage title="Sales" subtitle="Sales only — track orders, revenue, and payment status." wide>
      {error && <p className="console-banner console-banner--error">Couldn't load orders ({error}).</p>}
      <DataTable columns={columns} rows={items} rowKey={(o) => o.id} loading={loading} emptyMessage="No orders yet." />
    </AdminPage>
  );
}

export default SalesPage;
