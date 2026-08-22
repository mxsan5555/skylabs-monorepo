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
  listTherapistPackages,
  createTherapistPackage,
  updateTherapistPackage,
  deleteTherapistPackage,
  type Branch,
  type Therapist,
  type TherapistInput,
  type TherapistPackage,
  type TherapistPackageInput,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { formatINR } from '../../../../utils/format';
import { MediaUploader } from '../../../components/media-uploader';

const THERAPIST_COLUMNS = JSON.stringify([
  { key: 'Type', label: 'Type' },
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
    Type: t.therapistType,
    Name: t.personName,
    Branch: t.branchName,
    Specialization: t.specialization || '—',
    Experience: t.experienceYears ? `${t.experienceYears} yrs` : '—',
    Status: t.isActive ? 'Active' : 'Inactive',
  };
}

const THERAPIST_ACTIONS = JSON.stringify([
  { icon: 'edit', label: 'Edit', event: 'edit' },
  { icon: 'sell', label: 'Manage Packages', event: 'manage-packages' },
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
  const [managingTherapist, setManagingTherapist] = useState<TherapistWithBranch | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);
  const packagesDialogRef = useRef<MdDialog>(null);
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
      const merged = { ...data, branchName: existing.branchName };
      setTherapists((prev) => prev.map((t) => (t.id === data.id ? merged : t)));
      setMessage('Saved.');
      return merged;
    } else {
      const { data } = await createTherapist(token, branchId, input);
      const branchName = branches.find((b) => b.id === branchId)?.name ?? '—';
      const created = { ...data, branchName };
      setTherapists((prev) => [created, ...prev]);
      setMessage('Saved.');
      return created;
    }
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
      } else if (detail.action === 'manage-packages') {
        setManagingTherapist(therapist);
        packagesDialogRef.current?.show();
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
        <TherapistFormDialog dialogRef={addDialogRef} branches={branches} token={token} onSave={(input, branchId) => save(input, branchId)} />
      )}

      {editingTherapist && (
        <TherapistFormDialog
          key={editingTherapist.id}
          dialogRef={editDialogRef}
          branches={branches}
          therapist={editingTherapist}
          token={token}
          onSave={(input) => save(input, editingTherapist.branchId, editingTherapist)}
          onClose={() => setEditingTherapist(null)}
        />
      )}

      {managingTherapist && (
        <TherapistPackagesDialog
          key={managingTherapist.id}
          dialogRef={packagesDialogRef}
          therapist={managingTherapist}
          onClose={() => setManagingTherapist(null)}
        />
      )}
    </div>
  );
}

const EMPTY_INPUT: TherapistInput = { therapistType: '', personName: '' };

