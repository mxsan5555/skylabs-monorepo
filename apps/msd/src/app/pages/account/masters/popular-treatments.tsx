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
  Tabs,
  PrimaryTab,
} from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  listPopularTreatmentGroups,
  listAllPopularTreatmentGroups,
  createPopularTreatmentGroup,
  updatePopularTreatmentGroup,
  setPopularTreatmentGroupStatus,
  deletePopularTreatmentGroup,
  listPopularTreatments,
  createPopularTreatment,
  updatePopularTreatment,
  setPopularTreatmentStatus,
  deletePopularTreatment,
  type PopularTreatmentGroup,
  type PopularTreatmentGroupInput,
  type PopularTreatment,
  type PopularTreatmentInput,
} from '../../../../api/rbac/popular-treatments';
import { listCategories, type Category } from '../../../../api/rbac/categories';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useConfirmDialog } from '../../../components/confirm-dialog';
import { extractFieldErrors } from '../../../../utils/field-errors';

type GroupFieldKey = 'name' | 'slug' | 'sortOrder';
type TreatmentFieldKey = 'name' | 'slug' | 'groupId' | 'categoryId' | 'subcategoryId' | 'sortOrder';

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

const GROUP_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Slug', label: 'Slug' },
  { key: 'Treatments', label: 'Treatments' },
  { key: 'Order', label: 'Order' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);

function toGroupRow(group: PopularTreatmentGroup): Record<string, string | number> {
  return {
    Name: group.name,
    Slug: group.slug,
    Treatments: group._count?.treatments ?? 0,
    Order: group.sortOrder,
    Status: group.isActive ? 'Active' : 'Inactive',
  };
}

const TREATMENT_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Group', label: 'Group' },
  { key: 'Category', label: 'Category' },
  { key: 'Order', label: 'Order' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);

function toTreatmentRow(treatment: PopularTreatment): Record<string, string | number> {
  return {
    Name: treatment.name,
    Group: treatment.group.name,
    Category: [treatment.category?.name, treatment.subcategory?.name].filter(Boolean).join(' › ') || '—',
    Order: treatment.sortOrder,
    Status: treatment.isActive ? 'Active' : 'Inactive',
  };
}

/**
 * Master → Popular Treatments — the public home page's Treatment directory (a Group like
 * "Massage" holding chips like "Swedish Massage"). Mirrors `popular-tags.tsx`'s exact
 * `<sky-data-table>` + Add/Edit dialog + status-toggle pattern, split into two sub-tables (Groups,
 * Treatments) under one `Tabs` switcher — same shape as `popular-tags.tsx`'s own `MappingDialog`
 * Tabs, just at the page level instead of inside a dialog. Gated on the single
 * `masters.popular-treatments` permission the "Popular Treatments" sidebar item seeds/grants (see
 * seed.ts's `EXTRA_ACTIONS_BY_MENU_KEY`) — every action below checks it, never a role name.
 * Deactivating a group or treatment only ever flips `isActive`; it never touches any Deal/
 * Product/Therapist row (a treatment has no direct link to one — see `PopularTreatment`'s schema
 * doc comment) — reactivating instantly restores public visibility with no other side effect.
 */
