import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { FilledButton, IconButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { AccountProvider } from '../../account/account-context';
import { Sidebar } from '../admin/sidebar';
import { findMenuNodeByRoute } from '../admin/menu-utils';
import { BreadcrumbProvider, useBreadcrumbTrail } from '../admin/breadcrumb-context';
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
  return (
    <BreadcrumbProvider>
      <AdminShell />
    </BreadcrumbProvider>
  );
}

/** Shown on every console screen while the signed in member's account is inactive. */
export function MemberStatusBanner({ status }: { status?: string }) {
  if (status !== 'INACTIVE') return null;
  return (
    <p className="preview-banner" role="status">
      <Icon aria-hidden="true">info</Icon>
      <span>
        Your account is inactive and view only. You can look at everything, but you cannot change anything. Contact support to
        reactivate it.
      </span>
    </p>
  );
}

function AdminShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { bootstrap, isPreviewing, returnToSuperAdmin } = useAuth();
  const current = findMenuNodeByRoute(bootstrap?.menu ?? [], location.pathname);
  const trail = useBreadcrumbTrail();

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
          <MemberStatusBanner status={bootstrap?.member?.status} />
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
                {trail.length > 0
                  ? trail.map((crumb, i) => {
                      const isLast = i === trail.length - 1;
                      return (
                        <li key={`${crumb.label}-${i}`} aria-current={isLast ? 'page' : undefined}>
                          {crumb.to && !isLast ? <Link to={crumb.to}>{crumb.label}</Link> : crumb.label}
                        </li>
                      );
                    })
                  : current && <li aria-current="page">{current.title}</li>}
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
