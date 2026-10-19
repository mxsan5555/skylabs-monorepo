import type {
  PermissionCatalogRow,
  PermissionScope,
  Role,
} from '../../../../api/rbac/roles';

interface PermissionMatrixProps {
  catalog: PermissionCatalogRow[];
  role: Role | null;
  permissions: ReadonlyMap<string, PermissionScope>;
  onPermissionToggle: (
    roleId: string,
    permissionId: string,
    checked: boolean,
    scope: PermissionScope,
  ) => void;
  disabled?: boolean;
}

const ACTIONS = [
  { key: 'view', label: 'V', description: 'View' },
  { key: 'create', label: 'C', description: 'Create' },
  { key: 'edit', label: 'E', description: 'Edit' },
  { key: 'delete', label: 'D', description: 'Delete' },
] as const;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function getScope(
  role: Role,
  resource: PermissionCatalogRow,
): PermissionScope {
  const roleKey = normalize(role.key);
  const resourceKey = normalize(resource.menuKey);

  if (resourceKey === 'my_profile') return 'OWN';

  if (resourceKey === 'logs' && roleKey !== 'super_admin') {
    return 'OWN';
  }

  if (
    roleKey === 'member' &&
    [
      'members',
      'branches',
      'deals',
      'therapists',
      'products',
      'orders',
      'payments_payouts',
      'reports',
    ].includes(resourceKey)
  ) {
    return 'OWN';
  }

  return 'ALL';
}

export function PermissionMatrix({
  catalog,
  role,
  permissions,
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

      <p>
        <strong>V</strong> = View&nbsp;&nbsp;
        <strong>C</strong> = Create&nbsp;&nbsp;
        <strong>E</strong> = Edit&nbsp;&nbsp;
        <strong>D</strong> = Delete
      </p>

      <p>
        <strong>Own</strong> means the action is restricted to the user's own
        records. <strong>All</strong> means all permitted records.
      </p>

      <table>
        <thead>
          <tr>
            <th scope="col">Resource</th>
            <th scope="col">{roleName}</th>
          </tr>
          <tr>
            <th scope="col">Actions</th>
            <th scope="col">
              <div>
                {ACTIONS.map((action) => (
                  <span key={action.key}>
                    {action.label}{' '}
                  </span>
                ))}
              </div>
            </th>
          </tr>
        </thead>

        <tbody>
          {catalog.map((resource) => {
            const scope = getScope(role, resource);

            return (
              <tr key={resource.id}>
                <th scope="row">{resource.title}</th>

                <td>
                  <div>
                    {ACTIONS.map((action) => {
                      const definition = resource.actions.find(
                        (item) =>
                          normalize(item.action) === action.key ||
                          normalize(item.key) === action.key ||
                          normalize(item.key).endsWith(`:${action.key}`),
                      );

                      // Do not display actions that aren't defined for a resource.
                      if (!definition) return null;

                      const permissionId = definition.permissionId;
                      const checked = permissionId
                        ? permissions.has(permissionId)
                        : false;

                      return (
                        <label key={action.key}>
                          <input
                            type="checkbox"
                            aria-label={`${roleName}: ${resource.title}: ${action.description}`}
                            checked={checked}
                            disabled={disabled || !permissionId}
                            title={
                              !permissionId
                                ? 'Permission record is missing. Refresh the permission catalog after backend seeding.'
                                : `${action.description} — ${scope}`
                            }
                            onChange={(event) => {
                              if (!permissionId) return;

                              onPermissionToggle(
                                role.id,
                                permissionId,
                                event.currentTarget.checked,
                                scope,
                              );
                            }}
                          />
                        </label>
                      );
                    })}

                    <span>
                      {' '}
                      {scope === 'OWN' ? 'Own' : 'All'}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default PermissionMatrix;