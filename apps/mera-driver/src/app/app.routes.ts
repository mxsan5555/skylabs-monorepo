import { Routes } from '@angular/router';
import { PublicLayout } from './layouts/public-layout/public-layout';
import { AuthLayout } from './layouts/auth-layout/auth-layout';
import { AdminLayout } from './layouts/admin-layout/admin-layout';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';

/**
 * Route table.
 *
 * Auth screens (sign-in, otp) use the centered AuthLayout, given explicit
 * non-empty parent paths so they only match those URLs. An empty-path parent
 * matches every URL, so PublicLayout (which holds '/', showcase, and the 404
 * catch-all) must be the only empty-path parent — otherwise it would swallow
 * routes meant for the other layout. Protected pages added next use
 * `canActivate: [authGuard]`. Lazy-loaded via loadComponent.
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
    path: 'auth/callback',
    component: AuthLayout,
    children: [
      {
        path: '',
        title: 'Signing in · mera-driver',
        loadComponent: () =>
          import('./pages/auth-callback/auth-callback').then((m) => m.AuthCallback),
      },
    ],
  },
  {
    // Authenticated console (after login / "My account").
    path: 'account',
    component: AdminLayout,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
      {
        path: 'dashboard',
        title: 'Dashboard · mera-driver',
        loadComponent: () =>
          import('./pages/account/role-pages').then((m) => m.Dashboard),
      },
      {
        path: 'profile',
        title: 'My Account · mera-driver',
        loadComponent: () =>
          import('./pages/account/profile/profile').then((m) => m.Profile),
      },
      {
        path: 'bookings',
        title: 'Bookings · mera-driver',
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
        loadComponent: () =>
          import('./pages/account/role-pages').then((m) => m.Bookings),
      },
      {
        path: 'promotions',
        title: 'Promotions · mera-driver',
        canActivate: [roleGuard],
        data: { roles: ['marketing'] },
        loadComponent: () =>
          import('./pages/account/role-pages').then((m) => m.Promotions),
      },
      {
        path: 'sales',
        title: 'Sales · mera-driver',
        canActivate: [roleGuard],
        data: { roles: ['sales'] },
        loadComponent: () =>
          import('./pages/account/role-pages').then((m) => m.Sales),
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
