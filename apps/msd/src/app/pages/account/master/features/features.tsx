import { useState } from 'react';
import { FilledButton, IconButton, Icon, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import { AdminPage } from '../../../../admin/admin-page';
import { DataTable, type DataTableColumn } from '../../../../admin/data-table';
import { CrudDialog } from '../../../../admin/crud-dialog';
import { useResource } from '../../../../admin/use-resource';
import { inputValue } from '../../../../../utils/format';

interface Feature {
  id: string;
  name: string;
}

export function FeaturesPage() {
  const { items, loading, error, create, update, remove } = useResource<Feature>('/admin/features');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Feature | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setName('');
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(f: Feature) {
    setEditing(f);
    setName(f.name);
    setFormError(null);
    setDialogOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) await update(editing.id, { name });
      else await create({ name });
      setDialogOpen(false);
    } catch {
      setFormError('Save failed — name may already exist.');
    } finally {
      setSaving(false);
    }
  }

  const columns: DataTableColumn<Feature>[] = [{ key: 'name', header: 'Name', render: (f) => f.name }];

  return (
    <AdminPage title="Features" subtitle="Shared amenity/feature vocabulary used by deals, companies, and search filters." wide>
      {error && <p className="console-banner console-banner--error">Couldn't load features ({error}).</p>}
      <div className="console-toolbar">
        <span />
        <FilledButton onClick={openCreate}>
          <Icon slot="icon" aria-hidden="true">add</Icon>
          New feature
        </FilledButton>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(f) => f.id}
        loading={loading}
        emptyMessage="No features yet."
        actions={(f) => (
          <>
            <IconButton aria-label={`Edit ${f.name}`} onClick={() => openEdit(f)}>
              <Icon aria-hidden="true">edit</Icon>
            </IconButton>
            <IconButton aria-label={`Delete ${f.name}`} onClick={() => remove(f.id)}>
              <Icon aria-hidden="true">delete</Icon>
            </IconButton>
          </>
        )}
      />

      <CrudDialog
        open={dialogOpen}
        title={editing ? 'Edit feature' : 'New feature'}
        onClose={() => setDialogOpen(false)}
        onSave={save}
        saving={saving}
        error={formError}
      >
        <OutlinedTextField
          className="span-2"
          label="Name"
          required
          value={name}
          onInput={(e) => setName(inputValue(e as unknown as Event))}
        />
      </CrudDialog>
    </AdminPage>
  );
}

export default FeaturesPage;
