import { useState } from 'react';
import {
  FilledButton,
  IconButton,
  Icon,
  OutlinedTextField,
  OutlinedSelect,
  SelectOption,
} from '@skylabs-monorepo/shared-ui/react';
import { AdminPage } from '../../../admin/admin-page';
import { DataTable, type DataTableColumn } from '../../../admin/data-table';
import { CrudDialog } from '../../../admin/crud-dialog';
import { StatusPill } from '../../../admin/status-pill';
import { useResource } from '../../../admin/use-resource';
import { ApiError } from '../../../../api/api-client';
import { inputValue } from '../../../../utils/format';

interface PromoCode {
  id: string;
  code: string;
  kind: 'PERCENT' | 'FIXED';
  value: number;
  firstOrderOnly: boolean;
  isActive: boolean;
  validUntil: string;
}

const EMPTY = { code: '', kind: 'PERCENT' as PromoCode['kind'], value: 10, firstOrderOnly: false, validUntil: '' };

export function PromotionsPage() {
  const { items, loading, error, create, update, remove } = useResource<PromoCode>('/admin/promo-codes');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setDraft({ ...EMPTY, validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) });
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(p: PromoCode) {
    setEditing(p);
    setDraft({ code: p.code, kind: p.kind, value: p.value, firstOrderOnly: p.firstOrderOnly, validUntil: p.validUntil.slice(0, 10) });
    setFormError(null);
    setDialogOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      const body = { ...draft, validUntil: new Date(`${draft.validUntil}T23:59:59Z`).toISOString() };
      if (editing) await update(editing.id, body);
      else await create(body);
      setDialogOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.code : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const columns: DataTableColumn<PromoCode>[] = [
    { key: 'code', header: 'Code', render: (p) => <strong>{p.code}</strong> },
    { key: 'value', header: 'Discount', render: (p) => (p.kind === 'PERCENT' ? `${p.value}%` : `₹${p.value / 100}`) },
    { key: 'firstOrder', header: 'First order only', render: (p) => (p.firstOrderOnly ? 'Yes' : 'No') },
    { key: 'validUntil', header: 'Valid until', render: (p) => new Date(p.validUntil).toLocaleDateString('en-IN') },
    { key: 'active', header: 'Status', render: (p) => <StatusPill status={p.isActive ? 'ACTIVE' : 'SUSPENDED'} /> },
  ];

  return (
    <AdminPage title="Promotions" subtitle="Marketing only — create and manage promo codes." wide>
      {error && <p className="console-banner console-banner--error">Couldn't load promo codes ({error}).</p>}
      <div className="console-toolbar">
        <span />
        <FilledButton onClick={openCreate}>
          <Icon slot="icon" aria-hidden="true">add</Icon>
          New promo code
        </FilledButton>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(p) => p.id}
        loading={loading}
        emptyMessage="No promo codes yet."
        actions={(p) => (
          <>
            <IconButton aria-label={`Edit ${p.code}`} onClick={() => openEdit(p)}>
              <Icon aria-hidden="true">edit</Icon>
            </IconButton>
            <IconButton aria-label={`Delete ${p.code}`} onClick={() => remove(p.id)}>
              <Icon aria-hidden="true">delete</Icon>
            </IconButton>
          </>
        )}
      />

      <CrudDialog open={dialogOpen} title={editing ? 'Edit promo code' : 'New promo code'} onClose={() => setDialogOpen(false)} onSave={save} saving={saving} error={formError}>
        <OutlinedTextField
          label="Code"
          required
          disabled={!!editing}
          value={draft.code}
          onInput={(e) => setDraft((d) => ({ ...d, code: inputValue(e as unknown as Event).toUpperCase() }))}
        />
        <OutlinedSelect label="Kind" value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: (e.target as HTMLSelectElement).value as PromoCode['kind'] }))}>
          <SelectOption value="PERCENT">Percent off</SelectOption>
          <SelectOption value="FIXED">Fixed amount off (paise)</SelectOption>
        </OutlinedSelect>
        <OutlinedTextField
          label={draft.kind === 'PERCENT' ? 'Percent (1-100)' : 'Amount (paise)'}
          type="number"
          value={String(draft.value)}
          onInput={(e) => setDraft((d) => ({ ...d, value: Number(inputValue(e as unknown as Event)) || 0 }))}
        />
        <OutlinedTextField
          label="Valid until"
          type="date"
          value={draft.validUntil}
          onInput={(e) => setDraft((d) => ({ ...d, validUntil: inputValue(e as unknown as Event) }))}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={draft.firstOrderOnly}
            onChange={(e) => setDraft((d) => ({ ...d, firstOrderOnly: e.target.checked }))}
          />
          First order only
        </label>
      </CrudDialog>
    </AdminPage>
  );
}

export default PromotionsPage;
