import { NavLink } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '../../auth/auth-context';
import { useAccount } from '../../account/account-context';
import { ALL_ROLES, type UserRole } from '../../types';
import { ADMIN_MENU } from './menu';

/**
 * Console sidebar: brand, (dummy) search, role-filtered navigation, and the
 * signed-in user. The "View as" role switcher is a temporary affordance to
 * preview each persona until the backend supplies real roles.
 */
export function Sidebar() {
  const { roles, setRoles } = useAuth();
  const { profile } = useAccount();
  const initial = profile.name.charAt(0).toUpperCase();

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar__brand">
        <span className="admin-sidebar__logo">
          <Icon aria-hidden="true">spa</Icon>
        </span>
        <span>
          <div className="admin-sidebar__brand-name">MSD</div>
          <div className="admin-sidebar__brand-sub">Wellness console</div>
        </span>
      </div>

      <input
        className="admin-sidebar__search"
        type="search"
        placeholder="Search…"
        aria-label="Search"
      />

      <nav className="admin-sidebar__nav" aria-label="Console">
        {ADMIN_MENU.map((group) => {
          const items = group.items.filter((i) =>
            i.roles.some((r) => roles.includes(r)),
          );
          if (items.length === 0) return null;
          return (
            <div className="admin-nav-group" key={group.label}>
              <p className="admin-nav-group__label">{group.label}</p>
              {items.map((item) => (
                <NavLink key={item.to} to={item.to} className="admin-nav-item">
                  <Icon aria-hidden="true">{item.icon}</Icon>
                  {item.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="admin-roleswitch">
        <label htmlFor="role-switch">View as (demo)</label>
        <select
          id="role-switch"
          value={roles[0] ?? 'user'}
          onChange={(e) => setRoles([e.target.value as UserRole])}
        >
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="admin-sidebar__user">
        <span className="admin-sidebar__avatar">{initial}</span>
        <span className="admin-sidebar__user-info">
          <div className="admin-sidebar__user-name">{profile.name}</div>
          <div className="admin-sidebar__user-mail">{profile.email}</div>
        </span>
      </div>
    </aside>
  );
}
