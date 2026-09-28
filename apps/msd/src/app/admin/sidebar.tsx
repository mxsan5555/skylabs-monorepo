import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { MenuNode } from '@skylabs-monorepo/shared-types';
import { Icon, IconButton, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { isDualRoleUser, setExperienceMode } from '../../auth/role-routing';
import logo from '../../assets/logo.jpg';
import logo2 from '../../assets/logo2.jpg';
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
  const menu = bootstrap?.menu ?? [];
  console.log('SIDEBAR MENU:', menu);
  console.log(
    'CUSTOMER MENU:',
    menu.find((node) => node.id === 'customers')
  );
  const visibleMenu = isPreviewing ? menu.filter((node) => node.id !== 'administration') : menu;
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
        {visibleMenu.map((node) => <MenuNodeItem key={node.id} node={node} onLogout={doSignOut} />)}
        {dualRole && (
          <NavLink to="/" onClick={switchToCustomer} className="admin-nav-item">
            <Icon aria-hidden="true">storefront</Icon>
            Switch to Customer view
          </NavLink>
        )}
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
function MenuNodeItem({
  node,
  onLogout,
  isChild = false,
}: {
  node: MenuNode;
  onLogout: () => void;
  isChild?: boolean;
}) {
  const location = useLocation();
  const hasChildren = Boolean(node.children?.length);

  const childIsActive =
    hasChildren &&
    node.children?.some((child) =>
      child.route ? location.pathname.startsWith(child.route) : false
    );

  const [open, setOpen] = useState(Boolean(childIsActive));

  useEffect(() => {
    if (childIsActive) {
      setOpen(true);
    }
  }, [childIsActive]);

  if (hasChildren) {
    return (
      <div className={`admin-nav-group${open ? ' open' : ''}`}>
        <div className="admin-nav-group__header">
          <div className="admin-nav-group__title">
            <Icon aria-hidden="true">{node.icon}</Icon>
            <span>{node.title}</span>
          </div>

          <IconButton
            className="admin-nav-group__toggle"
            aria-label={`${open ? 'Collapse' : 'Expand'} ${node.title}`}
            onClick={() => setOpen((current) => !current)}
          >
            <Icon aria-hidden="true">
              {open ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
            </Icon>
          </IconButton>
        </div>

        {open && (
          <div className="admin-nav-group__children">
            {node.children!.map((child) => (
              <MenuNodeItem
                key={child.id}
                node={child}
                onLogout={onLogout}
                isChild
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (node.id === 'settings-logout') {
    return (
      <button
        type="button"
        className="admin-nav-item"
        onClick={onLogout}
      >
        {!isChild && node.icon && (
          <Icon aria-hidden="true">{node.icon}</Icon>
        )}
        <span>{node.title}</span>
      </button>
    );
  }

  if (!node.route) return null;

  return (
    <NavLink
      to={node.route}
      className={({ isActive }) =>
        `admin-nav-item${isActive ? ' active' : ''}`
      }
    >
      {node.icon && (
        <Icon aria-hidden="true">{node.icon}</Icon>
      )}
      <span>{node.title}</span>
    </NavLink>
  );
}