function TherapistFormDialog({
  dialogRef,
  branches,
  therapist,
  token,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog>;
  branches: Branch[];
  therapist?: TherapistWithBranch;
  token: string | null;
  onSave: (input: TherapistInput, branchId: string) => Promise<TherapistWithBranch | void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<TherapistInput>(
    therapist
      ? {
          therapistType: therapist.therapistType,
          personName: therapist.personName,
          gender: therapist.gender ?? undefined,
          specialization: therapist.specialization ?? undefined,
          bio: therapist.bio ?? undefined,
          experienceYears: therapist.experienceYears ?? undefined,
        }
      : { ...EMPTY_INPUT },
  );
  const [branchId, setBranchId] = useState(therapist?.branchId ?? branches[0]?.id ?? '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Tracks the entity MediaUploader should upload against — see DealDialog's identical
  // `savedDeal` state for the full staged-upload-after-create rationale.
  const [savedTherapist, setSavedTherapist] = useState<TherapistWithBranch | undefined>(therapist);
  // A `submitting` state guard alone can't stop a second click that fires before React commits
  // the re-render disabling the button — this ref is checked/set synchronously, before any
  // `await`, so it blocks the second invocation even if both start in the same tick.
  const submittingRef = useRef(false);

  const set = <K extends keyof TherapistInput>(key: K, value: TherapistInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (submittingRef.current) return;
    if (!form.therapistType.trim() || !form.personName.trim() || !branchId) {
      setError('Type, name, and branch are required.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const result = await onSave(form, branchId);
      if (!therapist && result) {
        setSavedTherapist(result);
      } else {
        dialogRef.current?.close();
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{therapist ? 'Edit therapist' : 'Add therapist'}</div>
      <div slot="content" className="form-grid">
        <OutlinedTextField
          label="Therapist Type / Service Name"
          value={form.therapistType}
          onInput={(e: Event) => set('therapistType', (e.target as HTMLInputElement).value)}
        />
        <OutlinedTextField
          label="Person Name"
          value={form.personName}
          onInput={(e: Event) => set('personName', (e.target as HTMLInputElement).value)}
        />
        <OutlinedTextField
          label="Gender"
          value={form.gender ?? ''}
          onInput={(e: Event) => set('gender', (e.target as HTMLInputElement).value || undefined)}
        />

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

        <MediaUploader
          entityType="therapist"
          entityId={savedTherapist?.id ?? null}
          existingImages={savedTherapist?.mediaImages ?? []}
          existingVideo={savedTherapist?.mediaVideo ?? null}
          token={token}
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

const PACKAGE_EMPTY_INPUT: TherapistPackageInput = { durationMinutes: 30, sellingPrice: 0 };

/**
 * A therapist's own duration/price menu — entirely independent of any Deal (no Deal picker
 * anywhere in this flow; see TherapistPackage's schema doc comment in msd-api). Reuses the same
 * Dialog/data-table/form-grid patterns as `TherapistFormDialog` above, just for a nested
 * sub-resource instead of the therapist record itself.
 */
function TherapistPackagesDialog({
  dialogRef,
  therapist,
  onClose,
}: {
  dialogRef: RefObject<MdDialog>;
  therapist: TherapistWithBranch;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const [packages, setPackages] = useState<TherapistPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editingPackage, setEditingPackage] = useState<TherapistPackage | null>(null);
  const formDialogRef = useRef<MdDialog>(null);

  // This dialog only mounts once `managingTherapist` is set, one render after the row action
  // that triggers it — so the caller's synchronous `packagesDialogRef.current?.show()` fires on
  // a still-null ref (same race the pre-existing edit/add dialogs happen to dodge only because
  // theirs are already mounted, or the user's second click lands after mount). Showing on mount
  // here sidesteps that timing entirely.
  useEffect(() => {
    dialogRef.current?.show();
  }, [dialogRef]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await listTherapistPackages(token, therapist.id);
      setPackages(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load packages.');
    } finally {
      setLoading(false);
    }
  }, [token, therapist.id]);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditingPackage(null);
    formDialogRef.current?.show();
  };
  const openEdit = (pkg: TherapistPackage) => {
    setEditingPackage(pkg);
    formDialogRef.current?.show();
  };

  const save = async (input: TherapistPackageInput) => {
    if (editingPackage) {
      const { data } = await updateTherapistPackage(token, therapist.id, editingPackage.id, input);
      setPackages((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    } else {
      const { data } = await createTherapistPackage(token, therapist.id, input);
      setPackages((prev) => [...prev, data]);
    }
  };

  const remove = async (pkg: TherapistPackage) => {
    setError('');
    try {
      await deleteTherapistPackage(token, therapist.id, pkg.id);
      setPackages((prev) => prev.filter((p) => p.id !== pkg.id));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete this package.');
    }
  };

  return (
    <>
      <Dialog ref={dialogRef} onClose={onClose}>
        <div slot="headline">Packages — {therapist.therapistType} ({therapist.personName})</div>
        <div slot="content">
          <p className="field-hint">
            {therapist.personName}'s own duration/price menu — customers pick this therapist, then one
            of these durations, and always pay this price.
          </p>

          {error && <p className="error-state" role="alert">{error}</p>}

          {loading ? (
            <p className="loading-state">Loading packages…</p>
          ) : packages.length === 0 ? (
            <p className="empty-state">No packages yet — add one to let customers select {therapist.personName}.</p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Duration</th>
                    <th scope="col">Selling Price</th>
                    <th scope="col">Original Price</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((pkg) => (
                    <tr key={pkg.id}>
                      <td>{pkg.durationMinutes} min</td>
                      <td>{formatINR(Number(pkg.sellingPrice))}</td>
                      <td>{pkg.originalPrice != null ? formatINR(Number(pkg.originalPrice)) : '—'}</td>
                      <td>
                        <span className={`status-pill ${pkg.isActive ? 'status-pill--active' : 'status-pill--blocked'}`}>
                          {pkg.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="data-table__actions">
                        <TextButton onClick={() => openEdit(pkg)}>Edit</TextButton>
                        <TextButton onClick={() => remove(pkg)}>Delete</TextButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div slot="actions">
          <OutlinedButton onClick={openAdd}>
            <Icon slot="icon" aria-hidden="true">add</Icon>
            Add Package
          </OutlinedButton>
          <TextButton onClick={() => dialogRef.current?.close()}>Close</TextButton>
        </div>
      </Dialog>

      {!loading && (
        <PackageFormDialog
          key={editingPackage?.id ?? 'new'}
          dialogRef={formDialogRef}
          pkg={editingPackage}
          onSave={save}
        />
      )}
    </>
  );
}

function PackageFormDialog({
  dialogRef,
  pkg,
  onSave,
}: {
  dialogRef: RefObject<MdDialog>;
  pkg: TherapistPackage | null;
  onSave: (input: TherapistPackageInput) => Promise<void>;
}) {
  const [form, setForm] = useState<TherapistPackageInput>(
    pkg
      ? {
          durationMinutes: pkg.durationMinutes,
          sellingPrice: Number(pkg.sellingPrice),
          originalPrice: pkg.originalPrice != null ? Number(pkg.originalPrice) : undefined,
          isActive: pkg.isActive,
        }
      : { ...PACKAGE_EMPTY_INPUT },
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // See TherapistFormDialog's identical guard above for why a `submitting` state check alone
  // isn't sufficient against a second click landing before the disabling re-render commits.
  const submittingRef = useRef(false);

  const set = <K extends keyof TherapistPackageInput>(key: K, value: TherapistPackageInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (submittingRef.current) return;
    if (!form.durationMinutes || form.durationMinutes <= 0) {
      setError('Duration is required and must be positive.');
      return;
    }
    if (!form.sellingPrice || form.sellingPrice <= 0) {
      setError('Selling price is required and must be positive.');
      return;
    }
    if (form.originalPrice !== undefined && form.originalPrice < form.sellingPrice) {
      setError('Original price must be greater than or equal to selling price.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      await onSave(form);
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef}>
      <div slot="headline">{pkg ? 'Edit package' : 'Add package'}</div>
      <div slot="content" className="form-grid">
        <OutlinedTextField
          label="Duration (minutes)"
          type="number"
          value={form.durationMinutes ? String(form.durationMinutes) : ''}
          onInput={(e: Event) => set('durationMinutes', Number((e.target as HTMLInputElement).value) || 0)}
        />

        <OutlinedTextField
          label="Selling Price"
          type="number"
          value={form.sellingPrice ? String(form.sellingPrice) : ''}
          onInput={(e: Event) => set('sellingPrice', Number((e.target as HTMLInputElement).value) || 0)}
        />

        <OutlinedTextField
          label="Original Price (optional)"
          type="number"
          value={form.originalPrice !== undefined ? String(form.originalPrice) : ''}
          onInput={(e: Event) => set('originalPrice', Number((e.target as HTMLInputElement).value) || undefined)}
        />

        <OutlinedSelect
          label="Status"
          value={form.isActive === false ? 'inactive' : 'active'}
          onChange={(e: Event) => set('isActive', (e.target as HTMLSelectElement).value !== 'inactive')}
        >
          <SelectOption value="active"><div slot="headline">Active</div></SelectOption>
          <SelectOption value="inactive"><div slot="headline">Inactive</div></SelectOption>
        </OutlinedSelect>

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
