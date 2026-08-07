import type { Role } from '../../../../api/rbac/roles';
import { Icon } from '@skylabs-monorepo/shared-ui/react';

interface RoleListProps {
  roles: Role[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Left-hand role picker. Row-level actions (clone/status/delete) live in the detail panel once a role is selected, to keep this list scannable. */
export function RoleList({ roles, selectedId, onSelect }: RoleListProps) {
  if (roles.length === 0) {
    return <p className="empty-state">No roles yet. Create one to get started.</p>;
  }

  return (
    <ul className="entity-list">
      {roles.map((role) => (
        <li key={role.id}>
          <button
            type="button"
            className={`entity-list__item${role.id === selectedId ? ' active' : ''}`}
            onClick={() => onSelect(role.id)}
            aria-current={role.id === selectedId ? 'true' : undefined}
          >
            <span className="role-list__name">
              {role.isSuperAdmin && <Icon aria-hidden="true">verified</Icon>}
              {role.name}
            </span>
            <span className={`status-pill ${role.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
              {role.isActive ? 'Active' : 'Inactive'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
