import { useState } from 'react';
import {
  FilledButton,
  IconButton,
  Icon,
  OutlinedTextField,
  OutlinedSelect,
  SelectOption,
} from '@skylabs-monorepo/shared-ui/react';
import { AdminPage } from '../../../../admin/admin-page';
import { DataTable, type DataTableColumn } from '../../../../admin/data-table';
import { CrudDialog } from '../../../../admin/crud-dialog';
import { StatusPill } from '../../../../admin/status-pill';
import { useResource } from '../../../../admin/use-resource';
import { apiClient, ApiError } from '../../../../../api/api-client';
import { inputValue } from '../../../../../utils/format';

interface Location {
  id: string;
  name: string;
  city: string;
  openingHours: unknown[];
}

interface Company {
  id: string;
  slug: string;
  displayName: string;
  legalName: string;
  pan: string;
  about: string;
  contactEmail: string;
  contactPhone: string;
  status: 'DRAFT' | 'VERIFIED' | 'SUSPENDED';
  locations: Location[];
}

const EMPTY = {
  displayName: '',
  legalName: '',
  pan: '',
  about: '',
  contactEmail: '',
  contactPhone: '',
  status: 'VERIFIED' as Company['status'],
};

const LOCATION_EMPTY = { name: '', line1: '', city: '', state: '', postalCode: '', lat: 0, lng: 0 };

const STANDARD_HOURS = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  isClosed: false,
  opensAt: '10:00',
  closesAt: '21:00',
}));

