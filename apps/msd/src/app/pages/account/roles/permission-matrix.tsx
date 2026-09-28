import type { PermissionAction } from '@skylabs-monorepo/shared-types';
import type { PermissionCatalogRow } from '../../../../api/rbac/roles';

interface PermissionMatrixProps {
  catalog: PermissionCatalogRow[];
  selectedPermissionIds: ReadonlySet<string>;
  onToggle: (permissionId: string) => void;
  disabled?: boolean;
}

/**
 * The Role Permission Matrix only ever exposes these 4 actions — legacy actions (export, import,
 * approve, reject, upload, download, print, assign, restore, permanent_delete, status_change,
 * custom) stay real `Permission` rows in the DB (other gates like `vendors:custom` still depend
 * on them) but are never rendered as columns here.
 */
const ALLOWED_ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete'];

/**
 * Menu x action grid, restricted to View/Create/Edit/Delete. A cell is a checkbox when the
 * catalog has a seeded `Permission` row for that `(menuKey, action)` pair (`permissionId`
 * present); otherwise it renders a disabled dash — that action isn't grantable yet because no
 * Permission row exists to reference (e.g. Branch has no `delete` endpoint, only status_change).
 */
export function PermissionMatrix({ catalog, selectedPermissionIds, onToggle, disabled }: PermissionMatrixProps) {
  if (catalog.length === 0) {
    return <p className="empty-state">The permission catalog is empty.</p>;
  }

  const catalogActions = new Set(catalog[0]?.actions.map((a) => a.action) ?? []);
  const actionKeys = ALLOWED_ACTIONS.filter((action) => catalogActions.has(action));

  return (
    <div className="perm-matrix-wrap">
      <table className="perm-matrix">
        <caption className="sr-only">Permission matrix by menu and action</caption>
        <thead>
          <tr>
            <th scope="col">Menu</th>
            {actionKeys.map((action) => (
              <th scope="col" key={action}>
                {action}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {catalog.map((row) => {
            const cellByAction = new Map(row.actions.map((cell) => [cell.action, cell]));
            return (
              <tr key={row.id} data-row-id={row.id}>
                <th scope="row">{row.title}</th>
                {actionKeys.map((action) => {
                  const cell = cellByAction.get(action);
                  return (
                    <td key={`${row.id}:${action}`}>
                      {cell?.permissionId ? (
                        <input
                          type="checkbox"
                          aria-label={`${row.title} — ${action}`}
                          data-action-key={cell.key}
                          checked={selectedPermissionIds.has(cell.permissionId)}
                          disabled={disabled}
                          onChange={() => cell.permissionId && onToggle(cell.permissionId)}
                        />
                      ) : (
                        <span aria-hidden="true">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
