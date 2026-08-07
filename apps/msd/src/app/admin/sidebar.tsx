import { NavLink } from 'react-router-dom';
import type { MenuNode } from '@skylabs-monorepo/shared-types';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';

/**
 * Console navigation, built directly from `bootstrap.menu` — the server has
 * already pruned it down to what the caller's permissions allow, so this
 * component only has to decide layout, not visibility (no more hardcoded
 * per-role `ADMIN_MENU` or a "View as (demo)" switcher).
 *
 * While a SuperAdmin is previewing ("Login As"), the `administration` group
 * is hidden outright (belt-and-suspenders on top of the server-side gate —
 * previewed sessions shouldn't surface role/user management even if a quirk
 * of permission resolution would otherwise show it).
 */
export function Sidebar() {
  const { bootstrap, isPreviewing } = useAuth();
  const menu = bootstrap?.menu ?? [];
  const visibleMenu = isPreviewing ? menu.filter((node) => node.id !== 'administration') : menu;
  const initial = (bootstrap?.user.name ?? '?').charAt(0).toUpperCase();

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

      <nav className="admin-sidebar__nav" aria-label="Console">
        {visibleMenu.map((node) => <MenuNodeItem key={node.id} node={node} />)}
      </nav>

      <div className="admin-sidebar__user">
        <span className="admin-sidebar__avatar" aria-hidden="true">{initial}</span>
        <span className="admin-sidebar__user-info">
          <div className="admin-sidebar__user-name">{bootstrap?.user.name ?? 'Loading…'}</div>
          <div className="admin-sidebar__user-mail">{bootstrap?.user.email ?? bootstrap?.user.phone ?? ''}</div>
        </span>
      </div>
    </aside>
  );
}

function MenuNodeItem({ node }: { node: MenuNode }) {
  if (node.children && node.children.length > 0) {
    return (
      <div className="admin-nav-group">
        <p className="admin-nav-group__label">{node.title}</p>
        {node.children.map((child) => <MenuNodeItem key={child.id} node={child} />)}
      </div>
    );
  }

  if (!node.route) return null;

  return (
    <NavLink
      to={node.route}
      className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
    >
      <Icon aria-hidden="true">{node.icon}</Icon>
      {node.title}
    </NavLink>
  );
}
