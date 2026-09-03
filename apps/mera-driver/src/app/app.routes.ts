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
    path: 'location',
    title: 'Select Location · mera-driver',
    loadComponent: () =>
      import('./pages/location/location').then((m) => m.Location),
  },
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
      {
        path: 'customers',
        title: 'Customers · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'customers', action: 'view' }, title: 'Customers', subtitle: 'Manage your customer roster.' },
        loadComponent: () =>
          import('./pages/account/customers/customers').then((m) => m.Customers),
      },
      {
        path: 'drivers',
        title: 'Drivers · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'drivers', action: 'view' }, title: 'Drivers', subtitle: 'Manage your driver roster.' },
        loadComponent: () =>
          import('./pages/account/drivers/drivers').then((m) => m.Drivers),
      },
      {
        path: 'vehicles',
        title: 'Vehicles · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'vehicles', action: 'view' }, title: 'Vehicles', subtitle: 'Manage the fleet.' },
        loadComponent: () =>
          import('./pages/account/vehicles/vehicles').then((m) => m.Vehicles),
      },

      // Trips & Bookings Section
      {
        path: 'pricing',
        title: 'Pricing · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'trips.pricing', action: 'view' }, title: 'Pricing', subtitle: 'Fare and rate configurations.' },
        loadComponent: () =>
          import('./pages/account/trips/pricing/pricing').then((m) => m.Pricing),
      },
      {
        path: 'trips/bookings',
        title: 'Bookings · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'trips.bookings', action: 'view' }, title: 'Bookings', subtitle: 'Trip booking records.' },
        loadComponent: () =>
          import('./pages/account/trips/bookings/bookings').then((m) => m.Bookings),
      },
      {
        path: 'trips/pricing',
        title: 'Pricing · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'trips.pricing', action: 'view' }, title: 'Pricing', subtitle: 'Fare and rate configurations.' },
        loadComponent: () =>
          import('./pages/account/trips/pricing/pricing').then((m) => m.Pricing),
      },
      {
        path: 'trips/cancellation-reasons',
        title: 'Cancellation Reasons · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'trips.cancellation-reasons', action: 'view' }, title: 'Cancellation Reasons', subtitle: 'Configured cancellation reasons.' },
        loadComponent: () =>
          import('./pages/account/trips/cancellation-reasons/cancellation-reasons').then((m) => m.CancellationReasons),
      },
      {
        path: 'trips/driver-locations',
        title: 'Driver Locations · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'trips.driver-locations', action: 'view' }, title: 'Driver Locations', subtitle: 'Real-time and historic driver coordinates.' },
        loadComponent: () =>
          import('./pages/account/trips/driver-locations/driver-locations').then((m) => m.DriverLocations),
      },
      {
        path: 'trips/trip-types',
        title: 'Trip Types · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'trips.trip-types', action: 'view' }, title: 'Trip Types', subtitle: 'Trip categories and service types.' },
        loadComponent: () =>
          import('./pages/account/trips/trip-types/trip-types').then((m) => m.TripTypes),
      },

      {
        path: 'attendance',
        title: 'Attendance · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'attendance', action: 'view' }, title: 'Attendance', subtitle: 'Driver check-in/out records.' },
        loadComponent: () =>
          import('./pages/account/attendance/attendance').then((m) => m.Attendance),
      },

      // Payments Section
      {
        path: 'payments',
        title: 'Payments · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'payments.overview', action: 'view' }, title: 'Payments', subtitle: 'Fares, payouts, and reconciliation.' },
        loadComponent: () =>
          import('./pages/account/payments/payments').then((m) => m.Payments),
      },
      {
        path: 'payments/wallet-transactions',
        title: 'Wallet Transactions · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'payments.wallet-transactions', action: 'view' }, title: 'Wallet Transactions', subtitle: 'Driver and user wallet log.' },
        loadComponent: () =>
          import('./pages/account/payments/wallet-transactions/wallet-transactions').then((m) => m.WalletTransactions),
      },
      {
        path: 'payments/driver-payouts',
        title: 'Driver Payouts · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'payments.driver-payouts', action: 'view' }, title: 'Driver Payouts', subtitle: 'Driver earnings and payout transfers.' },
        loadComponent: () =>
          import('./pages/account/payments/driver-payouts/driver-payouts').then((m) => m.DriverPayouts),
      },

      // Promotions Section
      {
        path: 'promotions/promo-codes',
        title: 'Promo Codes · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'promotions.promo-codes', action: 'view' }, title: 'Promo Codes', subtitle: 'Promotional discount codes.' },
        loadComponent: () =>
          import('./pages/account/promotions/promo-codes/promo-codes').then((m) => m.PromoCodes),
      },
      {
        path: 'promotions/promo-usage',
        title: 'Promo Usage · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'promotions.promo-usage', action: 'view' }, title: 'Promo Usage', subtitle: 'Promotional code usage logs.' },
        loadComponent: () =>
          import('./pages/account/promotions/promo-usage/promo-usage').then((m) => m.PromoUsage),
      },

      // FAQs & Feedback
      {
        path: 'faqs',
        title: 'FAQs · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'faqs', action: 'view' }, title: 'FAQs', subtitle: 'In-app frequently asked questions.' },
        loadComponent: () =>
          import('./pages/account/faqs/faqs').then((m) => m.Faqs),
      },
      {
        path: 'feedback',
        title: 'Feedback · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'feedback', action: 'view' }, title: 'Feedback', subtitle: 'User reviews and feedback.' },
        loadComponent: () =>
          import('./pages/account/feedback/feedback').then((m) => m.Feedback),
      },

      {
        path: 'reports',
        title: 'Reports · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'reports', action: 'view' }, title: 'Reports', subtitle: 'Operational and financial reporting.' },
        loadComponent: () =>
          import('./pages/account/reports/reports').then((m) => m.Reports),
      },

      // Masters Section
      {
        path: 'masters/vehicle-types',
        title: 'Vehicle Types · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'masters.vehicle-types', action: 'view' }, title: 'Vehicle Types', subtitle: 'Driver master data.' },
        loadComponent: () =>
          import('./pages/account/masters/vehicle-types/vehicle-types').then((m) => m.VehicleTypesMaster),
      },
      {
        path: 'masters/zones',
        title: 'Service Zones · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'masters.zones', action: 'view' }, title: 'Service Zones', subtitle: 'Driver master data.' },
        loadComponent: () =>
          import('./pages/account/masters/zones/zones').then((m) => m.ZonesMaster),
      },
      {
        path: 'masters/source-types',
        title: 'Source Type · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'masters.source-types', action: 'view' }, title: 'Source Type', subtitle: 'Driver source configuration.' },
        loadComponent: () =>
          import('./pages/account/masters/source-types/source-types').then((m) => m.SourceTypesMaster),
      },
      {
        path: 'masters/statuses',
        title: 'Category Status · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'masters.statuses', action: 'view' }, title: 'Category Status', subtitle: 'Driver verification status configuration.' },
        loadComponent: () =>
          import('./pages/account/masters/statuses/statuses').then((m) => m.StatusesMaster),
      },
      {
        path: 'masters/driver-types',
        title: 'Driver Types · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'masters.driver-types', action: 'view' }, title: 'Driver Types', subtitle: 'Driver job type configuration.' },
        loadComponent: () =>
          import('./pages/account/masters/driver-types/driver-types').then((m) => m.DriverTypesMaster),
      },
      {
        path: 'masters/education',
        title: 'Education Document · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'masters.education', action: 'view' }, title: 'Education Document', subtitle: 'Driver academic qualifications.' },
        loadComponent: () =>
          import('./pages/account/masters/education/education').then((m) => m.EducationMaster),
      },
      {
        path: 'masters/eye-visions',
        title: 'Eye Vision · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'masters.eye-visions', action: 'view' }, title: 'Eye Vision', subtitle: 'Driver medical eye specifications.' },
        loadComponent: () =>
          import('./pages/account/masters/eye-visions/eye-visions').then((m) => m.EyeVisionsMaster),
      },
      {
        path: 'masters/personal-docs',
        title: 'Document Type · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'masters.personal-docs', action: 'view' }, title: 'Document Type', subtitle: 'Driver personal documents configuration.' },
        loadComponent: () =>
          import('./pages/account/masters/personal-docs/personal-docs').then((m) => m.PersonalDocsMaster),
      },
      {
        path: 'masters/health-docs',
        title: 'Health Document · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'masters.health-docs', action: 'view' }, title: 'Health Document', subtitle: 'Driver health documents configuration.' },
        loadComponent: () =>
          import('./pages/account/masters/health-docs/health-docs').then((m) => m.HealthDocsMaster),
      },
      {
        path: 'masters/police-docs',
        title: 'Police Verification Documents · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'masters.police-docs', action: 'view' }, title: 'Police Verification Documents', subtitle: 'Driver police verification documents configuration.' },
        loadComponent: () =>
          import('./pages/account/masters/police-docs/police-docs').then((m) => m.PoliceDocsMaster),
      },

      {
        path: 'settings',
        title: 'Settings · mera-driver',
        canActivate: [permissionGuard],
        data: { permission: { menuKey: 'settings', action: 'view' }, title: 'Settings', subtitle: 'App-wide configuration.' },
        loadComponent: () =>
          import('./pages/account/module-placeholder/module-placeholder').then((m) => m.ModulePlaceholder),
      },

      // Administration
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
        path: 'contact',
        title: 'Contact Us · mera-driver',
        loadComponent: () => import('./pages/contact/contact').then((m) => m.Contact),
      },
      {
        path: 'blog/:slug',
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
        path: '**',
        title: 'Page not found · mera-driver',
        loadComponent: () =>
          import('./pages/not-found/not-found').then((m) => m.NotFound),
      },
    ],
  },
];
