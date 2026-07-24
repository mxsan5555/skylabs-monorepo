import { useState } from 'react';
import { FilledButton, IconButton, Icon, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import { AdminPage } from '../../../../admin/admin-page';
import { DataTable, type DataTableColumn } from '../../../../admin/data-table';
import { CrudDialog } from '../../../../admin/crud-dialog';
import { useResource } from '../../../../admin/use-resource';
import { inputValue } from '../../../../../utils/format';

interface Policy {
  id: string;
  name: string;
  description: string;
  freeCancelHoursBefore: number;
  partialRefundPct: number;
}

const EMPTY = { name: '', description: '', freeCancelHoursBefore: 24, partialRefundPct: 0 };

export function CancellationPoliciesPage() {
  const { items, loading, error, create, update } = useResource<Policy>('/admin/cancellation-policies');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setDraft(EMPTY);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(p: Policy) {
    setEditing(p);
    setDraft({ name: p.name, description: p.description, freeCancelHoursBefore: p.freeCancelHoursBefore, partialRefundPct: p.partialRefundPct });
    setFormError(null);
    setDialogOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) await update(editing.id, draft);
      else await create(draft);
      setDialogOpen(false);
    } catch {
      setFormError('Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const columns: DataTableColumn<Policy>[] = [
    { key: 'name', header: 'Name', render: (p) => <strong>{p.name}</strong> },
    { key: 'free', header: 'Free cancel window', render: (p) => `${p.freeCancelHoursBefore}h before` },
    { key: 'partial', header: 'Partial refund', render: (p) => `${p.partialRefundPct}%` },
  ];

  return (
    <AdminPage title="Cancellation Policies" subtitle="Shared refund rules attached to deals at creation." wide>
      {error && <p className="console-banner console-banner--error">Couldn't load policies ({error}).</p>}
      <div className="console-toolbar">
        <span />
        <FilledButton onClick={openCreate}>
          <Icon slot="icon" aria-hidden="true">add</Icon>
          New policy
        </FilledButton>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(p) => p.id}
        loading={loading}
        emptyMessage="No cancellation policies yet."
        actions={(p) => (
          <IconButton aria-label={`Edit ${p.name}`} onClick={() => openEdit(p)}>
            <Icon aria-hidden="true">edit</Icon>
          </IconButton>
        )}
      />

      <CrudDialog
        open={dialogOpen}
        title={editing ? 'Edit policy' : 'New policy'}
        onClose={() => setDialogOpen(false)}
        onSave={save}
        saving={saving}
        error={formError}
      >
        <OutlinedTextField
          className="span-2"
          label="Name"
          required
          value={draft.name}
          onInput={(e) => setDraft((d) => ({ ...d, name: inputValue(e as unknown as Event) }))}
        />
        <OutlinedTextField
          className="span-2"
          label="Consumer-facing description"
          required
          value={draft.description}
          onInput={(e) => setDraft((d) => ({ ...d, description: inputValue(e as unknown as Event) }))}
        />
        <OutlinedTextField
          label="Free cancel window (hours before)"
          type="number"
          value={String(draft.freeCancelHoursBefore)}
          onInput={(e) => setDraft((d) => ({ ...d, freeCancelHoursBefore: Number(inputValue(e as unknown as Event)) || 0 }))}
        />
        <OutlinedTextField
          label="Partial refund % (inside window)"
          type="number"
          value={String(draft.partialRefundPct)}
          onInput={(e) => setDraft((d) => ({ ...d, partialRefundPct: Number(inputValue(e as unknown as Event)) || 0 }))}
        />
      </CrudDialog>
    </AdminPage>
  );
}

export default CancellationPoliciesPage;
