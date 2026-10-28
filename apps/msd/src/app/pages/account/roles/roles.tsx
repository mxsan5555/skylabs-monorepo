
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  FilledButton,
  OutlinedButton,
  OutlinedTextField,
  Switch,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';

import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { useConfirmDialog } from '../../../components/confirm-dialog';

import {
  deleteRole,
  getPermissionCatalog,
  getRolePermissions,
  getRoleWidgets,
  listDashboardWidgetsCatalog,
  listRoles,
  setRolePermissions,
  setRoleStatus,
  setRoleWidgets,
  updateRole,
  type DashboardWidgetRecord,
  type PermissionCatalogRow,
  type PermissionScope,
  type Role,
} from '../../../../api/rbac/roles';

import { ApiRequestError } from '../../../../api/rbac/client';
import { RoleList } from './role-list';
import { PermissionMatrix } from './permission-matrix';
import { WidgetAssignments } from './widget-assignments';

export function RoleManagement() {
  const { token, can } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState('');

  const [catalog, setCatalog] = useState<PermissionCatalogRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  const [widgetsCatalog, setWidgetsCatalog] = useState<
    DashboardWidgetRecord[]
  >([]);
  const [widgetsCatalogLoading, setWidgetsCatalogLoading] = useState(true);
  const [widgetsCatalogError, setWidgetsCatalogError] = useState('');

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  // Permissions are maintained separately for every role.
  // Map<Role ID, Map<Permission ID, Scope>>
  const [permissionsByRole, setPermissionsByRole] = useState<
    Map<string, Map<string, PermissionScope>>
  >(new Map());

  // The last-persisted grant set per role, so the matrix can tell an edited-but-unsaved
  // checkbox apart from one that already matches the database. Only ever replaced wholesale
  // (initial load, or a role's own successful save) — never mutated by `toggleRolePermission`.
  const [savedPermissionsByRole, setSavedPermissionsByRole] = useState<
    Map<string, Map<string, PermissionScope>>
  >(new Map());

  const [dirtyRoleIds, setDirtyRoleIds] = useState<Set<string>>(new Set());

  const [selectedWidgets, setSelectedWidgets] = useState<
    Map<string, number>
  >(new Map());

  const [detailForm, setDetailForm] = useState({
    name: '',
    description: '',
  });

  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [widgetsLoading, setWidgetsLoading] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [savingWidgets, setSavingWidgets] = useState(false);

  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const canEdit = can('rbac.roles', 'edit');
  const canDelete = can('rbac.roles', 'delete');
  const canChangeStatus = can('rbac.roles', 'status_change');

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  // Keep every role available in the matrix, including custom roles.
  const matrixRoles = roles;

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    setRolesError('');

    try {
      const { data } = await listRoles(token);
      setRoles(data);

      setSelectedRoleId((current) => {
        if (current && data.some((role) => role.id === current)) {
          return current;
        }

        return data[0]?.id ?? null;
      });
    } catch (error) {
      setRolesError(
        error instanceof ApiRequestError
          ? error.message
          : 'Could not load roles.',
      );
    } finally {
      setRolesLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  // Load the permission catalog.
  useEffect(() => {
    let cancelled = false;

    setCatalogLoading(true);
    setCatalogError('');

    getPermissionCatalog(token)
      .then(({ data }) => {
        if (!cancelled) {
          setCatalog(data);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCatalogError(
            error instanceof ApiRequestError
              ? error.message
              : 'Could not load the permission catalog.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Load the dashboard widget catalog.
  useEffect(() => {
    let cancelled = false;

    setWidgetsCatalogLoading(true);
    setWidgetsCatalogError('');

    listDashboardWidgetsCatalog(token)
      .then(({ data }) => {
        if (!cancelled) {
          setWidgetsCatalog(data);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setWidgetsCatalogError(
            error instanceof ApiRequestError
              ? error.message
              : 'Could not load the dashboard widget catalog.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setWidgetsCatalogLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Load saved permissions for all six fixed roles.
  useEffect(() => {
    let cancelled = false;

    if (matrixRoles.length === 0) {
      setPermissionsByRole(new Map());
      setDirtyRoleIds(new Set());
      setPermissionsLoading(false);
      return;
    }

    setPermissionsLoading(true);
    setActionError('');

    Promise.all(
      matrixRoles.map(async (role) => {
        const { data } = await getRolePermissions(token, role.id);

        const permissions = new Map<string, PermissionScope>();

        for (const item of data) {
          permissions.set(item.permissionId, item.scope);
        }

        return [role.id, permissions] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;

        setPermissionsByRole(new Map(entries));
        setSavedPermissionsByRole(new Map(entries.map(([roleId, perms]) => [roleId, new Map(perms)])));
        setDirtyRoleIds(new Set());
      })
      .catch((error) => {
        if (cancelled) return;

        setActionError(
          error instanceof ApiRequestError
            ? error.message
            : 'Could not load permissions for all roles.',
        );
      })
      .finally(() => {
        if (!cancelled) {
          setPermissionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, matrixRoles]);

  // Selecting a role loads its details and dashboard widgets.
  // Permissions for the full matrix are loaded by the effect above.
  useEffect(() => {
    let cancelled = false;

    setSelectedWidgets(new Map());

    if (!selectedRole) {
      setDetailForm({ name: '', description: '' });
      setWidgetsLoading(false);
      return;
    }

    setDetailForm({
      name: selectedRole.name,
      description: selectedRole.description ?? '',
    });

    setWidgetsLoading(true);

    getRoleWidgets(token, selectedRole.id)
      .then(({ data }) => {
        if (!cancelled) {
          setSelectedWidgets(
            new Map(data.map((item) => [item.widgetId, item.order])),
          );
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setActionError(
            error instanceof ApiRequestError
              ? error.message
              : "Could not load this role's dashboard widgets.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setWidgetsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRole, token]);

  // Toggle an individual V, C, E, or D permission.
  const toggleRolePermission = (
    roleId: string,
    permissionId: string,
    checked: boolean,
    scope: PermissionScope,
  ) => {
    const role = matrixRoles.find((item) => item.id === roleId);

    if (!canEdit || !role) {
      return;
    }

    setPermissionsByRole((previous) => {
      const next = new Map(previous);
      const rolePermissions = new Map(
        previous.get(roleId) ?? new Map<string, PermissionScope>(),
      );

      if (checked) {
        rolePermissions.set(permissionId, scope);
      } else {
        rolePermissions.delete(permissionId);
      }

      next.set(roleId, rolePermissions);
      return next;
    });

    setDirtyRoleIds((previous) => {
      const next = new Set(previous);
      next.add(roleId);
      return next;
    });

    setActionMessage('');
    setActionError('');
  };

  const toggleWidget = (widgetId: string) => {
    setSelectedWidgets((previous) => {
      const next = new Map(previous);

      if (next.has(widgetId)) {
        next.delete(widgetId);
      } else {
        next.set(widgetId, next.size);
      }

      return next;
    });
  };

  const setWidgetOrder = (widgetId: string, order: number) => {
    setSelectedWidgets((previous) =>
      new Map(previous).set(widgetId, order),
    );
  };

  const saveDetails = async () => {
    if (!selectedRole || !canEdit) return;

    setSavingDetails(true);
    setActionError('');
    setActionMessage('');

    try {
      const { data } = await updateRole(token, selectedRole.id, {
        name: detailForm.name,
        description: detailForm.description || undefined,
      });

      setRoles((previous) =>
        previous.map((role) => (role.id === data.id ? data : role)),
      );

      setActionMessage('Role details saved.');
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError
          ? error.message
          : 'Could not save role details.',
      );
    } finally {
      setSavingDetails(false);
    }
  };

  const toggleStatus = async () => {
    if (!selectedRole || !canChangeStatus) return;

    setActionError('');
    setActionMessage('');

    try {
      const { data } = await setRoleStatus(
        token,
        selectedRole.id,
        !selectedRole.isActive,
      );

      setRoles((previous) =>
        previous.map((role) => (role.id === data.id ? data : role)),
      );

      setActionMessage('Role status updated.');
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError
          ? error.message
          : 'Could not change role status.',
      );
    }
  };

  const removeRole = async () => {
    if (!selectedRole || !canDelete) return;

    if (
      !(await confirm(
        `Delete role "${selectedRole.name}"? This cannot be undone.`,
      ))
    ) {
      return;
    }

    try {
      await deleteRole(token, selectedRole.id);

      setRoles((previous) =>
        previous.filter((role) => role.id !== selectedRole.id),
      );

      setSelectedRoleId(null);

      setPermissionsByRole((previous) => {
        const next = new Map(previous);
        next.delete(selectedRole.id);
        return next;
      });

      setDirtyRoleIds((previous) => {
        const next = new Set(previous);
        next.delete(selectedRole.id);
        return next;
      });

      setActionMessage('Role deleted.');
      setActionError('');
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError
          ? error.message
          : 'Could not delete role. It may still be assigned to users.',
      );
    }
  };

  // Save changed roles. Successful roles are marked clean individually.
  const savePermissions = async () => {
    if (!canEdit || savingPermissions) return;

    const rolesToSave = matrixRoles.filter((role) =>
      dirtyRoleIds.has(role.id),
    );

    if (rolesToSave.length === 0) {
      setActionMessage('There are no permission changes to save.');
      return;
    }

    setSavingPermissions(true);
    setActionError('');
    setActionMessage('');

    let savedCount = 0;
    const errors: string[] = [];

    try {
      for (const role of rolesToSave) {
        const rolePermissions =
          permissionsByRole.get(role.id) ??
          new Map<string, PermissionScope>();

        const permissions = Array.from(rolePermissions.entries()).map(
          ([permissionId, scope]) => ({
            permissionId,
            scope,
          }),
        );

        try {
          const { data } = await setRolePermissions(
            token,
            role.id,
            permissions,
          );

          const savedPermissions = new Map<string, PermissionScope>();

          for (const item of data) {
            savedPermissions.set(item.permissionId, item.scope);
          }

          setPermissionsByRole((previous) => {
            const next = new Map(previous);
            next.set(role.id, savedPermissions);
            return next;
          });

          setSavedPermissionsByRole((previous) => {
            const next = new Map(previous);
            next.set(role.id, new Map(savedPermissions));
            return next;
          });

          setDirtyRoleIds((previous) => {
            const next = new Set(previous);
            next.delete(role.id);
            return next;
          });

          savedCount += 1;
        } catch (error) {
          errors.push(
            `${role.name}: ${
              error instanceof ApiRequestError
                ? error.message
                : 'Could not save permissions.'
            }`,
          );
        }
      }

      if (errors.length > 0) {
        setActionError(
          `${errors.join(' ')} ${savedCount} role(s) saved successfully. ` +
            'Changes for the failed roles remain pending.',
        );
      } else {
        setActionMessage(
          `Permissions saved successfully for ${savedCount} role(s).`,
        );
      }
    } finally {
      setSavingPermissions(false);
    }
  };

  const saveWidgets = async () => {
    if (!selectedRole || !canEdit) return;

    setSavingWidgets(true);
    setActionError('');
    setActionMessage('');

    try {
      const widgets = Array.from(selectedWidgets.entries()).map(
        ([widgetId, order]) => ({ widgetId, order }),
      );

      const { data } = await setRoleWidgets(
        token,
        selectedRole.id,
        widgets,
      );

      setSelectedWidgets(
        new Map(data.map((item) => [item.widgetId, item.order])),
      );

      setActionMessage('Dashboard widgets saved.');
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError
          ? error.message
          : 'Could not save dashboard widgets.',
      );
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
          <p>
            Define roles and control exactly what each one can see and do.
          </p>
        </div>

      </header>

      {actionMessage && (
        <p className="field-hint" role="status">
          {actionMessage}
        </p>
      )}

      {actionError && (
        <p className="error-state" role="alert">
          {actionError}
        </p>
      )}

      <div className="two-pane">
        <section className="panel" aria-label="Roles">
          <h2>Roles</h2>

          {rolesLoading ? (
            <p className="loading-state">Loading roles…</p>
          ) : rolesError ? (
            <p className="error-state">{rolesError}</p>
          ) : (
            <RoleList
              roles={roles}
              selectedId={selectedRoleId}
              onSelect={setSelectedRoleId}
            />
          )}
        </section>

        <section className="panel" aria-label="Role details">
          {!selectedRole ? (
            <p className="empty-state">
              Select a role to view its details and dashboard widgets.
            </p>
          ) : (
            <>
              <div className="page-head">
                <div>
                  <h2>{selectedRole.name}</h2>
                  <p className="field-hint">
                    {selectedRole.isSystem
                      ? 'System role — status and delete are locked.'
                      : 'Custom role'}
                  </p>
                </div>

                <div className="page-head__actions">
                  {canChangeStatus && (
                    <label className="widget-assign-row__label">
                      <Switch
                        selected={selectedRole.isActive}
                        disabled={
                          selectedRole.isSystem && selectedRole.isActive
                        }
                        onChange={toggleStatus}
                      />
                      {selectedRole.isActive ? 'Active' : 'Inactive'}
                    </label>
                  )}

                  {canDelete && (
                    <OutlinedButton
                      onClick={removeRole}
                      disabled={selectedRole.isSystem}
                    >
                      <Icon slot="icon" aria-hidden="true">
                        delete
                      </Icon>
                      Delete
                    </OutlinedButton>
                  )}
                </div>
              </div>

              <div className="form-grid">
                <OutlinedTextField
                  label="Name"
                  value={detailForm.name}
                  disabled={!canEdit}
                  onInput={(event: Event) =>
                    setDetailForm((form) => ({
                      ...form,
                      name: (event.target as HTMLInputElement).value,
                    }))
                  }
                />

                <OutlinedTextField
                  label="Description"
                  value={detailForm.description}
                  disabled={!canEdit}
                  onInput={(event: Event) =>
                    setDetailForm((form) => ({
                      ...form,
                      description: (event.target as HTMLInputElement).value,
                    }))
                  }
                />

                {canEdit && (
                  <div className="form-actions">
                    <FilledButton
                      onClick={saveDetails}
                      disabled={savingDetails}
                    >
                      {savingDetails ? 'Saving…' : 'Save details'}
                    </FilledButton>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* The matrix follows the role selected in the Roles panel. */}
      <section className="panel" aria-label="Permission matrix">
        <h2 className="section-title">Permission Matrix</h2>

        <p className="field-hint">
          Select a checkbox to grant an action and clear it to remove that
          action. V = View, C = Create, E = Edit, D = Delete. Own records
          means the user can access only their own records. Changes are
          saved when you click Save permissions.
        </p>

        {catalogLoading || permissionsLoading || rolesLoading ? (
          <p className="loading-state">Loading permission matrix…</p>
        ) : catalogError ? (
          <p className="error-state">{catalogError}</p>
        ) : rolesError ? (
          <p className="error-state">{rolesError}</p>
        ) : (
          <>
            <PermissionMatrix
              catalog={catalog}
              role={selectedRole}
              permissions={
                selectedRoleId
                  ? permissionsByRole.get(selectedRoleId) ?? new Map<string, PermissionScope>()
                  : new Map<string, PermissionScope>()
              }
              savedPermissions={selectedRoleId ? savedPermissionsByRole.get(selectedRoleId) : undefined}
              onPermissionToggle={toggleRolePermission}
              disabled={!canEdit || savingPermissions}
            />

            {canEdit && (
              <div className="form-actions">
                <FilledButton
                  onClick={savePermissions}
                  disabled={
                    savingPermissions ||
                    permissionsLoading ||
                    dirtyRoleIds.size === 0
                  }
                >
                  {savingPermissions
                    ? 'Saving permissions…'
                    : `Save permissions${
                        dirtyRoleIds.size > 0
                          ? ` (${dirtyRoleIds.size} role${
                              dirtyRoleIds.size === 1 ? '' : 's'
                            })`
                          : ''
                      }`}
                </FilledButton>
              </div>
            )}
          </>
        )}
      </section>

      {selectedRole && (
        <section className="panel" aria-label="Dashboard widgets">
          <h2 className="section-title">Dashboard widgets</h2>

          {widgetsCatalogLoading || widgetsLoading ? (
            <p className="loading-state">Loading dashboard widgets…</p>
          ) : widgetsCatalogError ? (
            <p className="error-state">{widgetsCatalogError}</p>
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
                  <FilledButton
                    onClick={saveWidgets}
                    disabled={savingWidgets}
                  >
                    {savingWidgets ? 'Saving…' : 'Save widgets'}
                  </FilledButton>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {ConfirmDialog}
    </div>
  );
}

export default RoleManagement;