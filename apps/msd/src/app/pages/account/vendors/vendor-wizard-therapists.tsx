import { useEffect, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
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
import {
  createVendorTherapist,
  listVendorTherapistsForAdmin,
  setVendorTherapistStatus,
  updateVendorTherapist,
  type AdminTherapist,
  type Branch,
  type Category,
  type Therapist,
  type TherapistInput,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useToast } from '../../../../toast/toast-context';
import { MediaUploader } from '../../../components/media-uploader';

interface VendorTherapistsStepProps {
  token: string | null;
  vendorId: string;
  canEdit: boolean;
  offersTherapy: boolean;
  /** This vendor's branches (from Step 2) — a therapist is always staffed at one of them, same
   *  as the self-service Therapist form. */
  branches: Branch[];
  /** The vendor's granted THERAPY categories — restricts the Specialization picker, same as the
   *  self-service Therapist form (see `vendor-therapists.tsx`'s `TherapistFormDialog`). */
  categories: Category[];
  onTherapistsChange: (therapists: AdminTherapist[]) => void;
}

/**
 * Onboarding wizard Step 4 — Therapist CRUD, admin-on-behalf. msd-api has
 * `POST /vendors/:vendorId/branches/:branchId/therapists` and `PATCH
 * /vendors/:vendorId/therapists/:therapistId[/status]` (mirroring Branch/Deal/Product's existing
 * self-service + admin-on-behalf split — see `createVendorTherapist`/`updateVendorTherapist`/
 * `setVendorTherapistStatus` in `api/rbac/vendors.ts`). msd-api has since also grown
 * `POST/DELETE /vendors/:vendorId/therapists/:therapistId/images[...]` and `/video` (mirroring
 * Product's own admin-on-behalf media split — see `api/media.ts`'s `basePath`, whose `therapist`
 * case now has a `vendorId` branch the same way `product`'s does), so this step's own form wires
 * `MediaUploader` with a `vendorId` exactly like `VendorProductsStep`'s `ProductFormDialog`
 * — no more media-upload gap, and no duplicate upload system: the same shared `MediaUploader`
 * component every other entity type uses.
 */
export function VendorTherapistsStep({
  token,
  vendorId,
  canEdit,
  offersTherapy,
  branches,
  categories,
  onTherapistsChange,
}: VendorTherapistsStepProps) {
  const { showToast } = useToast();
  const [therapists, setTherapists] = useState<AdminTherapist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingTherapist, setEditingTherapist] = useState<AdminTherapist | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await listVendorTherapistsForAdmin(token, vendorId);
      setTherapists(data);
      onTherapistsChange(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load therapists.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, vendorId]);

  // Returns the saved row (like `VendorProductsStep`'s own `save`) so `WizardTherapistFormDialog`
  // can key its `MediaUploader` off a real id right after a fresh create — `load()` separately
  // refreshes the admin-shaped list (with `branch` nested in) that the list view and
  // `onTherapistsChange` consume.
  const save = async (input: TherapistInput, branchId: string, existing?: AdminTherapist) => {
    const { data } = existing
      ? await updateVendorTherapist(token, vendorId, existing.id, input)
      : await createVendorTherapist(token, vendorId, branchId, input);
    showToast(existing ? 'Therapist updated.' : 'Therapist added.');
    await load();
    return data;
  };

  const toggleStatus = async (therapist: AdminTherapist) => {
    setError('');
    try {
      await setVendorTherapistStatus(token, vendorId, therapist.id, !therapist.isActive);
      showToast(therapist.isActive ? 'Therapist deactivated.' : 'Therapist activated.');
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change status.');
    }
  };

  if (!offersTherapy) {
    return <p className="empty-state">This vendor has not enabled the Therapy business module in Step 2.</p>;
  }

  const canAdd = canEdit && branches.length > 0;

  return (
    <section aria-label="Therapy">
      <div className="page-head">
        <h3 className="section-title">Therapists</h3>
        {canAdd && (
          <OutlinedButton onClick={() => addDialogRef.current?.show()}>
            <Icon slot="icon" aria-hidden="true">add</Icon>
            Add therapist
          </OutlinedButton>
        )}
      </div>

      {error && <p className="error-state" role="alert">{error}</p>}
      {canEdit && branches.length === 0 && (
        <p className="empty-state">Add a branch in Step 2 before adding therapists.</p>
      )}

      {loading ? (
        <p className="loading-state">Loading therapists…</p>
      ) : therapists.length === 0 ? (
        <p className="empty-state">No therapists added yet.</p>
      ) : (
        <ul className="entity-list">
          {therapists.map((t) => (
            <li key={t.id}>
              <div className="entity-list__item">
                <span className="role-list__name">
                  {t.personName}
                  <span className="field-hint"> · {t.therapistType} · {t.branch.name}</span>
                </span>
                <span className={`status-pill ${t.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
                  {t.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {canEdit && (
                <div className="page-head__actions">
                  <OutlinedButton
                    onClick={() => {
                      setEditingTherapist(t);
                      editDialogRef.current?.show();
                    }}
                  >
                    <Icon slot="icon" aria-hidden="true">edit</Icon>
                    Edit
                  </OutlinedButton>
                  <OutlinedButton onClick={() => toggleStatus(t)}>
                    {t.isActive ? 'Deactivate' : 'Activate'}
                  </OutlinedButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <WizardTherapistFormDialog
          dialogRef={addDialogRef}
          vendorId={vendorId}
          token={token}
          branches={branches}
          specializationCategories={categories}
          onSave={(input, branchId) => save(input, branchId)}
        />
      )}
      {editingTherapist && (
        <WizardTherapistFormDialog
          key={editingTherapist.id}
          dialogRef={editDialogRef}
          vendorId={vendorId}
          token={token}
          branches={branches}
          specializationCategories={categories}
          therapist={editingTherapist}
          onSave={(input) => save(input, editingTherapist.branchId, editingTherapist)}
          onClose={() => setEditingTherapist(null)}
        />
      )}
    </section>
  );
}

const EMPTY_INPUT: TherapistInput = { therapistType: '', personName: '' };

function WizardTherapistFormDialog({
  dialogRef,
  vendorId,
  token,
  branches,
  specializationCategories,
  therapist,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog | null>;
  /** Admin-on-behalf — the vendor this therapist belongs to, passed to `MediaUploader` so its
   *  image/video requests hit `/vendors/:vendorId/therapists/:therapistId/...`, never the
   *  self-service `/vendors/me/...` routes (which would upload against the wrong vendor). */
  vendorId: string;
  token: string | null;
  branches: Branch[];
  /** The vendor's granted THERAPY categories — restricts the Specialization picker instead of a
   *  free-text field (see `Therapist.specializationCategoryId`'s own doc comment). */
  specializationCategories: Category[];
  therapist?: AdminTherapist;
  // Returns the saved row (like `ProductFormDialog`'s own `onSave`) so `savedTherapist` below can
  // pick up a real id right after a fresh create, for `MediaUploader` to upload against.
  onSave: (input: TherapistInput, branchId: string) => Promise<Therapist | void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<TherapistInput>(
    therapist
      ? {
          therapistType: therapist.therapistType,
          personName: therapist.personName,
          gender: therapist.gender ?? undefined,
          specialization: therapist.specialization ?? undefined,
          specializationCategoryId: therapist.specializationCategoryId ?? undefined,
          bio: therapist.bio ?? undefined,
          experienceYears: therapist.experienceYears ?? undefined,
        }
      : { ...EMPTY_INPUT },
  );
  const [branchId, setBranchId] = useState(therapist?.branchId ?? branches[0]?.id ?? '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Tracks the entity MediaUploader should upload against — see ProductFormDialog's identical
  // `savedProduct` state for the full staged-upload-after-create rationale.
  const [savedTherapist, setSavedTherapist] = useState<Therapist | undefined>(therapist);
  // Checked/set synchronously at the very top of submit(), before any await — a `submitting`
  // state guard alone can't stop a second click/tap/Enter that fires before React commits the
  // disabling re-render (same double-submit gap fixed elsewhere in this file family — see
  // vendor-branches.tsx's `DealDialog` and vendor-therapists.tsx's `TherapistFormDialog`).
  const submittingRef = useRef(false);
  // Belt-and-suspenders on top of submittingRef: disables the actual DOM element synchronously,
  // in the same tick as the click, rather than waiting on React's `disabled={submitting}`
  // re-render to commit.
  const saveButtonRef = useRef<MdFilledButton>(null);

  // `specializationCategories` here comes from the pipeline's vendorId-scoped `listCategories`
  // call, which is flat (top-level rows + their active children, per that function's own doc
  // comment) — the self-service form's equivalent list only ever contains top-level rows (a
  // `VendorCategoryAccess` grant is always on a top-level category), so filter down to match.
  const topLevelSpecializationCategories = specializationCategories.filter((c) => !c.parentId);

  const set = <K extends keyof TherapistInput>(key: K, value: TherapistInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (submittingRef.current) return;
    if (!form.therapistType.trim() || !form.personName.trim() || !branchId) {
      setError('Type, name, and branch are required.');
      return;
    }
    submittingRef.current = true;
    if (saveButtonRef.current) saveButtonRef.current.disabled = true;
    setSubmitting(true);
    setError('');
    try {
      const result = await onSave(form, branchId);
      if (!therapist && result) {
        // A fresh create — keep the dialog open so MediaUploader can flush any staged photos/
        // video against the new id; an edit's dialog closes immediately as before, since
        // MediaUploader already had a real entityId the whole time (nothing was staged).
        setSavedTherapist(result);
      } else {
        dialogRef.current?.close();
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save therapist.');
    } finally {
      submittingRef.current = false;
      if (saveButtonRef.current) saveButtonRef.current.disabled = false;
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
          <p className="field-hint">Branch: {therapist.branch.name} (cannot be changed)</p>
        ) : (
          <OutlinedSelect label="Branch" value={branchId} onChange={(e: Event) => setBranchId((e.target as HTMLSelectElement).value)}>
            {branches.map((b) => (
              <SelectOption key={b.id} value={b.id}>
                <div slot="headline">{b.name}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>
        )}

        {topLevelSpecializationCategories.length > 0 ? (
          <OutlinedSelect
            label="Specialization"
            value={form.specializationCategoryId ?? ''}
            onChange={(e: Event) => set('specializationCategoryId', (e.target as HTMLSelectElement).value || undefined)}
          >
            <SelectOption value="">
              <div slot="headline">None</div>
            </SelectOption>
            {topLevelSpecializationCategories.map((c) => (
              <SelectOption key={c.id} value={c.id}>
                <div slot="headline">{c.name}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>
        ) : (
          <p className="empty-state">
            No Therapy categories have been granted to this business yet — grant one in Step 2 before adding therapists.
          </p>
        )}
        {therapist?.specialization && (
          <p className="field-hint">Previously recorded specialization (historical, read-only): {therapist.specialization}</p>
        )}

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
          vendorId={vendorId}
          existingImages={savedTherapist?.mediaImages ?? []}
          existingVideo={savedTherapist?.mediaVideo ?? null}
          token={token}
        />

        {error && <p className="error-state" role="alert">{error}</p>}
      </div>
      <div slot="actions">
        <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
        <FilledButton ref={saveButtonRef} onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</FilledButton>
      </div>
    </Dialog>
  );
}

export default VendorTherapistsStep;
