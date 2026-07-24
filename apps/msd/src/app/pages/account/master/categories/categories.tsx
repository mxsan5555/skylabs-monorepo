import { useState } from 'react';
import { FilledButton, IconButton, Icon, OutlinedTextField, Switch } from '@skylabs-monorepo/shared-ui/react';
import { AdminPage } from '../../../../admin/admin-page';
import { DataTable, type DataTableColumn } from '../../../../admin/data-table';
import { CrudDialog } from '../../../../admin/crud-dialog';
import { useResource } from '../../../../admin/use-resource';
import { apiClient, ApiError } from '../../../../../api/api-client';
import { inputValue } from '../../../../../utils/format';

interface Subcategory {
  id: string;
  slug: string;
  name: string;
  dealCount?: number;
}

interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  dealCount?: number;
  subcategories: Subcategory[];
}

const EMPTY = { name: '', description: '', icon: '', sortOrder: 0, isActive: true };

export function CategoriesPage() {
  const { items, loading, error, load } = useResource<Category>('/categories?all=true');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [subDialogFor, setSubDialogFor] = useState<Category | null>(null);
  const [subName, setSubName] = useState('');
  const [subSaving, setSubSaving] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setDraft(EMPTY);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setDraft({ name: cat.name, description: cat.description, icon: cat.icon, sortOrder: cat.sortOrder, isActive: cat.isActive });
    setFormError(null);
    setDialogOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await apiClient.patch(`/admin/categories/${editing.id}`, draft);
      } else {
        await apiClient.post('/admin/categories', draft);
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.code : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function addSubcategory() {
    if (!subDialogFor || !subName.trim()) return;
    setSubSaving(true);
    setSubError(null);
    try {
      await apiClient.post(`/admin/categories/${subDialogFor.id}/subcategories`, { name: subName.trim() });
      setSubName('');
      load();
    } catch (err) {
      setSubError(err instanceof ApiError ? err.code : 'Save failed');
    } finally {
      setSubSaving(false);
    }
  }

  const columns: DataTableColumn<Category>[] = [
    { key: 'name', header: 'Name', render: (c) => <strong>{c.name}</strong> },
    { key: 'slug', header: 'Slug', render: (c) => c.slug },
    { key: 'icon', header: 'Icon', render: (c) => <Icon aria-hidden="true">{c.icon}</Icon> },
    { key: 'subs', header: 'Subcategories', render: (c) => c.subcategories.length },
    { key: 'deals', header: 'Deals', render: (c) => c.dealCount ?? '—' },
    { key: 'active', header: 'Active', render: (c) => (c.isActive ? 'Yes' : 'No') },
  ];

  return (
    <AdminPage title="Categories" subtitle="Manage the taxonomy shown across search, nav, and deal forms." wide>
      {error && <p className="console-banner console-banner--error">Couldn't load categories ({error}).</p>}
      <div className="console-toolbar">
        <span />
        <FilledButton onClick={openCreate}>
          <Icon slot="icon" aria-hidden="true">add</Icon>
          New category
        </FilledButton>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(c) => c.id}
        loading={loading}
        emptyMessage="No categories yet."
        actions={(c) => (
          <>
            <IconButton aria-label={`Manage subcategories for ${c.name}`} onClick={() => setSubDialogFor(c)}>
              <Icon aria-hidden="true">list</Icon>
            </IconButton>
            <IconButton aria-label={`Edit ${c.name}`} onClick={() => openEdit(c)}>
              <Icon aria-hidden="true">edit</Icon>
            </IconButton>
          </>
        )}
      />

      <CrudDialog
        open={dialogOpen}
        title={editing ? 'Edit category' : 'New category'}
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
          label="Description"
          required
          value={draft.description}
          onInput={(e) => setDraft((d) => ({ ...d, description: inputValue(e as unknown as Event) }))}
        />
        <OutlinedTextField
          label="Icon (Material Symbols name)"
          required
          value={draft.icon}
          onInput={(e) => setDraft((d) => ({ ...d, icon: inputValue(e as unknown as Event) }))}
        />
        <OutlinedTextField
          label="Sort order"
          type="number"
          value={String(draft.sortOrder)}
          onInput={(e) => setDraft((d) => ({ ...d, sortOrder: Number(inputValue(e as unknown as Event)) || 0 }))}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Switch selected={draft.isActive} onChange={(e) => setDraft((d) => ({ ...d, isActive: (e.target as HTMLElement & { selected: boolean }).selected }))} />
          Active
        </label>
      </CrudDialog>

      <CrudDialog
        open={!!subDialogFor}
        title={`Subcategories — ${subDialogFor?.name ?? ''}`}
        onClose={() => setSubDialogFor(null)}
        onSave={addSubcategory}
        saving={subSaving}
        saveLabel="Add"
        error={subError}
      >
        <ul className="crud-list-editor span-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {subDialogFor?.subcategories.map((s) => (
            <li key={s.id} className="crud-list-editor__row">
              {s.name}
            </li>
          ))}
        </ul>
        <OutlinedTextField
          className="span-2"
          label="New subcategory name"
          value={subName}
          onInput={(e) => setSubName(inputValue(e as unknown as Event))}
        />
      </CrudDialog>
    </AdminPage>
  );
}

export default CategoriesPage;
