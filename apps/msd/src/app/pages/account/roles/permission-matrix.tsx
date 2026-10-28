import type {
  PermissionCatalogRow,
  PermissionScope,
  Role,
} from '../../../../api/rbac/roles';

interface PermissionMatrixProps {
  catalog: PermissionCatalogRow[];
  role: Role | null;
  permissions: ReadonlyMap<string, PermissionScope>;
  /** The last-persisted grant set for `role`, so an edited-but-unsaved cell can be told apart
   *  from a saved one. Omit (e.g. while the initial load is in flight) to skip the highlight. */
  savedPermissions?: ReadonlyMap<string, PermissionScope>;
  onPermissionToggle: (
    roleId: string,
    permissionId: string,
    checked: boolean,
    scope: PermissionScope,
  ) => void;
  disabled?: boolean;
}

const ACTIONS = [
  { key: 'view', label: 'View' },
  { key: 'create', label: 'Create' },
  { key: 'edit', label: 'Edit' },
  { key: 'delete', label: 'Delete' },
] as const;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Mirrors msd-api's `role.service.ts#SCOPE_ENFORCED_PERMISSION_KEYS` — the only permission keys
 * a route actually enforces `OWN` scope for. `setRolePermissions` rejects `OWN` for anything
 * else with a 422, so this UI never offers a scope control that would silently do nothing;
 * every other resource shows a fixed "All" label instead.
 */
const SCOPE_ENFORCED_PERMISSION_KEYS = ['rbac.audit-logs:view'];

function findAction(resource: PermissionCatalogRow, actionKey: string) {
  return (
    resource.actions.find(
      (item) =>
        normalize(item.action) === actionKey ||
        normalize(item.key) === actionKey ||
        normalize(item.key).endsWith(`:${actionKey}`),
    ) ?? null
  );
}

function viewAction(resource: PermissionCatalogRow) {
  return resource.actions.find((item) => item.action === 'view') ?? null;
}

/** Whether every record behind `ids` is granted — a resource backed by several real keys (e.g.
 *  Content's ~10 `cms.*` leaves) is "checked" only once they're all granted, so the checkbox
 *  always moves the whole group atomically rather than drifting into a partial state. */
function allGranted(ids: readonly string[], permissions: ReadonlyMap<string, PermissionScope>): boolean {
  return ids.length > 0 && ids.every((id) => permissions.has(id));
}

/** Whether `resource`'s scope is real and editable (its `view` key is on the enforced allowlist). */
function isScopeEditable(resource: PermissionCatalogRow): boolean {
  const key = viewAction(resource)?.key;
  return key ? SCOPE_ENFORCED_PERMISSION_KEYS.includes(key) : false;
}

/** The scope actually saved for this resource, read from the real `GET .../permissions` data —
 *  never guessed from the role's name or key. Defaults to `ALL`, matching the backend's default. */
function currentScope(
  resource: PermissionCatalogRow,
  permissions: ReadonlyMap<string, PermissionScope>,
): PermissionScope {
  const permissionId = viewAction(resource)?.permissionIds[0];
  return permissionId ? permissions.get(permissionId) ?? 'ALL' : 'ALL';
}

export function PermissionMatrix({
  catalog,
  role,
  permissions,
  savedPermissions,
  onPermissionToggle,
  disabled = false,
}: PermissionMatrixProps) {
  if (!role) {
    return (
      <p className="empty-state">
        Select a role to view and manage its permissions.
      </p>
    );
  }

  const roleName = role.name;

  return (
    <div>
      <p className="field-hint">
        Editing permissions for <strong>{roleName}</strong>. Select a checkbox
        to grant an action or clear it to remove the action. Changes are saved
        when you click Save permissions.
      </p>

      <p className="field-hint">
        <strong>Own</strong> restricts an action to the user's own records.
        <strong> All</strong> applies it to every record. A highlighted cell
        has an unsaved change.
      </p>

      <div className="perm-matrix-wrap">
        <table className="perm-matrix">
          <thead>
            <tr>
              <th scope="col">Resource</th>
              {ACTIONS.map((action) => (
                <th scope="col" key={action.key}>
                  {action.label}
                </th>
              ))}
              <th scope="col">Scope</th>
            </tr>
          </thead>

          <tbody>
            {catalog.map((resource) => {
              const scope = currentScope(resource, permissions);
              const scopeEditable = isScopeEditable(resource);
              const viewPermissionId = viewAction(resource)?.permissionIds[0] ?? null;
              const savedScope = savedPermissions
                ? currentScope(resource, savedPermissions)
                : scope;

              return (
                <tr key={resource.id}>
                  <th scope="row">{resource.title}</th>

                  {ACTIONS.map((action) => {
                    const definition = findAction(resource, action.key);

                    if (!definition) {
                      return (
                        <td key={action.key} className="perm-matrix__cell--na">
                          —
                        </td>
                      );
                    }

                    const ids = definition.permissionIds;
                    const checked = allGranted(ids, permissions);
                    const wasChecked = savedPermissions ? allGranted(ids, savedPermissions) : checked;
                    const dirty = savedPermissions ? checked !== wasChecked : false;

                    return (
                      <td
                        key={action.key}
                        className={dirty ? 'perm-matrix__cell--dirty' : undefined}
                      >
                        <input
                          type="checkbox"
                          aria-label={`${roleName}: ${resource.title}: ${action.label}`}
                          checked={checked}
                          disabled={disabled || ids.length === 0}
                          title={
                            ids.length === 0
                              ? 'Permission record is missing. Refresh the permission catalog after backend seeding.'
                              : `${action.label} — ${scope}${dirty ? ' (unsaved)' : ''}`
                          }
                          onChange={(event) => {
                            if (ids.length === 0) return;
                            const next = event.currentTarget.checked;
                            for (const id of ids) {
                              onPermissionToggle(role.id, id, next, scopeEditable ? scope : 'ALL');
                            }
                          }}
                        />
                      </td>
                    );
                  })}

                  <td
                    className={
                      scopeEditable && scope !== savedScope
                        ? 'perm-matrix__cell--dirty'
                        : undefined
                    }
                  >
                    {scopeEditable && viewPermissionId ? (
                      <select
                        aria-label={`${roleName}: ${resource.title}: scope`}
                        value={scope}
                        disabled={disabled || !permissions.has(viewPermissionId)}
                        title="Own restricts this permission to the user's own records; All applies to every record."
                        onChange={(event) =>
                          onPermissionToggle(
                            role.id,
                            viewPermissionId,
                            true,
                            event.currentTarget.value as PermissionScope,
                          )
                        }
                      >
                        <option value="ALL">All</option>
                        <option value="OWN">Own</option>
                      </select>
                    ) : (
                      <span>All</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PermissionMatrix;
