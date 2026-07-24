import { useNavigate } from 'react-router-dom';
import { FilledButton, IconButton, Icon, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { AdminPage } from '../../../admin/admin-page';
import { DataTable, type DataTableColumn } from '../../../admin/data-table';
import { StatusPill } from '../../../admin/status-pill';
import { useResource } from '../../../admin/use-resource';
import { apiClient } from '../../../../api/api-client';
import { formatINR } from '../../../../utils/format';

interface DealRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  isFeatured: boolean;
  company: { displayName: string };
  plan: { price: { amount: number } } | null;
}

export function DealsListPage() {
  const { items, loading, error, load } = useResource<DealRow>('/admin/deals');
  const navigate = useNavigate();

  async function runAction(id: string, action: 'publish' | 'pause' | 'resume' | 'archive') {
    await apiClient.post(`/admin/deals/${id}/review`, { action });
    load();
  }

  const columns: DataTableColumn<DealRow>[] = [
    { key: 'title', header: 'Deal', render: (d) => <strong>{d.title}</strong> },
    { key: 'company', header: 'Company', render: (d) => d.company.displayName },
    { key: 'price', header: 'From', render: (d) => (d.plan ? formatINR(d.plan.price.amount / 100) : '—') },
    { key: 'status', header: 'Status', render: (d) => <StatusPill status={d.status} /> },
  ];

  return (
    <AdminPage title="Deals" subtitle="Create and manage massage deal listings." wide>
      {error && <p className="console-banner console-banner--error">Couldn't load deals ({error}).</p>}
      <div className="console-toolbar">
        <span />
        <FilledButton onClick={() => navigate('/account/deals/new')}>
          <Icon slot="icon" aria-hidden="true">add</Icon>
          New deal
        </FilledButton>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(d) => d.id}
        loading={loading}
        emptyMessage="No deals yet."
        actions={(d) => (
          <>
            <IconButton aria-label={`Edit ${d.title}`} onClick={() => navigate(`/account/deals/${d.id}`)}>
              <Icon aria-hidden="true">edit</Icon>
            </IconButton>
            {(d.status === 'DRAFT' || d.status === 'PAUSED') && (
              <TextButton onClick={() => runAction(d.id, d.status === 'DRAFT' ? 'publish' : 'resume')}>
                {d.status === 'DRAFT' ? 'Publish' : 'Resume'}
              </TextButton>
            )}
            {d.status === 'LIVE' && <TextButton onClick={() => runAction(d.id, 'pause')}>Pause</TextButton>}
            {d.status !== 'ARCHIVED' && <TextButton onClick={() => runAction(d.id, 'archive')}>Archive</TextButton>}
          </>
        )}
      />
    </AdminPage>
  );
}

export default DealsListPage;
