import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { FilledButton, IconButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { AccountProvider } from '../../account/account-context';
import { Sidebar } from '../admin/sidebar';
import { findMenuNodeByRoute } from '../admin/menu-utils';
import { NotificationBell } from '../components/notification-bell';

/**
 * Console shell shown after login / "My account": permission-filtered sidebar
 * (built from `bootstrap.menu`) + a main column with a collapsible-sidebar
 * toggle, breadcrumb, and centered content. Still wraps the area in
 * `AccountProvider` — that's a separate localStorage-backed profile/address
 * store the profile page uses, unrelated to RBAC. Shows a persistent "Login
 * As" preview banner while a SuperAdmin is impersonating another user.
 */
export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { bootstrap, isPreviewing, returnToSuperAdmin } = useAuth();
  console.log('PREVIEW BOOTSTRAP:', {
  isPreviewing,
  roles: bootstrap?.roles,
  permissions: bootstrap?.permissions,
  menu: bootstrap?.menu,
});
  const current = findMenuNodeByRoute(bootstrap?.menu ?? [], location.pathname);

  return (
    <AccountProvider>
      <div className={`admin-layout${collapsed ? ' is-collapsed' : ''}`}>
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

        {mobileOpen && (
          <button
            type="button"
            className="admin-sidebar-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <div className="admin-main">
          {isPreviewing && (
            <div className="preview-banner" role="status">
              <Icon aria-hidden="true">visibility</Icon>
              <span>
                Previewing as <strong>{bootstrap?.user.name}</strong> — actions are logged to the audit trail.
              </span>
              <FilledButton onClick={() => returnToSuperAdmin()}>Return to SuperAdmin</FilledButton>
            </div>
          )}
          <div className="admin-topbar">
            <IconButton
              className="admin-sidebar-toggle"
              aria-label={
                mobileOpen
                  ? 'Close navigation'
                  : collapsed
                    ? 'Show navigation'
                    : 'Hide navigation'
              }
              onClick={() => {
                if (window.innerWidth <= 767) {
                  setMobileOpen((open) => !open);
                } else {
                  setCollapsed((c) => !c);
                }
              }}
            >
              <Icon aria-hidden="true">
                {mobileOpen ? 'close' : 'dock_to_right'}
              </Icon>
            </IconButton>

            <nav aria-label="Breadcrumb">
              <ol className="admin-breadcrumb">
                <li>Account</li>
                {current && <li aria-current="page">{current.title}</li>}
              </ol>
            </nav>

            <NotificationBell />
          </div>
          <main className="admin-content">
            <Outlet />
          </main>
        </div>
      </div>
    </AccountProvider>
  );
}
