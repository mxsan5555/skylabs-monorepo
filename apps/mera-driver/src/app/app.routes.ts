import { Routes } from '@angular/router';
import { PublicLayout } from './layouts/public-layout/public-layout';
import { AuthLayout } from './layouts/auth-layout/auth-layout';
import { AdminLayout } from './layouts/admin-layout/admin-layout';
import { RiderLayout } from './layouts/rider-layout/rider-layout';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';

/**
 * Route table.
 *
 * An empty-path parent matches every URL, so exactly one layout may use it —
 * here PublicLayout (the marketing landing '/', blog, showcase, and the 404
 * catch-all, all with the site header/footer). Every other layout gets an
 * explicit non-empty parent path: AuthLayout (sign-in, otp), AdminLayout
 * (account), and the full-bleed RiderLayout (the booking flow under '/ride/*').
 * Protected pages use `canActivate: [authGuard]`. Lazy-loaded via loadComponent.
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
    // Full-bleed rider booking flow (no marketing header/footer). Reached from
    // the landing hero "See prices" and the header "Find Drivers".
    // TODO: guard 'verify' and 'payment' with authGuard once the mera-driver
    // auth API lands (a rider must be signed in to pay).
    path: 'ride',
    component: RiderLayout,
    children: [
      {
        path: '',
        title: 'Find a driver · mera-driver',
        loadComponent: () =>
          import('./pages/ride/home/home').then((m) => m.RideHome),
      },
      {
        path: 'location',
        title: 'Enable location · mera-driver',
        loadComponent: () =>
          import('./pages/ride/location/location').then((m) => m.RideLocation),
      },
      {
        path: 'options',
        title: 'Choose a ride · mera-driver',
        loadComponent: () =>
          import('./pages/ride/options/options').then((m) => m.RideOptions),
      },
      {
        path: 'drivers',
        title: 'Choose a driver · mera-driver',
        loadComponent: () =>
          import('./pages/ride/drivers/drivers').then((m) => m.RideDrivers),
      },
      {
        path: 'verify',
        title: 'Start trip · mera-driver',
        loadComponent: () =>
          import('./pages/ride/verify/verify').then((m) => m.RideVerify),
      },
      {
        path: 'payment',
        title: 'Payment · mera-driver',
        loadComponent: () =>
          import('./pages/ride/payment/payment').then((m) => m.RidePayment),
      },
      {
        path: 'confirmed',
        title: 'Booking confirmed · mera-driver',
        loadComponent: () =>
          import('./pages/ride/confirmed/confirmed').then(
            (m) => m.RideConfirmed,
          ),
      },
    ],
  },
  {
    // Marketing + content shell (site header/footer). The only empty-path
    // parent, so it owns the landing page at '/'.
    path: '',
    component: PublicLayout,
    children: [
      {
        path: '',
        title: 'mera-driver — Book a trusted driver, your way',
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
