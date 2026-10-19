import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { MenuNode } from '@skylabs-monorepo/shared-types';
import { Icon, IconButton, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { isDualRoleUser, setExperienceMode } from '../../auth/role-routing';
import { LOGO_SRC as logo, LOGO_COMPACT_SRC as logo2 } from '../../brand';
import { menuContainsRoute } from './menu-utils';
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
interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { bootstrap, isPreviewing, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const menu = bootstrap?.menu ?? [];
  const visibleMenu = isPreviewing ? menu.filter((node) => node.id !== 'administration') : menu;
  const activeId = activeMenuLeafId(visibleMenu, pathname);
  const initial = (bootstrap?.user.name ?? '?').charAt(0).toUpperCase();
  const dualRole = bootstrap ? isDualRoleUser(bootstrap) : false;

  const doSignOut = () => {
    signOut();
    navigate('/sign-in');
  };

  const switchToCustomer = () => {
    setExperienceMode('customer');
  };

  return (
    <aside className={`admin-sidebar${mobileOpen ? ' is-open' : ''}`}>
      <div className="admin-sidebar__mobile-header">
        <IconButton
          aria-label="Close navigation"
          onClick={onClose}
        >
          <Icon aria-hidden="true">close</Icon>
        </IconButton>
      </div>
      <div className="admin-sidebar__brand">
        <span className="admin-sidebar__logo">
          <img
            src={logo}
            alt="MySpaDeal"
            className="admin-sidebar__logo-image admin-sidebar__logo-image--desktop"
          />
          <img
            src={logo2}
            alt="MySpaDeal"
            className="admin-sidebar__logo-image admin-sidebar__logo-image--mobile"
          />
        </span>
      </div>

      <nav className="admin-sidebar__nav" aria-label="Console">
        <ul className="admin-nav-list">
          {visibleMenu.map((node) => (
            <li key={node.id}>
              <MenuNodeItem node={node} />
            </li>
          ))}
          {dualRole && (
            <li>
              <NavLink to="/" onClick={switchToCustomer} className="admin-nav-item">
                <Icon aria-hidden="true">storefront</Icon>
                Switch to Customer view
              </NavLink>
            </li>
          )}
        </ul>
      </nav>

      <div className="admin-sidebar__user">
        <span className="admin-sidebar__avatar" aria-hidden="true">{initial}</span>
        <span className="admin-sidebar__user-info">
          <div className="admin-sidebar__user-name">{bootstrap?.user.name ?? 'Loading…'}</div>
          <div className="admin-sidebar__user-mail">{bootstrap?.user.email ?? bootstrap?.user.phone ?? ''}</div>
        </span>
        <TextButton onClick={doSignOut}>
          <Icon slot="icon" aria-hidden="true">logout</Icon>
          Logout
        </TextButton>
      </div>
    </aside>
  );
}
/** Icon + label shared by every nav row (link or group trigger). */
function NavItemLabel({ node }: { node: MenuNode }) {
  return (
    <>
      {node.icon && <Icon aria-hidden="true">{node.icon}</Icon>}
      <span>{node.title}</span>
    </>
  );
}

function MenuNodeItem({ node }: { node: MenuNode }) {
  const { pathname } = useLocation();
  const children = node.children ?? [];
  const childIsActive = children.some((child) => menuContainsRoute(child, pathname));
  const [open, setOpen] = useState(childIsActive);

  useEffect(() => {
    if (childIsActive) setOpen(true);
  }, [childIsActive]);

  if (children.length) {
    // Disclosure navigation (WAI-ARIA APG): the whole row is one button that
    // shows/hides the list of links. The list stays in the DOM (`hidden`) so
    // `aria-controls` always points at a real element.
    const listId = `admin-nav-${node.id}`;
    return (
      <>
        <button
          type="button"
          className={`admin-nav-item admin-nav-group__trigger${childIsActive ? ' has-active' : ''}`}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((current) => !current)}
        >
          <NavItemLabel node={node} />
          <Icon aria-hidden="true" className="admin-nav-group__chevron">expand_more</Icon>
        </button>

        <ul id={listId} className="admin-nav-group__children" hidden={!open}>
          {children.map((child) => (
            <li key={child.id}>
              <MenuNodeItem node={child} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (!node.route) return null;

  return (
    <NavLink to={node.route} className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}>
      <NavItemLabel node={node} />
    </NavLink>
  );
}