export function PopularTreatmentManagement() {
  const { token, can } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const canCreate = can('masters.popular-treatments', 'create');
  const canEdit = can('masters.popular-treatments', 'edit');
  const canDelete = can('masters.popular-treatments', 'delete');

  const [activeTab, setActiveTab] = useState<'groups' | 'treatments'>('groups');

  // ── Groups ──────────────────────────────────────────────────────────────
  const [groups, setGroups] = useState<PopularTreatmentGroup[]>([]);
  const [groupsTotal, setGroupsTotal] = useState(0);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsParams, setGroupsParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [groupsError, setGroupsError] = useState('');
  const [message, setMessage] = useState('');
  const [editingGroup, setEditingGroup] = useState<PopularTreatmentGroup | null>(null);
  const addGroupDialogRef = useRef<MdDialog>(null);
  const editGroupDialogRef = useRef<MdDialog>(null);
  const groupsTableRef = useRef<HTMLElement>(null);

  // Unfiltered group list (active + inactive) — feeds the Treatment form's Group picker so
  // editing a treatment under an inactive group still shows/keeps that group selected.
  const [allGroups, setAllGroups] = useState<PopularTreatmentGroup[]>([]);
  const loadAllGroups = useCallback(async () => {
    try {
      const { data } = await listAllPopularTreatmentGroups(token);
      setAllGroups(data);
    } catch {
      setAllGroups([]);
    }
  }, [token]);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    setGroupsError('');
    try {
      const { data, meta } = await listPopularTreatmentGroups(token, {
        page: groupsParams.page,
        pageSize: groupsParams.pageSize,
        search: groupsParams.search || undefined,
      });
      setGroups(data);
      setGroupsTotal(meta?.total ?? data.length);
    } catch (err) {
      setGroupsError(err instanceof ApiRequestError ? err.message : 'Could not load groups.');
    } finally {
      setGroupsLoading(false);
    }
  }, [token, groupsParams]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);
  useEffect(() => {
    loadAllGroups();
  }, [loadAllGroups]);

  const saveGroup = async (input: PopularTreatmentGroupInput, existing?: PopularTreatmentGroup) => {
    if (existing) {
      const { data } = await updatePopularTreatmentGroup(token, existing.id, input);
      setGroups((prev) => prev.map((g) => (g.id === data.id ? { ...g, ...data } : g)));
      setMessage('Saved.');
      await loadAllGroups();
      return data;
    }
    const { data } = await createPopularTreatmentGroup(token, input);
    await loadGroups();
    await loadAllGroups();
    setMessage('Saved.');
    return data;
  };

  const toggleGroupStatus = async (group: PopularTreatmentGroup) => {
    setGroupsError('');
    try {
      const { data } = await setPopularTreatmentGroupStatus(token, group.id, !group.isActive);
      setGroups((prev) => prev.map((g) => (g.id === data.id ? { ...g, ...data } : g)));
      await loadAllGroups();
    } catch (err) {
      setGroupsError(err instanceof ApiRequestError ? err.message : 'Could not change status.');
    }
  };

  const removeGroup = async (group: PopularTreatmentGroup) => {
    if (!(await confirm(`Delete "${group.name}"? This cannot be undone.`))) return;
    setGroupsError('');
    try {
      await deletePopularTreatmentGroup(token, group.id);
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
      setGroupsTotal((t) => t - 1);
      await loadAllGroups();
    } catch (err) {
      setGroupsError(err instanceof ApiRequestError ? err.message : 'Could not delete — it may still have treatments.');
    }
  };

  const groupRows = useMemo(() => JSON.stringify(groups.map(toGroupRow)), [groups]);
  const groupActions = useMemo(
    () =>
      JSON.stringify([
        ...(canEdit ? [{ icon: 'edit', label: 'Edit', event: 'edit' }] : []),
        ...(canEdit ? [{ icon: 'toggle_on', label: 'Activate / Deactivate', event: 'toggle-status' }] : []),
        ...(canDelete ? [{ icon: 'delete', label: 'Delete', event: 'delete', variant: 'danger' }] : []),
      ]),
    [canEdit, canDelete],
  );

  useEffect(() => {
    const el = groupsTableRef.current;
    if (!el) return;
    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setGroupsParams({ page: detail.page, pageSize: detail.pageSize, search: detail.search });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; rowIndex: number }>).detail;
      const group = groups[detail.rowIndex];
      if (!group) return;
      if (detail.action === 'edit') {
        setEditingGroup(group);
        editGroupDialogRef.current?.show();
      } else if (detail.action === 'toggle-status') {
        toggleGroupStatus(group);
      } else if (detail.action === 'delete') {
        removeGroup(group);
      }
    };
    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // `activeTab` is a dependency (not just `groups`) because this table only exists in the
    // DOM while its tab is active — `groups` can finish loading before the user ever switches
    // to this tab, in which case `groupsTableRef.current` was still null when this effect last
    // ran and the listener never got attached. Re-running on tab switch re-attempts it once
    // the element has actually mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, activeTab]);

  // ── Treatments ──────────────────────────────────────────────────────────
  const [treatments, setTreatments] = useState<PopularTreatment[]>([]);
  const [treatmentsTotal, setTreatmentsTotal] = useState(0);
  const [treatmentsLoading, setTreatmentsLoading] = useState(true);
  const [treatmentsParams, setTreatmentsParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [treatmentsError, setTreatmentsError] = useState('');
  const [editingTreatment, setEditingTreatment] = useState<PopularTreatment | null>(null);
  const addTreatmentDialogRef = useRef<MdDialog>(null);
  const editTreatmentDialogRef = useRef<MdDialog>(null);
  const treatmentsTableRef = useRef<HTMLElement>(null);

  const [topCategories, setTopCategories] = useState<Category[]>([]);
  useEffect(() => {
    listCategories(token, { scope: 'top', pageSize: 100 })
      .then(({ data }) => setTopCategories(data))
      .catch(() => setTopCategories([]));
  }, [token]);

  const loadTreatments = useCallback(async () => {
    setTreatmentsLoading(true);
    setTreatmentsError('');
    try {
      const { data, meta } = await listPopularTreatments(token, {
        page: treatmentsParams.page,
        pageSize: treatmentsParams.pageSize,
        search: treatmentsParams.search || undefined,
      });
      setTreatments(data);
      setTreatmentsTotal(meta?.total ?? data.length);
    } catch (err) {
      setTreatmentsError(err instanceof ApiRequestError ? err.message : 'Could not load treatments.');
    } finally {
      setTreatmentsLoading(false);
    }
  }, [token, treatmentsParams]);

  useEffect(() => {
    loadTreatments();
  }, [loadTreatments]);

  const saveTreatment = async (input: PopularTreatmentInput, existing?: PopularTreatment) => {
    if (existing) {
      const { data } = await updatePopularTreatment(token, existing.id, input);
      setTreatments((prev) => prev.map((t) => (t.id === data.id ? data : t)));
      setMessage('Saved.');
      await loadGroups();
      return data;
    }
    const { data } = await createPopularTreatment(token, input);
    await loadTreatments();
    await loadGroups();
    setMessage('Saved.');
    return data;
  };

  const toggleTreatmentStatus = async (treatment: PopularTreatment) => {
    setTreatmentsError('');
    try {
      const { data } = await setPopularTreatmentStatus(token, treatment.id, !treatment.isActive);
      setTreatments((prev) => prev.map((t) => (t.id === data.id ? data : t)));
    } catch (err) {
      setTreatmentsError(err instanceof ApiRequestError ? err.message : 'Could not change status.');
    }
  };

  const removeTreatment = async (treatment: PopularTreatment) => {
    if (!(await confirm(`Delete "${treatment.name}"? This cannot be undone.`))) return;
    setTreatmentsError('');
    try {
      await deletePopularTreatment(token, treatment.id);
      setTreatments((prev) => prev.filter((t) => t.id !== treatment.id));
      setTreatmentsTotal((t) => t - 1);
      await loadGroups();
    } catch (err) {
      setTreatmentsError(err instanceof ApiRequestError ? err.message : 'Could not delete treatment.');
    }
  };

  const treatmentRows = useMemo(() => JSON.stringify(treatments.map(toTreatmentRow)), [treatments]);
  const treatmentActions = useMemo(
    () =>
      JSON.stringify([
        ...(canEdit ? [{ icon: 'edit', label: 'Edit', event: 'edit' }] : []),
        ...(canEdit ? [{ icon: 'toggle_on', label: 'Activate / Deactivate', event: 'toggle-status' }] : []),
        ...(canDelete ? [{ icon: 'delete', label: 'Delete', event: 'delete', variant: 'danger' }] : []),
      ]),
    [canEdit, canDelete],
  );

  useEffect(() => {
    const el = treatmentsTableRef.current;
    if (!el) return;
    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setTreatmentsParams({ page: detail.page, pageSize: detail.pageSize, search: detail.search });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; rowIndex: number }>).detail;
      const treatment = treatments[detail.rowIndex];
      if (!treatment) return;
      if (detail.action === 'edit') {
        setEditingTreatment(treatment);
        editTreatmentDialogRef.current?.show();
      } else if (detail.action === 'toggle-status') {
        toggleTreatmentStatus(treatment);
      } else if (detail.action === 'delete') {
        removeTreatment(treatment);
      }
    };
    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // `activeTab` is a dependency for the same reason as the groups table effect above:
    // `treatments` loads unconditionally on mount, before the user has necessarily switched
    // to this tab, so `treatmentsTableRef.current` can still be null the only time this
    // effect would otherwise run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treatments, activeTab]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Popular Treatments · MSD</title>
      <header className="page-head">
        <div>
          <h1>Popular Treatments</h1>
          <p>The home page's Treatment directory — groups (e.g. Massage) and their chips (e.g. Swedish Massage), each linking to a live search.</p>
        </div>
        <div className="page-head__actions">
          {activeTab === 'groups' && canCreate && (
            <OutlinedButton onClick={() => addGroupDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add group
            </OutlinedButton>
          )}
          {activeTab === 'treatments' && canCreate && (
            <OutlinedButton onClick={() => addTreatmentDialogRef.current?.show()} disabled={allGroups.length === 0}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add treatment
            </OutlinedButton>
          )}
        </div>
      </header>

      {message && <p className="field-hint" role="status">{message}</p>}

      <div className="admin-tabs-wrap">
        <Tabs className="admin-tabs" onChange={(e) => setActiveTab((e.target as unknown as { activeTabIndex: number }).activeTabIndex === 0 ? 'groups' : 'treatments')}>
          <PrimaryTab active={activeTab === 'groups'}>Groups</PrimaryTab>
          <PrimaryTab active={activeTab === 'treatments'}>Treatments</PrimaryTab>
        </Tabs>
      </div>

      {activeTab === 'groups' && (
        <>
          {groupsError && <p className="error-state" role="alert">{groupsError}</p>}
          <sky-data-table
            ref={groupsTableRef as RefObject<HTMLElement>}
            caption="Popular Treatment Groups"
            columns={GROUP_COLUMNS}
            rows={groupRows}
            total={groupsTotal}
            page={groupsParams.page}
            page-size={groupsParams.pageSize}
            loading={groupsLoading}
            searchable
            search-placeholder="Search by name or slug…"
            actions={groupActions}
          />
        </>
      )}

      {activeTab === 'treatments' && (
        <>
          {treatmentsError && <p className="error-state" role="alert">{treatmentsError}</p>}
          {allGroups.length === 0 && !groupsLoading && (
            <p className="empty-state">Add a group first before adding treatments.</p>
          )}
          <sky-data-table
            ref={treatmentsTableRef as RefObject<HTMLElement>}
            caption="Popular Treatments"
            columns={TREATMENT_COLUMNS}
            rows={treatmentRows}
            total={treatmentsTotal}
            page={treatmentsParams.page}
            page-size={treatmentsParams.pageSize}
            loading={treatmentsLoading}
            searchable
            search-placeholder="Search by name…"
            actions={treatmentActions}
          />
        </>
      )}

      {canCreate && <GroupFormDialog dialogRef={addGroupDialogRef} onSave={(input) => saveGroup(input)} />}
      {canEdit && (
        <GroupFormDialog
          dialogRef={editGroupDialogRef}
          group={editingGroup ?? undefined}
          onSave={(input) => saveGroup(input, editingGroup ?? undefined)}
          onClose={() => setEditingGroup(null)}
        />
      )}

      {canCreate && allGroups.length > 0 && (
        <TreatmentFormDialog
          dialogRef={addTreatmentDialogRef}
          groups={allGroups}
          categories={topCategories}
          token={token}
          onSave={(input) => saveTreatment(input)}
        />
      )}
      {canEdit && (
        <TreatmentFormDialog
          dialogRef={editTreatmentDialogRef}
          groups={allGroups}
          categories={topCategories}
          token={token}
          treatment={editingTreatment ?? undefined}
          onSave={(input) => saveTreatment(input, editingTreatment ?? undefined)}
          onClose={() => setEditingTreatment(null)}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}

function GroupFormDialog({
  dialogRef,
  group,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog>;
  group?: PopularTreatmentGroup;
  onSave: (input: PopularTreatmentGroupInput) => Promise<PopularTreatmentGroup | void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<PopularTreatmentGroupInput>({
    name: group?.name ?? '',
    slug: group?.slug ?? '',
    sortOrder: group?.sortOrder ?? 0,
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<GroupFieldKey, string>> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Dialog is a single long-lived instance (never remounted via `key`) so imperative
  // `dialogRef.current?.show()` calls always act on the same, already-open node instead of
  // racing a key-triggered remount that would replace it with a fresh closed one right after
  // `show()` fires. Re-sync the form here whenever a different row is opened for editing.
  useEffect(() => {
    setForm({
      name: group?.name ?? '',
      slug: group?.slug ?? '',
      sortOrder: group?.sortOrder ?? 0,
    });
    setError('');
    setFieldErrors(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id]);

  const submit = async () => {
    if (submittingRef.current) return;
    if (!form.name.trim() || !form.slug.trim()) {
      setError('Name and slug are required.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    setFieldErrors(null);
    try {
      await onSave(form);
      dialogRef.current?.close();
    } catch (err) {
      const fields = extractFieldErrors<GroupFieldKey>(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not save.');
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{group ? 'Edit group' : 'Add group'}</div>
      <div slot="content" className="form-grid">
        <OutlinedTextField
          label="Name"
          required
          value={form.name}
          onInput={(e: Event) => setForm((f) => ({ ...f, name: (e.target as HTMLInputElement).value }))}
          error={Boolean(fieldErrors?.name)}
        />
        {fieldErrors?.name && <p className="error-state" role="alert">{fieldErrors.name}</p>}
        <OutlinedTextField
          label="Slug"
          required
          value={form.slug}
          onInput={(e: Event) => setForm((f) => ({ ...f, slug: (e.target as HTMLInputElement).value }))}
          error={Boolean(fieldErrors?.slug)}
        />
        {fieldErrors?.slug && <p className="error-state" role="alert">{fieldErrors.slug}</p>}
        <OutlinedTextField
          label="Display order"
          type="number"
          value={String(form.sortOrder ?? 0)}
          onInput={(e: Event) => setForm((f) => ({ ...f, sortOrder: Number((e.target as HTMLInputElement).value) || 0 }))}
          error={Boolean(fieldErrors?.sortOrder)}
        />
        {fieldErrors?.sortOrder && <p className="error-state" role="alert">{fieldErrors.sortOrder}</p>}
        {error && <p className="error-state" role="alert">{error}</p>}
      </div>
      <div slot="actions">
        <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
        <FilledButton onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</FilledButton>
      </div>
    </Dialog>
  );
}

function TreatmentFormDialog({
  dialogRef,
  treatment,
  groups,
  categories,
  token,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog>;
  treatment?: PopularTreatment;
  groups: PopularTreatmentGroup[];
  categories: Category[];
  token: string | null;
  onSave: (input: PopularTreatmentInput) => Promise<PopularTreatment | void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<PopularTreatmentInput>({
    name: treatment?.name ?? '',
    slug: treatment?.slug ?? '',
    groupId: treatment?.groupId ?? groups[0]?.id ?? '',
    categoryId: treatment?.categoryId ?? undefined,
    subcategoryId: treatment?.subcategoryId ?? undefined,
    sortOrder: treatment?.sortOrder ?? 0,
  });
  const [subcategories, setSubcategories] = useState<Category[]>([]);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<TreatmentFieldKey, string>> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Dialog is a single long-lived instance (never remounted via `key`) so imperative
  // `dialogRef.current?.show()` calls always act on the same, already-open node instead of
  // racing a key-triggered remount that would replace it with a fresh closed one right after
  // `show()` fires. Re-sync the form here whenever a different row is opened for editing.
  useEffect(() => {
    setForm({
      name: treatment?.name ?? '',
      slug: treatment?.slug ?? '',
      groupId: treatment?.groupId ?? groups[0]?.id ?? '',
      categoryId: treatment?.categoryId ?? undefined,
      subcategoryId: treatment?.subcategoryId ?? undefined,
      sortOrder: treatment?.sortOrder ?? 0,
    });
    setError('');
    setFieldErrors(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treatment?.id]);

  // Loads the chosen category's direct children for the Subcategory select — same
  // "fetch alongside the field it depends on" pattern used throughout this app's other
  // Category→Subcategory cascades (see DealDialog/ProductFormDialog).
  useEffect(() => {
    if (!form.categoryId) {
      setSubcategories([]);
      return;
    }
    listCategories(token, { scope: 'sub', parentId: form.categoryId, pageSize: 100 })
      .then(({ data }) => setSubcategories(data))
      .catch(() => setSubcategories([]));
  }, [token, form.categoryId]);

  const submit = async () => {
    if (submittingRef.current) return;
    if (!form.name.trim() || !form.slug.trim() || !form.groupId) {
      setError('Name, slug, and group are required.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    setFieldErrors(null);
    try {
      await onSave(form);
      dialogRef.current?.close();
    } catch (err) {
      const fields = extractFieldErrors<TreatmentFieldKey>(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not save treatment.');
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{treatment ? 'Edit treatment' : 'Add treatment'}</div>
      <div slot="content" className="form-grid">
        <OutlinedTextField
          label="Name"
          required
          value={form.name}
          onInput={(e: Event) => setForm((f) => ({ ...f, name: (e.target as HTMLInputElement).value }))}
          error={Boolean(fieldErrors?.name)}
        />
        {fieldErrors?.name && <p className="error-state" role="alert">{fieldErrors.name}</p>}

        <OutlinedTextField
          label="Slug"
          required
          value={form.slug}
          onInput={(e: Event) => setForm((f) => ({ ...f, slug: (e.target as HTMLInputElement).value }))}
          error={Boolean(fieldErrors?.slug)}
        />
        {fieldErrors?.slug && <p className="error-state" role="alert">{fieldErrors.slug}</p>}

        <OutlinedSelect
          label="Group"
          value={form.groupId}
          onChange={(e: Event) => setForm((f) => ({ ...f, groupId: (e.target as HTMLSelectElement).value }))}
          error={Boolean(fieldErrors?.groupId)}
        >
          {groups.map((g) => (
            <SelectOption key={g.id} value={g.id}>
              <div slot="headline">{g.name}{!g.isActive ? ' (Inactive)' : ''}</div>
            </SelectOption>
          ))}
        </OutlinedSelect>
        {fieldErrors?.groupId && <p className="error-state" role="alert">{fieldErrors.groupId}</p>}

        <OutlinedSelect
          label="Category (optional)"
          value={form.categoryId ?? ''}
          onChange={(e: Event) => {
            const value = (e.target as HTMLSelectElement).value || undefined;
            setForm((f) => ({ ...f, categoryId: value, subcategoryId: undefined }));
          }}
          error={Boolean(fieldErrors?.categoryId)}
        >
          <SelectOption value="">
            <div slot="headline">None</div>
          </SelectOption>
          {categories.map((c) => (
            <SelectOption key={c.id} value={c.id}>
              <div slot="headline">{c.name}</div>
            </SelectOption>
          ))}
        </OutlinedSelect>
        {fieldErrors?.categoryId && <p className="error-state" role="alert">{fieldErrors.categoryId}</p>}
        <p className="field-hint">Refines the treatment's search results by category — optional, not required for the chip to work.</p>

        {form.categoryId && subcategories.length > 0 && (
          <>
            <OutlinedSelect
              label="Subcategory (optional)"
              value={form.subcategoryId ?? ''}
              onChange={(e: Event) => setForm((f) => ({ ...f, subcategoryId: (e.target as HTMLSelectElement).value || undefined }))}
              error={Boolean(fieldErrors?.subcategoryId)}
            >
              <SelectOption value="">
                <div slot="headline">None</div>
              </SelectOption>
              {subcategories.map((c) => (
                <SelectOption key={c.id} value={c.id}>
                  <div slot="headline">{c.name}</div>
                </SelectOption>
              ))}
            </OutlinedSelect>
            {fieldErrors?.subcategoryId && <p className="error-state" role="alert">{fieldErrors.subcategoryId}</p>}
          </>
        )}

        <OutlinedTextField
          label="Display order"
          type="number"
          value={String(form.sortOrder ?? 0)}
          onInput={(e: Event) => setForm((f) => ({ ...f, sortOrder: Number((e.target as HTMLInputElement).value) || 0 }))}
          error={Boolean(fieldErrors?.sortOrder)}
        />
        {fieldErrors?.sortOrder && <p className="error-state" role="alert">{fieldErrors.sortOrder}</p>}

        {error && <p className="error-state" role="alert">{error}</p>}
      </div>
      <div slot="actions">
        <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
        <FilledButton onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</FilledButton>
      </div>
    </Dialog>
  );
}

export default PopularTreatmentManagement;
