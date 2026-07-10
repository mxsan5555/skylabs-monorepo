import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { IconButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { AccountProvider } from '../../account/account-context';
import { Sidebar } from '../admin/sidebar';
import { findMenuItem } from '../admin/menu';

/**
 * Console shell shown after login / "My account": role-filtered sidebar + a
 * main column with a collapsible-sidebar toggle, breadcrumb, and centered
 * content. Wraps the area in AccountProvider so the sidebar and pages share
 * the profile.
 */
export function AdminLayout() {
const [collapsed, setCollapsed] = useState( window.innerWidth <= 768);
  const location = useLocation();
  const current = findMenuItem(location.pathname);

  return (
    <AccountProvider>
      <div className={`admin-layout${collapsed ? ' is-collapsed' : ''}`}>
        <Sidebar />
        <div className="admin-main">
          <div className="admin-topbar">
           <IconButton
  aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
  onClick={() => {
    setCollapsed((c) => {
      console.log("Current:", c, "Next:", !c);
      return !c;
    });
  }}
>
 <Icon>dock_to_right</Icon>
</IconButton>
            <nav aria-label="Breadcrumb">
              <ol className="admin-breadcrumb">
                <li>Account</li>
                {current && <li aria-current="page">{current.label}</li>}
              </ol>
            </nav>
          </div>
          <main className="admin-content">
            <Outlet />
          </main>
        </div>
      </div>
    </AccountProvider>
  );
}
