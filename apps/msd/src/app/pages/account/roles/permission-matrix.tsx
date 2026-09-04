import type { PermissionCatalogRow } from '../../../../api/rbac/roles';

interface PermissionMatrixProps {
  catalog: PermissionCatalogRow[];
  selectedPermissionIds: ReadonlySet<string>;
  onToggle: (permissionId: string) => void;
  disabled?: boolean;
}

/**
 * Menu x action grid. A cell is a checkbox when the catalog has a seeded
 * `Permission` row for that `(menuKey, action)` pair (`permissionId` present);
 * otherwise it renders a disabled dash — that action isn't grantable yet
 * because no Permission row exists to reference.
 */
export function PermissionMatrix({ catalog, selectedPermissionIds, onToggle, disabled }: PermissionMatrixProps) {
  if (catalog.length === 0) {
    return <p className="empty-state">The permission catalog is empty.</p>;
  }

  const actionKeys = catalog[0]?.actions.map((a) => a.action) ?? [];

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
          {catalog.map((row) => (
            <tr key={row.menuKey}>
              <th scope="row">{row.title}</th>
              {row.actions.map((cell) => (
                <td key={cell.key}>
                  {cell.permissionId ? (
                    <input
                      type="checkbox"
                      aria-label={`${row.title} — ${cell.action}`}
                      checked={selectedPermissionIds.has(cell.permissionId)}
                      disabled={disabled}
                      onChange={() => cell.permissionId && onToggle(cell.permissionId)}
                    />
                  ) : (
                    <span aria-hidden="true">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