export function CompaniesPage() {
  const { items, loading, error, create, update, load } = useResource<Company>('/admin/companies');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [locationsFor, setLocationsFor] = useState<Company | null>(null);
  const [locDraft, setLocDraft] = useState(LOCATION_EMPTY);
  const [locSaving, setLocSaving] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setDraft(EMPTY);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(c: Company) {
    setEditing(c);
    setDraft({
      displayName: c.displayName,
      legalName: c.legalName,
      pan: c.pan,
      about: c.about,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      status: c.status,
    });
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
    } catch (err) {
      setFormError(err instanceof ApiError ? err.code : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function addLocation() {
    if (!locationsFor) return;
    setLocSaving(true);
    setLocError(null);
    try {
      const created = await apiClient.post<Location>(`/admin/companies/${locationsFor.id}/locations`, {
        ...locDraft,
        lat: Number(locDraft.lat),
        lng: Number(locDraft.lng),
      });
      await apiClient.put(`/admin/locations/${created.id}/hours`, { hours: STANDARD_HOURS });
      setLocDraft(LOCATION_EMPTY);
      load();
      setLocationsFor(null);
    } catch (err) {
      setLocError(err instanceof ApiError ? err.code : 'Save failed');
    } finally {
      setLocSaving(false);
    }
  }

  const columns: DataTableColumn<Company>[] = [
    { key: 'name', header: 'Company', render: (c) => <strong>{c.displayName}</strong> },
    { key: 'contact', header: 'Contact', render: (c) => c.contactEmail },
    { key: 'locations', header: 'Locations', render: (c) => c.locations.length },
    { key: 'status', header: 'Status', render: (c) => <StatusPill status={c.status} /> },
  ];

  return (
    <AdminPage title="Companies" subtitle="Spa/wellness businesses whose deals list on MSD (admin-managed for now)." wide>
      {error && <p className="console-banner console-banner--error">Couldn't load companies ({error}).</p>}
      <div className="console-toolbar">
        <span />
        <FilledButton onClick={openCreate}>
          <Icon slot="icon" aria-hidden="true">add</Icon>
          New company
        </FilledButton>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(c) => c.id}
        loading={loading}
        emptyMessage="No companies yet."
        actions={(c) => (
          <>
            <IconButton aria-label={`Manage locations for ${c.displayName}`} onClick={() => setLocationsFor(c)}>
              <Icon aria-hidden="true">location_on</Icon>
            </IconButton>
            <IconButton aria-label={`Edit ${c.displayName}`} onClick={() => openEdit(c)}>
              <Icon aria-hidden="true">edit</Icon>
            </IconButton>
          </>
        )}
      />

      <CrudDialog
        open={dialogOpen}
        title={editing ? 'Edit company' : 'New company'}
        onClose={() => setDialogOpen(false)}
        onSave={save}
        saving={saving}
        error={formError}
      >
        <OutlinedTextField label="Display name" required value={draft.displayName} onInput={(e) => setDraft((d) => ({ ...d, displayName: inputValue(e as unknown as Event) }))} />
        <OutlinedTextField label="Legal name" required value={draft.legalName} onInput={(e) => setDraft((d) => ({ ...d, legalName: inputValue(e as unknown as Event) }))} />
        <OutlinedTextField label="PAN" required value={draft.pan} onInput={(e) => setDraft((d) => ({ ...d, pan: inputValue(e as unknown as Event) }))} />
        <OutlinedSelect
          label="Status"
          value={draft.status}
          onChange={(e) => setDraft((d) => ({ ...d, status: (e.target as HTMLSelectElement).value as Company['status'] }))}
        >
          <SelectOption value="DRAFT">Draft</SelectOption>
          <SelectOption value="VERIFIED">Verified</SelectOption>
          <SelectOption value="SUSPENDED">Suspended</SelectOption>
        </OutlinedSelect>
        <OutlinedTextField label="Contact email" type="email" required value={draft.contactEmail} onInput={(e) => setDraft((d) => ({ ...d, contactEmail: inputValue(e as unknown as Event) }))} />
        <OutlinedTextField label="Contact phone" required value={draft.contactPhone} onInput={(e) => setDraft((d) => ({ ...d, contactPhone: inputValue(e as unknown as Event) }))} />
        <OutlinedTextField className="span-2" label="About" required value={draft.about} onInput={(e) => setDraft((d) => ({ ...d, about: inputValue(e as unknown as Event) }))} />
      </CrudDialog>

      <CrudDialog
        open={!!locationsFor}
        title={`Locations — ${locationsFor?.displayName ?? ''}`}
        onClose={() => setLocationsFor(null)}
        onSave={addLocation}
        saving={locSaving}
        saveLabel="Add location"
        error={locError}
      >
        <ul className="crud-list-editor span-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {locationsFor?.locations.map((l) => (
            <li key={l.id} className="crud-list-editor__row">
              <Icon aria-hidden="true">location_on</Icon> {l.name}, {l.city}
            </li>
          ))}
        </ul>
        <OutlinedTextField label="Branch name" value={locDraft.name} onInput={(e) => setLocDraft((d) => ({ ...d, name: inputValue(e as unknown as Event) }))} />
        <OutlinedTextField label="City" value={locDraft.city} onInput={(e) => setLocDraft((d) => ({ ...d, city: inputValue(e as unknown as Event) }))} />
        <OutlinedTextField className="span-2" label="Address line" value={locDraft.line1} onInput={(e) => setLocDraft((d) => ({ ...d, line1: inputValue(e as unknown as Event) }))} />
        <OutlinedTextField label="State" value={locDraft.state} onInput={(e) => setLocDraft((d) => ({ ...d, state: inputValue(e as unknown as Event) }))} />
        <OutlinedTextField label="Postal code" value={locDraft.postalCode} onInput={(e) => setLocDraft((d) => ({ ...d, postalCode: inputValue(e as unknown as Event) }))} />
        <OutlinedTextField label="Latitude" type="number" value={String(locDraft.lat)} onInput={(e) => setLocDraft((d) => ({ ...d, lat: Number(inputValue(e as unknown as Event)) || 0 }))} />
        <OutlinedTextField label="Longitude" type="number" value={String(locDraft.lng)} onInput={(e) => setLocDraft((d) => ({ ...d, lng: Number(inputValue(e as unknown as Event)) || 0 }))} />
        <p className="crud-dialog__error span-2" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
          New locations get standard 10:00–21:00 daily hours — adjust later if needed.
        </p>
      </CrudDialog>
    </AdminPage>
  );
}

export default CompaniesPage;
