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
  getBranchCategoryAccess,
  listVendorTherapistsForAdmin,
  setVendorTherapistStatus,
  updateVendorTherapist,
  type AdminTherapist,
  type Branch,
  type BranchCategoryAccessRow,
  type Category,
  type Therapist,
  type TherapistInput,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useToast } from '../../../../toast/toast-context';
import { MediaUploader } from '../../../components/media-uploader';
import { extractFieldErrors } from '../../../../utils/field-errors';

type TherapistFieldKey = 'therapistType' | 'personName' | 'gender' | 'specializationCategoryId' | 'bio' | 'experienceYears';

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
  const [therapyBranches, setTherapyBranches] = useState<Branch[]>([]);
  const [therapyBranchesLoading, setTherapyBranchesLoading] = useState(true);
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


  useEffect(() => {
    let cancelled = false;

    const loadTherapyBranches = async () => {
      if (!branches.length || !offersTherapy) {
        setTherapyBranches([]);
        setTherapyBranchesLoading(false);
        return;
      }

      setTherapyBranchesLoading(true);

      try {
        const results = await Promise.all(
          branches.map(async (branch) => {
            const { data } = await getBranchCategoryAccess(
              token,
              vendorId,
              branch.id,
            );

            const hasTherapyCategory = data.some(
              (row) => row.category?.type === 'THERAPY',
            );

            return {
              branch,
              hasTherapyCategory,
            };
          }),
        );

        if (cancelled) return;

        setTherapyBranches(
          results
            .filter((result) => result.hasTherapyCategory)
            .map((result) => result.branch),
        );
      } catch {
        if (cancelled) return;

        setTherapyBranches([]);
      } finally {
        if (!cancelled) {
          setTherapyBranchesLoading(false);
        }
      }
    };

    loadTherapyBranches();

    return () => {
      cancelled = true;
    };
  }, [token, vendorId, branches, offersTherapy]);


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

  // Only a branch with at least one currently-granted THERAPY category (`categoryTypes`, computed
  // server-side in the same query as the branch list — see msd-api's `listBranches`) is eligible
  // to host a therapist. Revoking a branch's Therapy access in Step 2 removes it from here
  // immediately (this list is always the live `branches` prop, never cached) and after a refresh
  // (the server recomputes `categoryTypes` from the live `BranchCategoryAccess` rows every time).
  const therapyBranches = branches.filter((b) => b.categoryTypes.includes('THERAPY'));

  // `vendor.offersTherapy` is a denormalized convenience flag, not the ground truth — real
  // category grants (`VendorCategoryAccess`/`BranchCategoryAccess`) are. It can be `false` while
  // a branch already genuinely holds THERAPY access (e.g. data mapped outside the normal
  // grant-flips-the-flag save path, such as seeded/imported branches), which used to hard-block
  // this whole step with a misleading "not enabled" message despite valid access existing —
  // this was the exact root cause of that bug. Any real THERAPY branch access is sufficient to
  // proceed, regardless of what the flag currently says.
  if (!offersTherapy && therapyBranches.length === 0) {
    return <p className="empty-state">This vendor has not enabled the Therapy business module in Step 2.</p>;
  }

  const canAdd =
    canEdit &&
    !therapyBranchesLoading &&
    therapyBranches.length > 0;

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
      {canEdit && branches.length > 0 && therapyBranches.length === 0 && (
        <p className="empty-state">No branch currently has Therapy category access — map one under Business Modules &amp; Category Access first.</p>
      )}

      {canEdit &&
        branches.length > 0 &&
        !therapyBranchesLoading &&
        therapyBranches.length === 0 && (
          <p className="empty-state">
            Enable Therapy for at least one branch in Step 2 before adding
            therapists.
          </p>
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
          branches={therapyBranches}
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
        bio: therapist.bio ?? undefined,
        experienceYears: therapist.experienceYears ?? undefined,
      }
      : { ...EMPTY_INPUT },
  );
  const [branchId, setBranchId] = useState(therapist?.branchId ?? branches[0]?.id ?? '');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<TherapistFieldKey, string>> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Two-tier Category → Subcategory UI state, mirroring DealDialog's cascade — the backend still
  // only stores one `specializationCategoryId` field (see `TherapistInput`), so this is UI-only
  // state; `specSubcategoryId || specCategoryId` is computed into that single field at submit
  // time (see `submit()` below).
  const [specCategoryId, setSpecCategoryId] = useState('');
  const [specSubcategoryId, setSpecSubcategoryId] = useState<string | undefined>(undefined);
  // The therapist's pre-existing single id, resolved into the two-tier UI state once this
  // branch's mapping has loaded (see the resolution effect below) — captured once so a later
  // `branchCategoryAccess` refetch (there shouldn't be one in edit mode, branch is fixed) never
  // re-triggers the resolution and stomps on an in-progress edit.
  const initialSpecializationCategoryId = useRef(therapist?.specializationCategoryId ?? undefined).current;
  const hasResolvedInitialSpecialization = useRef(false);

  const [branchCategoryAccess, setBranchCategoryAccess] = useState<BranchCategoryAccessRow[]>([]);
  // Starts `true` for the same reason as DealDialog's own flag — avoids a one-frame "stale"
  // flash for an edit's existing specialization before the fetch below has run.
  const [branchCategoryAccessLoading, setBranchCategoryAccessLoading] = useState(true);
  const [branchCategoryAccessError, setBranchCategoryAccessError] = useState('');

  useEffect(() => {
    if (!branchId) {
      setBranchCategoryAccess([]);
      setBranchCategoryAccessError('');
      setBranchCategoryAccessLoading(false);
      return;
    }
    let cancelled = false;
    setBranchCategoryAccessLoading(true);
    setBranchCategoryAccessError('');
    getBranchCategoryAccess(token, vendorId, branchId)
      .then(({ data }) => {
        if (cancelled) return;
        setBranchCategoryAccess(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setBranchCategoryAccess([]);
        setBranchCategoryAccessError(err instanceof ApiRequestError ? err.message : "Could not load this branch's category access.");
      })
      .finally(() => {
        if (!cancelled) setBranchCategoryAccessLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, vendorId, branchId]);

  // Resolves the therapist's existing single `specializationCategoryId` back into the two-tier
  // UI state once the branch's mapping has loaded: a match among the mapped top-level categories
  // sets just `specCategoryId`; a match among one of those categories' subcategories sets both;
  // no match at all (branch remapped since this therapist was staffed) leaves it to be picked up
  // as a stale top-level value below, same "don't silently overwrite" contract as DealDialog.
  useEffect(() => {
    if (hasResolvedInitialSpecialization.current || branchCategoryAccessLoading) return;
    if (!initialSpecializationCategoryId) {
      hasResolvedInitialSpecialization.current = true;
      return;
    }
    const asCategory = branchCategoryAccess.find((row) => row.categoryId === initialSpecializationCategoryId);
    if (asCategory) {
      setSpecCategoryId(initialSpecializationCategoryId);
      setSpecSubcategoryId(undefined);
      hasResolvedInitialSpecialization.current = true;
      return;
    }
    const parentRow = branchCategoryAccess.find((row) =>
      row.subcategories.some((s) => s.subcategoryId === initialSpecializationCategoryId),
    );
    if (parentRow) {
      setSpecCategoryId(parentRow.categoryId);
      setSpecSubcategoryId(initialSpecializationCategoryId);
    } else {
      // Not found under this branch's current mapping at all, at either tier — surface it as a
      // stale top-level pick (its original tier is unrecoverable) via `specCategoryStale` below.
      setSpecCategoryId(initialSpecializationCategoryId);
      setSpecSubcategoryId(undefined);
    }
    hasResolvedInitialSpecialization.current = true;
  }, [branchCategoryAccessLoading, branchCategoryAccess, initialSpecializationCategoryId]);

  const matchedSpecRow = branchCategoryAccess.find((row) => row.categoryId === specCategoryId);
  const specSubcategoryOptions = matchedSpecRow?.subcategories.map((s) => s.subcategory) ?? [];
  const branchCategoryAccessReady = !branchCategoryAccessLoading && !branchCategoryAccessError;
  const specCategoryStale = branchCategoryAccessReady && Boolean(specCategoryId) && !matchedSpecRow;
  const specSubcategoryStale =
    branchCategoryAccessReady &&
    !specCategoryStale &&
    Boolean(specSubcategoryId) &&
    !specSubcategoryOptions.some((c) => c.id === specSubcategoryId);
  // `specializationCategories` (the vendor-wide grant list) is the only place left with a name
  // for a stale id — `getBranchCategoryAccess`'s rows obviously don't include it any more.
  const staleSpecCategoryName = specializationCategories.find((c) => c.id === specCategoryId)?.name ?? 'Unknown specialization';
  const staleSpecSubcategoryName = specializationCategories.find((c) => c.id === specSubcategoryId)?.name ?? 'Unknown specialization';
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
    setFieldErrors(null);
    try {
      // Only one field is actually submitted (`specializationCategoryId`) — the two-tier
      // Category/Subcategory UI is purely local; whichever tier the admin picked last wins,
      // subcategory taking precedence when both are set.
      const payload: TherapistInput = { ...form, specializationCategoryId: specSubcategoryId || specCategoryId || undefined };
      const result = await onSave(payload, branchId);
      if (!therapist && result) {
        // A fresh create — keep the dialog open so MediaUploader can flush any staged photos/
        // video against the new id; an edit's dialog closes immediately as before, since
        // MediaUploader already had a real entityId the whole time (nothing was staged).
        setSavedTherapist(result);
      } else {
        dialogRef.current?.close();
      }
    } catch (err) {
      const fields = extractFieldErrors<TherapistFieldKey>(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not save therapist.');
      }
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
          required
          value={form.therapistType}
          onInput={(e: Event) => set('therapistType', (e.target as HTMLInputElement).value)}
          error={Boolean(fieldErrors?.therapistType)}
        />
        {fieldErrors?.therapistType && <p className="error-state" role="alert">{fieldErrors.therapistType}</p>}
        <OutlinedTextField
          label="Person Name"
          required
          value={form.personName}
          onInput={(e: Event) => set('personName', (e.target as HTMLInputElement).value)}
          error={Boolean(fieldErrors?.personName)}
        />
        {fieldErrors?.personName && <p className="error-state" role="alert">{fieldErrors.personName}</p>}
        <OutlinedTextField
          label="Gender"
          value={form.gender ?? ''}
          onInput={(e: Event) => set('gender', (e.target as HTMLInputElement).value || undefined)}
          error={Boolean(fieldErrors?.gender)}
        />
        {fieldErrors?.gender && <p className="error-state" role="alert">{fieldErrors.gender}</p>}

        {therapist ? (
          <p className="field-hint">Branch: {therapist.branch.name} (cannot be changed)</p>
        ) : (
          <OutlinedSelect
            label="Branch"
            value={branchId}
            onChange={(e: Event) => {
              const value = (e.target as HTMLSelectElement).value;
              // Same reset-in-same-update idiom as DealDialog's Branch select and BranchDialog's
              // State→City cascade — a specialization picked for the previous branch isn't
              // necessarily even offered under a newly-picked branch's own mapping.
              setBranchId(value);
              setSpecCategoryId('');
              setSpecSubcategoryId(undefined);
            }}
          >
            {branches.map((b) => (
              <SelectOption key={b.id} value={b.id}>
                <div slot="headline">{b.name}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>
        )}

        {branchCategoryAccess.length > 0 || specCategoryStale || branchCategoryAccessLoading ? (
          <>
            <OutlinedSelect
              label="Specialization Category"
              value={specCategoryId}
              disabled={branchCategoryAccessLoading}
              onChange={(e: Event) => {
                const value = (e.target as HTMLSelectElement).value;
                setSpecCategoryId(value);
                setSpecSubcategoryId(undefined);
              }}
            >
              <SelectOption value="">
                <div slot="headline">{branchCategoryAccessLoading ? 'Loading…' : 'None'}</div>
              </SelectOption>
              {specCategoryStale && (
                <SelectOption value={specCategoryId}>
                  <div slot="headline">{staleSpecCategoryName}</div>
                </SelectOption>
              )}
              {branchCategoryAccess.map((row) => (
                <SelectOption key={row.categoryId} value={row.categoryId}>
                  <div slot="headline">{row.category.name}</div>
                </SelectOption>
              ))}
            </OutlinedSelect>

            {(specSubcategoryOptions.length > 0 || specSubcategoryStale) && (
              <OutlinedSelect
                label="Specialization Subcategory (optional)"
                value={specSubcategoryId ?? ''}
                disabled={branchCategoryAccessLoading}
                onChange={(e: Event) => setSpecSubcategoryId((e.target as HTMLSelectElement).value || undefined)}
              >
                <SelectOption value="">
                  <div slot="headline">None</div>
                </SelectOption>
                {specSubcategoryStale && (
                  <SelectOption value={specSubcategoryId ?? ''}>
                    <div slot="headline">{staleSpecSubcategoryName}</div>
                  </SelectOption>
                )}
                {specSubcategoryOptions.map((c) => (
                  <SelectOption key={c.id} value={c.id}>
                    <div slot="headline">{c.name}</div>
                  </SelectOption>
                ))}
              </OutlinedSelect>
            )}

            {specCategoryStale && (
              <p className="error-state" role="alert">
                This specialization is no longer mapped to this branch. Saving without changing it keeps the existing value — or pick a currently mapped option.
              </p>
            )}
            {specSubcategoryStale && (
              <p className="error-state" role="alert">
                This specialization subcategory is no longer mapped to this branch/category. Saving without changing it keeps the existing value — or pick a currently mapped option.
              </p>
            )}
            {branchCategoryAccessError && <p className="error-state" role="alert">{branchCategoryAccessError}</p>}
          </>
        ) : (
          <p className="empty-state">
            No Therapy categories are mapped to this branch yet — map one under Business Modules &amp; Category Access first.
          </p>
        )}
        {therapist?.specialization && (
          <p className="field-hint">Previously recorded specialization (historical, read-only): {therapist.specialization}</p>
        )}

        <OutlinedTextField
          label="Bio"
          value={form.bio ?? ''}
          onInput={(e: Event) => set('bio', (e.target as HTMLInputElement).value || undefined)}
          error={Boolean(fieldErrors?.bio)}
        />
        {fieldErrors?.bio && <p className="error-state" role="alert">{fieldErrors.bio}</p>}

        <OutlinedTextField
          label="Experience (years)"
          type="number"
          value={form.experienceYears !== undefined ? String(form.experienceYears) : ''}
          onInput={(e: Event) => set('experienceYears', Number((e.target as HTMLInputElement).value) || undefined)}
          error={Boolean(fieldErrors?.experienceYears)}
        />
        {fieldErrors?.experienceYears && <p className="error-state" role="alert">{fieldErrors.experienceYears}</p>}

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
