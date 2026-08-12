import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import {
  FilledButton,
  OutlinedButton,
  TextButton,
  OutlinedTextField,
  Switch,
  Dialog,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  cloneRole,
  createRole,
  deleteRole,
  getPermissionCatalog,
  getRolePermissionIds,
  listDashboardWidgetsCatalog,
  listRoles,
  setRolePermissions,
  setRoleStatus,
  setRoleWidgets,
  updateRole,
  type DashboardWidgetRecord,
  type PermissionCatalogRow,
  type Role,
} from '../../../../api/rbac/roles';
import { ApiRequestError } from '../../../../api/rbac/client';
import { RoleList } from './role-list';
import { PermissionMatrix } from './permission-matrix';
import { WidgetAssignments } from './widget-assignments';

/**
 * Role Management — list + select a role, edit its name/description/status,
 * and assign its permission matrix + dashboard widgets.
 *
 * Permissions are preloaded via `GET /rbac/roles/:id/permissions` on role
 * selection, so the matrix reflects saved grants. Known API gap: msd-api has
 * no equivalent GET for a role's current widget grants, only
 * `PUT /rbac/roles/:id/widgets` (write + return new state) — so the widget
 * assignments still start empty on every role selection rather than silently
 * guessing (and possibly overwriting) existing grants.
 */
