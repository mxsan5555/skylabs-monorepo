import { Routes } from '@angular/router';
import { PublicLayout } from './layouts/public-layout/public-layout';
import { AuthLayout } from './layouts/auth-layout/auth-layout';
import { AdminLayout } from './layouts/admin-layout/admin-layout';
import { authGuard, permissionGuard } from '@skylabs-monorepo/shared-auth/angular';

/**
 * Route table.
 *
 * Auth screens (sign-in, otp) use the centered AuthLayout, given explicit
 * non-empty parent paths so they only match those URLs. An empty-path parent
 * matches every URL, so PublicLayout (which holds '/', showcase, and the 404
 * catch-all) must be the only empty-path parent — otherwise it would swallow
 * routes meant for the other layout.
 *
 * Every `/account/*` page requires `canActivate: [authGuard]` (any
 * authenticated user). Permission-gated pages additionally carry
 * `canActivate: [permissionGuard]` with `data: { permission: { menuKey, action } }`
 * — this replaces the old `roleGuard` + `data: { roles: [...] }` pattern. The
 * `menuKey`s below match `@skylabs-monorepo/shared-menu`'s
 * `mera-driver-menu.json` node-for-node, so a route only "exists" for a user
 * once the server's `/rbac/bootstrap` grants it — the sidebar (which renders
 * `bootstrap.menu` directly) and this route table can never drift apart.
 */
export const appRoutes: Routes = [
  {
    path: 'sign-in',
    component: AuthLayout,
    children: [
      {
        path: '',
        title: 'Sign in · mera-driver',
        loadComponent: () =>
          import('./pages/sign-in/sign-in').then((m) => m.SignIn),
      },
    ],
  },
  {
    path: 'otp',
    component: AuthLayout,
    children: [
      {
        path: '',
        title: 'Verify your phone · mera-driver',
        loadComponent: () => import('./pages/otp/otp').then((m) => m.Otp),
      },
    ],
  },
  {
    // Authenticated console (after login / "My account"). noindex is applied in
    // index.html-level defaults + per-page <title>; see skylabs-seo.md for the
    // account-page robots rule.
    path: 'account',
    component: AdminLayout,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'dashboard', action: 'view' } },
        loadComponent: () =>
          import('./pages/account/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'profile',
        title: 'My Account · mera-driver',
        loadComponent: () =>
          import('./pages/account/profile/profile').then((m) => m.Profile),
      },

      // Business modules (placeholders — permission-gated, matching the menu
      // 1:1; real screens land module-by-module).
      {
        path: 'drivers',
        title: 'Drivers · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'drivers', action: 'view' }, title: 'Drivers', subtitle: 'Manage your driver roster.' },
        loadComponent: () =>
          import('./pages/account/module-placeholder/module-placeholder').then((m) => m.ModulePlaceholder),
      },
      {
        path: 'vehicles',
        title: 'Vehicles · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'vehicles', action: 'view' }, title: 'Vehicles', subtitle: 'Manage the fleet.' },
        loadComponent: () =>
          import('./pages/account/module-placeholder/module-placeholder').then((m) => m.ModulePlaceholder),
      },
      {
        path: 'trips',
        title: 'Trips · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'trips', action: 'view' }, title: 'Trips', subtitle: 'Track ongoing and completed trips.' },
        loadComponent: () =>
          import('./pages/account/module-placeholder/module-placeholder').then((m) => m.ModulePlaceholder),
      },
      {
        path: 'attendance',
        title: 'Attendance · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'attendance', action: 'view' }, title: 'Attendance', subtitle: 'Driver check-in/out records.' },
        loadComponent: () =>
          import('./pages/account/module-placeholder/module-placeholder').then((m) => m.ModulePlaceholder),
      },
      {
        path: 'payments',
        title: 'Payments · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'payments', action: 'view' }, title: 'Payments', subtitle: 'Fares, payouts, and reconciliation.' },
        loadComponent: () =>
          import('./pages/account/module-placeholder/module-placeholder').then((m) => m.ModulePlaceholder),
      },
      {
        path: 'reports',
        title: 'Reports · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'reports', action: 'view' }, title: 'Reports', subtitle: 'Operational and financial reporting.' },
        loadComponent: () =>
          import('./pages/account/module-placeholder/module-placeholder').then((m) => m.ModulePlaceholder),
      },
      {
        path: 'masters/vehicle-types',
        title: 'Vehicle Types · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'masters.vehicle-types', action: 'view' }, title: 'Vehicle Types', subtitle: 'Driver master data.' },
        loadComponent: () =>
          import('./pages/account/module-placeholder/module-placeholder').then((m) => m.ModulePlaceholder),
      },
      {
        path: 'masters/zones',
        title: 'Service Zones · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'masters.zones', action: 'view' }, title: 'Service Zones', subtitle: 'Driver master data.' },
        loadComponent: () =>
          import('./pages/account/module-placeholder/module-placeholder').then((m) => m.ModulePlaceholder),
      },
      {
        path: 'settings',
        title: 'Settings · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'settings', action: 'view' }, title: 'Settings', subtitle: 'App-wide configuration.' },
        loadComponent: () =>
          import('./pages/account/module-placeholder/module-placeholder').then((m) => m.ModulePlaceholder),
      },

      // Administration (real screens).
      {
        path: 'administration/roles',
        title: 'Role Management · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'rbac.roles', action: 'view' } },
        loadComponent: () =>
          import('./pages/account/administration/roles/roles').then((m) => m.AdministrationRoles),
      },
      {
        path: 'administration/users',
        title: 'User Management · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'rbac.users', action: 'view' } },
        loadComponent: () =>
          import('./pages/account/administration/users/users').then((m) => m.AdministrationUsers),
      },
      {
        path: 'administration/audit-logs',
        title: 'Audit Logs · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'rbac.audit-logs', action: 'view' } },
        loadComponent: () =>
          import('./pages/account/administration/audit-logs/audit-logs').then((m) => m.AdministrationAuditLogs),
      },
    ],
  },
  {
    path: '',
    component: PublicLayout,
    children: [
      {
        path: '',
        title: 'mera-driver — Your ride, your way',
        loadComponent: () => import('./pages/home/home').then((m) => m.Home),
      },
      {
        path: 'blog',
        title: 'Blog · mera-driver',
        loadComponent: () => import('./pages/blog/blog').then((m) => m.Blog),
      },
      {
        path: 'blog/:slug',
        // Title is set per-article by the component (it knows the slug).
        loadComponent: () =>
          import('./pages/blog-detail/blog-detail').then((m) => m.BlogDetail),
      },
      {
        path: 'showcase',
        title: 'Component showcase · mera-driver',
        loadComponent: () =>
          import('./pages/showcase/showcase').then((m) => m.Showcase),
      },
      {
        // Catch-all 404, inside the shell so it keeps header/footer.
        path: '**',
        title: 'Page not found · mera-driver',
        loadComponent: () =>
          import('./pages/not-found/not-found').then((m) => m.NotFound),
      },
    ],
  },
];
