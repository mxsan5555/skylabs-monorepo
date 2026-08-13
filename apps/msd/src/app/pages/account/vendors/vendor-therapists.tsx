import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import {
  Dialog,
  FilledButton,
  OutlinedButton,
  OutlinedTextField,
  OutlinedSelect,
  SelectOption,
  TextButton,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  createTherapist,
  listMyBranches,
  listMyTherapists,
  setTherapistStatus,
  updateTherapist,
  type Branch,
  type Therapist,
  type TherapistInput,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

const THERAPIST_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Branch', label: 'Branch' },
  { key: 'Specialization', label: 'Specialization' },
  { key: 'Experience', label: 'Experience' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);

/** A therapist row joined with the branch it belongs to, so the flat merged list (across all
 *  of the vendor's branches) can still show which branch each therapist is staffed at. */
interface TherapistWithBranch extends Therapist {
  branchName: string;
}

function toRow(t: TherapistWithBranch): Record<string, string | number> {
  return {
    Name: t.name,
    Branch: t.branchName,
    Specialization: t.specialization || '—',
    Experience: t.experienceYears ? `${t.experienceYears} yrs` : '—',
    Status: t.isActive ? 'Active' : 'Inactive',
  };
}

const THERAPIST_ACTIONS = JSON.stringify([
  { icon: 'edit', label: 'Edit', event: 'edit' },
  { icon: 'toggle_on', label: 'Activate / Deactivate', event: 'toggle-status' },
]);

interface TableParams {
  page: number;
  pageSize: number;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 20 };

/**
 * Vendor self-service "Therapists" page. The API is branch-scoped
 * (`GET /vendors/me/branches/:branchId/therapists`) with no single "all my therapists"
 * endpoint, so this page fetches the vendor's own branches first (same `listMyBranches` used
 * by "Branches & Deals"), then fetches each branch's therapists and merges them into one flat
 * list with a Branch column — fine client-side given the small number of branches per vendor.
 */
export function VendorTherapists() {
  const { token } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [therapists, setTherapists] = useState<TherapistWithBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);

  const [editingTherapist, setEditingTherapist] = useState<TherapistWithBranch | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: myBranches } = await listMyBranches(token);
      setBranches(myBranches);

      const perBranch = await Promise.all(
        myBranches.map(async (branch) => {
          const { data } = await listMyTherapists(token, branch.id);
          return data.map((t) => ({ ...t, branchName: branch.name }));
        }),
      );
      setTherapists(perBranch.flat());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load your therapists.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (input: TherapistInput, branchId: string, existing?: TherapistWithBranch) => {
    if (existing) {
      const { data } = await updateTherapist(token, existing.id, input);
      setTherapists((prev) => prev.map((t) => (t.id === data.id ? { ...data, branchName: existing.branchName } : t)));
    } else {
      const { data } = await createTherapist(token, branchId, input);
      const branchName = branches.find((b) => b.id === branchId)?.name ?? '—';
      setTherapists((prev) => [{ ...data, branchName }, ...prev]);
    }
    setMessage('Saved.');
  };

  const toggleStatus = async (therapist: TherapistWithBranch) => {
    setError('');
    try {
      const { data } = await setTherapistStatus(token, therapist.id, !therapist.isActive);
      setTherapists((prev) => prev.map((t) => (t.id === data.id ? { ...data, branchName: therapist.branchName } : t)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change status.');
    }
  };

  const total = therapists.length;
  const rows = useMemo(() => JSON.stringify(therapists.map(toRow)), [therapists]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown>; rowIndex: number }>).detail;
      const therapist = therapists[detail.rowIndex];
      if (!therapist) return;
      if (detail.action === 'edit') {
        setEditingTherapist(therapist);
        editDialogRef.current?.show();
      } else if (detail.action === 'toggle-status') {
        toggleStatus(therapist);
      }
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [therapists]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Therapists · MSD</title>
      <header className="page-head">
        <div>
          <h1>Therapists</h1>
          <p>Staff therapists across your business's branches.</p>
        </div>
        <div className="page-head__actions">
          {branches.length > 0 && (
            <OutlinedButton onClick={() => addDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add therapist
            </OutlinedButton>
          )}
        </div>
      </header>

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      {!loading && branches.length === 0 ? (
        <p className="empty-state">Add a branch under "Branches &amp; Deals" before adding therapists.</p>
      ) : (
        <sky-data-table
          ref={tableRef as RefObject<HTMLElement>}
          caption="Therapists"
          columns={THERAPIST_COLUMNS}
          rows={rows}
          total={total}
          page={params.page}
          page-size={params.pageSize}
          loading={loading}
          actions={THERAPIST_ACTIONS}
        />
      )}

      {branches.length > 0 && (
        <TherapistFormDialog dialogRef={addDialogRef} branches={branches} onSave={(input, branchId) => save(input, branchId)} />
      )}

      {editingTherapist && (
        <TherapistFormDialog
          key={editingTherapist.id}
          dialogRef={editDialogRef}
          branches={branches}
          therapist={editingTherapist}
          onSave={(input) => save(input, editingTherapist.branchId, editingTherapist)}
          onClose={() => setEditingTherapist(null)}
        />
      )}
    </div>
  );
}