export function RoleManagement() {
  const { token, can } = useAuth();

  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState('');

  const [catalog, setCatalog] = useState<PermissionCatalogRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  const [widgetsCatalog, setWidgetsCatalog] = useState<DashboardWidgetRecord[]>([]);
  const [widgetsCatalogLoading, setWidgetsCatalogLoading] = useState(true);

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(new Set());
  const [selectedWidgets, setSelectedWidgets] = useState<Map<string, number>>(new Map());

  const [detailForm, setDetailForm] = useState({ name: '', description: '' });
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [savingWidgets, setSavingWidgets] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const canEdit = can('rbac.roles', 'edit');
  const canCreate = can('rbac.roles', 'create');
  const canDelete = can('rbac.roles', 'delete');
  const canChangeStatus = can('rbac.roles', 'status_change');

  const selectedRole = useMemo(() => roles.find((r) => r.id === selectedRoleId) ?? null, [roles, selectedRoleId]);

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    setRolesError('');
    try {
      const { data } = await listRoles(token);
      setRoles(data);
      setSelectedRoleId((current) => current ?? data[0]?.id ?? null);
    } catch (err) {
      setRolesError(err instanceof ApiRequestError ? err.message : 'Could not load roles.');
    } finally {
      setRolesLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    getPermissionCatalog(token)
      .then(({ data }) => !cancelled && setCatalog(data))
      .catch((err) => !cancelled && setCatalogError(err instanceof ApiRequestError ? err.message : 'Could not load the permission catalog.'))
      .finally(() => !cancelled && setCatalogLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    setWidgetsCatalogLoading(true);
    listDashboardWidgetsCatalog(token)
      .then(({ data }) => !cancelled && setWidgetsCatalog(data))
      .finally(() => !cancelled && setWidgetsCatalogLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Selecting a different role resets the widget state (msd-api has no GET for a
  // role's current widget grants yet) and reloads the permission matrix from the
  // role's actual saved grants via getRolePermissionIds.
  useEffect(() => {
    let cancelled = false;
    setSelectedPermissionIds(new Set());
    setSelectedWidgets(new Map());
    setActionMessage('');
    setActionError('');
    if (selectedRole) {
      setDetailForm({ name: selectedRole.name, description: selectedRole.description ?? '' });
      setPermissionsLoading(true);
      getRolePermissionIds(token, selectedRole.id)
        .then(({ data }) => {
          if (!cancelled) setSelectedPermissionIds(new Set(data.permissionIds));
        })
        .catch((err) => {
          if (!cancelled) setActionError(err instanceof ApiRequestError ? err.message : "Could not load this role's saved permissions.");
        })
        .finally(() => {
          if (!cancelled) setPermissionsLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [selectedRoleId, selectedRole, token]);

  const togglePermission = (permissionId: string) => {
    setSelectedPermissionIds((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  };

  const toggleWidget = (widgetId: string) => {
    setSelectedWidgets((prev) => {
      const next = new Map(prev);
      if (next.has(widgetId)) next.delete(widgetId);
      else next.set(widgetId, next.size);
      return next;
    });
  };

  const setWidgetOrder = (widgetId: string, order: number) => {
    setSelectedWidgets((prev) => new Map(prev).set(widgetId, order));
  };

  const saveDetails = async () => {
    if (!selectedRole) return;
    setSavingDetails(true);
    setActionError('');
    try {
      const { data } = await updateRole(token, selectedRole.id, {
        name: detailForm.name,
        description: detailForm.description || undefined,
      });
      setRoles((prev) => prev.map((r) => (r.id === data.id ? data : r)));
      setActionMessage('Role details saved.');
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not save role details.');
    } finally {
      setSavingDetails(false);
    }
  };

  const toggleStatus = async () => {
    if (!selectedRole) return;
    try {
      const { data } = await setRoleStatus(token, selectedRole.id, !selectedRole.isActive);
      setRoles((prev) => prev.map((r) => (r.id === data.id ? data : r)));
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not change role status.');
    }
  };

  const removeRole = async () => {
    if (!selectedRole) return;
    if (!window.confirm(`Delete role "${selectedRole.name}"? This cannot be undone.`)) return;
    try {
      await deleteRole(token, selectedRole.id);
      setRoles((prev) => prev.filter((r) => r.id !== selectedRole.id));
      setSelectedRoleId(null);
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not delete role — it may still be assigned to users.');
    }
  };

  const savePermissions = async () => {
    if (!selectedRole) return;
    setSavingPermissions(true);
    setActionError('');
    try {
      const { data } = await setRolePermissions(token, selectedRole.id, Array.from(selectedPermissionIds));
      setSelectedPermissionIds(new Set(data.map((row) => row.permissionId)));
      setActionMessage('Permissions saved.');
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not save permissions.');
    } finally {
      setSavingPermissions(false);
    }
  };

  const saveWidgets = async () => {
    if (!selectedRole) return;
    setSavingWidgets(true);
    setActionError('');
    try {
      const widgets = Array.from(selectedWidgets.entries()).map(([widgetId, order]) => ({ widgetId, order }));
      const { data } = await setRoleWidgets(token, selectedRole.id, widgets);
      setSelectedWidgets(new Map(data.map((row) => [row.widgetId, row.order])));
      setActionMessage('Dashboard widgets saved.');
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not save dashboard widgets.');
    } finally {
      setSavingWidgets(false);
    }
  };

  return (
    <div className="admin-page admin-page--wide">
      <title>Role Management · MSD</title>
      <header className="page-head">
        <div>
          <h1>Role Management</h1>
          <p>Define roles and control exactly what each one can see and do.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && <CreateRoleButton onCreated={(role) => { setRoles((prev) => [...prev, role]); setSelectedRoleId(role.id); }} />}
        </div>
      </header>

      <div className="two-pane">
        <section className="panel" aria-label="Roles">
          <h2>Roles</h2>
          {rolesLoading ? (
            <p className="loading-state">Loading roles…</p>
          ) : rolesError ? (
            <p className="error-state">{rolesError}</p>
          ) : (
            <RoleList roles={roles} selectedId={selectedRoleId} onSelect={setSelectedRoleId} />
          )}
        </section>

        <section className="panel" aria-label="Role details">
          {!selectedRole ? (
            <p className="empty-state">Select a role to view and edit its permissions.</p>
          ) : (
            <>
              <div className="page-head">
                <div>
                  <h2>{selectedRole.name}</h2>
                  <p className="field-hint">{selectedRole.isSystem ? 'System role — status and delete are locked.' : 'Custom role'}</p>
                </div>
                <div className="page-head__actions">
                  {canCreate && (
                    <CloneRoleButton
                      role={selectedRole}
                      onCloned={(role) => { setRoles((prev) => [...prev, role]); setSelectedRoleId(role.id); }}
                    />
                  )}
                  {canChangeStatus && (
                    <label className="widget-assign-row__label">
                      <Switch
                        selected={selectedRole.isActive}
                        disabled={selectedRole.isSystem && selectedRole.isActive}
                        onChange={toggleStatus}
                      />
                      {selectedRole.isActive ? 'Active' : 'Inactive'}
                    </label>
                  )}
                  {canDelete && (
                    <OutlinedButton onClick={removeRole} disabled={selectedRole.isSystem}>
                      <Icon slot="icon" aria-hidden="true">delete</Icon>
                      Delete
                    </OutlinedButton>
                  )}
                </div>
              </div>

              {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}
              {actionError && <p className="error-state" role="alert">{actionError}</p>}

              <div className="form-grid">
                <OutlinedTextField
                  label="Name"
                  value={detailForm.name}
                  disabled={!canEdit}
                  onInput={(e: Event) => setDetailForm((f) => ({ ...f, name: (e.target as HTMLInputElement).value }))}
                />
                <OutlinedTextField
                  label="Description"
                  value={detailForm.description}
                  disabled={!canEdit}
                  onInput={(e: Event) => setDetailForm((f) => ({ ...f, description: (e.target as HTMLInputElement).value }))}
                />
                {canEdit && (
                  <div className="form-actions">
                    <FilledButton onClick={saveDetails} disabled={savingDetails}>
                      {savingDetails ? 'Saving…' : 'Save details'}
                    </FilledButton>
                  </div>
                )}
              </div>

              <h2 className="section-title">Permissions</h2>
              <p className="field-hint">
                {selectedRole.isSuperAdmin
                  ? 'SuperAdmin always has every current and future permission — this matrix is read-only and cannot restrict it.'
                  : "Checkboxes reflect this role's currently saved grants. Check or uncheck as needed, then Save (Save replaces the role's entire permission set)."}
              </p>
              {catalogLoading || permissionsLoading ? (
                <p className="loading-state">Loading permission catalog…</p>
              ) : catalogError ? (
                <p className="error-state">{catalogError}</p>
              ) : (
                <>
                  <PermissionMatrix
                    catalog={catalog}
                    selectedPermissionIds={selectedPermissionIds}
                    onToggle={togglePermission}
                    disabled={!canEdit || selectedRole.isSuperAdmin}
                  />
                  {canEdit && !selectedRole.isSuperAdmin && (
                    <div className="form-actions">
                      <FilledButton onClick={savePermissions} disabled={savingPermissions}>
                        {savingPermissions ? 'Saving…' : 'Save permissions'}
                      </FilledButton>
                    </div>
                  )}
                </>
              )}

              <h2 className="section-title">Dashboard widgets</h2>
              {widgetsCatalogLoading ? (
                <p className="loading-state">Loading widget catalog…</p>
              ) : (
                <>
                  <WidgetAssignments
                    catalog={widgetsCatalog}
                    selected={selectedWidgets}
                    onToggle={toggleWidget}
                    onOrderChange={setWidgetOrder}
                    disabled={!canEdit}
                  />
                  {canEdit && (
                    <div className="form-actions">
                      <FilledButton onClick={saveWidgets} disabled={savingWidgets}>
                        {savingWidgets ? 'Saving…' : 'Save widgets'}
                      </FilledButton>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function CreateRoleButton({ onCreated }: { onCreated: (role: Role) => void }) {
  const { token } = useAuth();
  const dialogRef = useRef<MdDialog>(null);
  const [form, setForm] = useState({ key: '', name: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!/^[a-z][a-z0-9_]*$/.test(form.key)) {
      setError('Key must be lower_snake_case, e.g. "regional_manager".');
      return;
    }
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await createRole(token, { ...form, isActive: true });
      onCreated(data);
      setForm({ key: '', name: '', description: '' });
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create role.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <FilledButton onClick={() => dialogRef.current?.show()}>
        <Icon slot="icon" aria-hidden="true">add</Icon>
        New role
      </FilledButton>
      <Dialog ref={dialogRef}>
        <div slot="headline">Create role</div>
        <div slot="content" className="form-grid">
          <OutlinedTextField
            label="Key (lower_snake_case)"
            value={form.key}
            onInput={(e: Event) => setForm((f) => ({ ...f, key: (e.target as HTMLInputElement).value }))}
          />
          <OutlinedTextField
            label="Name"
            value={form.name}
            onInput={(e: Event) => setForm((f) => ({ ...f, name: (e.target as HTMLInputElement).value }))}
          />
          <OutlinedTextField
            label="Description"
            value={form.description}
            onInput={(e: Event) => setForm((f) => ({ ...f, description: (e.target as HTMLInputElement).value }))}
          />
          {error && <p className="error-state" role="alert">{error}</p>}
        </div>
        <div slot="actions">
          <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
          <FilledButton onClick={submit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </FilledButton>
        </div>
      </Dialog>
    </>
  );
}

function CloneRoleButton({ role, onCloned }: { role: Role; onCloned: (role: Role) => void }) {
  const { token } = useAuth();
  const dialogRef = useRef<MdDialog>(null);
  const [form, setForm] = useState({ key: '', name: `${role.name} copy` });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!/^[a-z][a-z0-9_]*$/.test(form.key)) {
      setError('Key must be lower_snake_case, e.g. "regional_manager".');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await cloneRole(token, role.id, form.key, form.name);
      onCloned(data);
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not clone role.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <OutlinedButton onClick={() => dialogRef.current?.show()}>
        <Icon slot="icon" aria-hidden="true">content_copy</Icon>
        Clone
      </OutlinedButton>
      <Dialog ref={dialogRef}>
        <div slot="headline">Clone "{role.name}"</div>
        <div slot="content" className="form-grid">
          <p className="field-hint">Copies this role's permissions and dashboard widgets onto a new role.</p>
          <OutlinedTextField
            label="New key (lower_snake_case)"
            value={form.key}
            onInput={(e: Event) => setForm((f) => ({ ...f, key: (e.target as HTMLInputElement).value }))}
          />
          <OutlinedTextField
            label="New name"
            value={form.name}
            onInput={(e: Event) => setForm((f) => ({ ...f, name: (e.target as HTMLInputElement).value }))}
          />
          {error && <p className="error-state" role="alert">{error}</p>}
        </div>
        <div slot="actions">
          <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
          <FilledButton onClick={submit} disabled={submitting}>
            {submitting ? 'Cloning…' : 'Clone'}
          </FilledButton>
        </div>
      </Dialog>
    </>
  );
}

export default RoleManagement;
