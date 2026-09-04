import type { UserRecord } from '../../../../api/rbac/users';

interface UserListProps {
  users: UserRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const STATUS_CLASS: Record<UserRecord['status'], string> = {
  active: 'status-pill--active',
  inactive: 'status-pill--inactive',
  blocked: 'status-pill--blocked',
};

export function UserList({ users, selectedId, onSelect }: UserListProps) {
  if (users.length === 0) {
    return <p className="empty-state">No users match.</p>;
  }

  return (
    <ul className="entity-list">
      {users.map((user) => (
        <li key={user.id}>
          <button
            type="button"
            className={`entity-list__item${user.id === selectedId ? ' active' : ''}`}
            onClick={() => onSelect(user.id)}
            aria-current={user.id === selectedId ? 'true' : undefined}
          >
            <span>
              {user.name}
              <br />
              <small className="field-hint">{user.email ?? user.phone}</small>
            </span>
            <span className={`status-pill ${STATUS_CLASS[user.status]}`}>{user.status}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