const EMPTY_INPUT: TherapistInput = { name: '' };

function TherapistFormDialog({
  dialogRef,
  branches,
  therapist,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog>;
  branches: Branch[];
  therapist?: TherapistWithBranch;
  onSave: (input: TherapistInput, branchId: string) => Promise<void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<TherapistInput>(
    therapist
      ? {
          name: therapist.name,
          specialization: therapist.specialization ?? undefined,
          bio: therapist.bio ?? undefined,
          experienceYears: therapist.experienceYears ?? undefined,
          photoUrl: therapist.photoUrl ?? undefined,
        }
      : { ...EMPTY_INPUT },
  );
  const [branchId, setBranchId] = useState(therapist?.branchId ?? branches[0]?.id ?? '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof TherapistInput>(key: K, value: TherapistInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!form.name.trim() || !branchId) {
      setError('Name and branch are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSave(form, branchId);
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{therapist ? 'Edit therapist' : 'Add therapist'}</div>
      <div slot="content" className="form-grid">
        <OutlinedTextField label="Name" value={form.name} onInput={(e: Event) => set('name', (e.target as HTMLInputElement).value)} />

        {therapist ? (
          <p className="field-hint">Branch: {therapist.branchName} (cannot be changed)</p>
        ) : (
          <OutlinedSelect label="Branch" value={branchId} onChange={(e: Event) => setBranchId((e.target as HTMLSelectElement).value)}>
            {branches.map((b) => (
              <SelectOption key={b.id} value={b.id}>
                <div slot="headline">{b.name}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>
        )}

        <OutlinedTextField
          label="Specialization"
          value={form.specialization ?? ''}
          onInput={(e: Event) => set('specialization', (e.target as HTMLInputElement).value || undefined)}
        />

        <OutlinedTextField
          label="Bio"
          value={form.bio ?? ''}
          onInput={(e: Event) => set('bio', (e.target as HTMLInputElement).value || undefined)}
        />

        <OutlinedTextField
          label="Experience (years)"
          type="number"
          value={form.experienceYears !== undefined ? String(form.experienceYears) : ''}
          onInput={(e: Event) => set('experienceYears', Number((e.target as HTMLInputElement).value) || undefined)}
        />

        <OutlinedTextField
          label="Photo URL"
          value={form.photoUrl ?? ''}
          onInput={(e: Event) => set('photoUrl', (e.target as HTMLInputElement).value || undefined)}
        />

        {error && <p className="error-state" role="alert">{error}</p>}
      </div>
      <div slot="actions">
        <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
        <FilledButton onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</FilledButton>
      </div>
    </Dialog>
  );
}

export default VendorTherapists;
