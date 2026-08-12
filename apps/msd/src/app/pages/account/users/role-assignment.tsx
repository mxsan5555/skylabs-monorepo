import type { Role } from '../../../../api/rbac/roles';

interface RoleAssignmentProps {
  allRoles: Role[];
  assignedRoleIds: ReadonlySet<string>;
  onToggle: (roleId: string, nowAssigned: boolean) => void;
  disabled?: boolean;
  busyRoleId?: string | null;
}

/** Every seeded role, checked if this user currently holds it — toggling calls the assign/unassign endpoint immediately (no separate Save step, since each toggle is its own atomic API call). */
export function RoleAssignment({ allRoles, assignedRoleIds, onToggle, disabled, busyRoleId }: RoleAssignmentProps) {
  if (allRoles.length === 0) {
    return <p className="empty-state">No roles exist yet.</p>;
  }

  return (
    <ul className="entity-list">
      {allRoles.map((role) => {
        const assigned = assignedRoleIds.has(role.id);
        return (
          <li key={role.id} className="widget-assign-row">
            <label className="widget-assign-row__label">
              <input
                type="checkbox"
                checked={assigned}
                disabled={disabled || busyRoleId === role.id}
                onChange={() => onToggle(role.id, !assigned)}
              />
              {role.name}
            </label>
            {busyRoleId === role.id && <span className="field-hint">Saving…</span>}
          </li>
        );
      })}
    </ul>
  );
}
