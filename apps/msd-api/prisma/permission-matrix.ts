/**
 * The internal User Management permission matrix (Members/Branches/Deals/Therapists/Products/
 * Orders/Customers/Content/Payments & Payouts/Reports/Staff Users/System Settings/My Profile),
 * encoded as exact per-role grant lists keyed by real `Permission.key` (`${menuKey}:${action}`).
 *
 * Governs exactly five roles — `admin`, `marketing`, `sales`, `support`, `member` (the matrix's
 * "Member" row). `super_admin` is governed separately (its own hard runtime bypass in
 * `permission-resolver.service.ts`, capped for the few resources the matrix restricts even for
 * Super Admin — see that file's `SUPER_ADMIN_VIEW_ONLY_MENU_KEYS`); `customer` isn't a row in
 * this matrix at all and is left untouched.
 *
 * `MATRIX_GOVERNED_MENU_KEYS` is the exact set of menuKeys this matrix controls. Applying it
 * resets ONLY these keys' grants to exactly what's listed below, for exactly these five roles —
 * every other menuKey (Dashboard, Masters, RBAC Roles/Audit Logs, ...) and every other role
 * (Super Admin, Customer, any future custom role not named here) is left completely alone.
 */
export const MATRIX_GOVERNED_MENU_KEYS: string[] = [
  'vendors',
  'vendors.branches',
  'vendors.deals',
  'vendors.therapists',
  'vendors.products',
  'products',
  'orders',
  'customers',
  'cms',
  'cms.blog.pages',
  'cms.blog.articles',
  'cms.blog-category',
  'cms.website-pages',
  'cms.about-us',
  'cms.contact-us',
  'cms.faq',
  'cms.how-it-works',
  'cms.careers',
  'cms.social-media',
  'payments',
  'reports',
  'rbac.users',
  'system-settings',
  'settings',
  'vendor-portal.profile',
  'vendor-portal.branches',
  'vendor-portal.deals',
  'vendor-portal.therapists',
  'vendor-portal.products',
  'vendor-portal.customers',
  'vendor-portal.orders',
  'vendor-portal.payments',
  'vendor-portal.reports',
  // Accounts, Member Settlements & Purchase Verification — `accounts.refunds-disputes` is
  // deliberately NOT governed here (see seed.ts's EXTRA_ACTIONS_BY_MENU_KEY doc comment on that
  // key): no role in this matrix grants it, and leaving it ungoverned means a SuperAdmin can
  // still hand-grant it to a custom role later via the Role Permission Matrix UI without a
  // reseed silently stripping that grant back off.
  'accounts.overview',
  'accounts.customer-payments',
  'accounts.member-settlements',
];

const CONTENT_GROUP = ['cms', 'cms.blog.pages', 'cms.blog.articles', 'cms.blog-category', 'cms.about-us', 'cms.contact-us', 'cms.faq', 'cms.how-it-works', 'cms.careers', 'cms.social-media', 'cms.website-pages'];

function keysFor(menuKeys: string[], actions: string[]): string[] {
  return menuKeys.flatMap((menuKey) => actions.map((action) => `${menuKey}:${action}`));
}

/** Content leaf keys with no create/delete concept (singleton pages) only ever get view/edit. */
const CONTENT_SINGLETON_KEYS = ['cms.about-us', 'cms.contact-us', 'cms.website-pages'];
const CONTENT_CRUD_KEYS = CONTENT_GROUP.filter((k) => !CONTENT_SINGLETON_KEYS.includes(k));

export const PERMISSION_MATRIX_GRANTS: Record<string, string[]> = {
  // Members=VCE, Branches/Deals/Therapists=VCE, Products=VCE(no delete), Orders=V, Customers=V,
  // Content=VCE, Payments=-, Reports=V(overall), Staff Users=V, System Settings=V (PLANNING.md
  // §1.2's "System settings" row is Admin=`V A`, not VE — Edit is Super-Admin-only per §1.3 rule
  // 3's own explicit list — this used to also grant `system-settings:edit`, fixed 2026-10-26),
  // My Profile=VE. Extra actions per §1.2's table: Order cancel (`orders:status_change`),
  // Customer block/unblock (`customers:status_change`) and Report export (`reports:export`) are
  // all explicitly "Super Admin, Admin" — added 2026-10-26 (previously missing, so Admin could
  // not cancel an order, block a customer, or export a report after a reseed).
  admin: [
    'vendors:view', 'vendors:create', 'vendors:edit', 'vendors:approve', 'vendors:reject', 'vendors:status_change',
    'vendors.branches:view', 'vendors.branches:create', 'vendors.branches:edit', 'vendors.branches:status_change',
    'vendors.deals:view', 'vendors.deals:create', 'vendors.deals:edit', 'vendors.deals:status_change', 'vendors.deals:approve', 'vendors.deals:reject',
    'vendors.therapists:view', 'vendors.therapists:create', 'vendors.therapists:edit', 'vendors.therapists:status_change',
    'vendors.products:view', 'vendors.products:create', 'vendors.products:edit',
    'products:view',
    'orders:view', 'orders:status_change',
    'customers:view', 'customers:status_change',
    ...keysFor(CONTENT_CRUD_KEYS, ['view', 'create', 'edit']),
    ...keysFor(CONTENT_SINGLETON_KEYS, ['view', 'edit']),
    'reports:view', 'reports:export',
    'rbac.users:view',
    'system-settings:view',
    'settings:view', 'settings:edit',
    // Accounts — view-only across the board, and deliberately NO `accounts.member-settlements:
    // approve` (payout release stays Super-Admin-only, enforced server-side by requireSuperAdmin
    // regardless of this grant — see that middleware's own doc comment) and no
    // `accounts.refunds-disputes:*` at all (see MATRIX_GOVERNED_MENU_KEYS's own doc comment).
    'accounts.overview:view',
    'accounts.customer-payments:view', 'accounts.customer-payments:export',
    'accounts.member-settlements:view',
  ],
  // Members/Branches/Deals/Therapists/Products=V, Orders/Customers/Payments/Reports/Staff
  // Users/System Settings=-, Content=VCE, My Profile=VE.
  marketing: [
    'vendors:view',
    'vendors.branches:view',
    'vendors.deals:view',
    'vendors.therapists:view',
    'vendors.products:view',
    'products:view',
    ...keysFor(CONTENT_CRUD_KEYS, ['view', 'create', 'edit']),
    ...keysFor(CONTENT_SINGLETON_KEYS, ['view', 'edit']),
    'settings:view', 'settings:edit',
  ],
  // Members/Branches/Deals/Therapists=VCE, Products=VCE(no delete), Orders/Customers=V,
  // Content=V, Payments/Reports/Staff Users/System Settings=-, My Profile=VE.
  sales: [
    'vendors:view', 'vendors:create', 'vendors:edit', 'vendors:approve', 'vendors:reject', 'vendors:status_change',
    'vendors.branches:view', 'vendors.branches:create', 'vendors.branches:edit', 'vendors.branches:status_change',
    'vendors.deals:view', 'vendors.deals:create', 'vendors.deals:edit', 'vendors.deals:status_change', 'vendors.deals:approve', 'vendors.deals:reject',
    'vendors.therapists:view', 'vendors.therapists:create', 'vendors.therapists:edit', 'vendors.therapists:status_change',
    'vendors.products:view', 'vendors.products:create', 'vendors.products:edit',
    'products:view',
    'orders:view',
    'customers:view',
    ...keysFor(CONTENT_GROUP, ['view']),
    'settings:view', 'settings:edit',
  ],
  // Members/Branches/Deals/Therapists/Products/Orders/Customers/Content=V, everything else=-,
  // My Profile=VE.
  support: [
    'vendors:view',
    'vendors.branches:view',
    'vendors.deals:view',
    'vendors.therapists:view',
    'vendors.products:view',
    'products:view',
    'orders:view',
    'customers:view',
    ...keysFor(CONTENT_GROUP, ['view']),
    'settings:view', 'settings:edit',
  ],
  // The matrix's "Member" row — own-business-only, via the `vendor-portal.*` surface, never the
  // admin-wide `vendors`/`orders`/`customers`/`cms`/`products` keys (those would leak the
  // admin-wide sidebar nodes AND their unscoped backing endpoints to a member owner). Products is
  // capped to own:VCE (no delete, unlike its previous full-CRUD grant). Customers is `view`-only
  // per PLANNING.md §1.2's actual cell — `V O (customers who ordered from them)`, i.e. D19's
  // "member's own customers" — not the bare "-" an earlier revision of this file assumed; the
  // `/vendors/me/customers` route (D19) already enforces the own-scope filtering, this grant only
  // controls whether its sidebar node is visible.
  member: [
    'vendor-portal.profile:view', 'vendor-portal.profile:edit',
    'vendor-portal.branches:view', 'vendor-portal.branches:create', 'vendor-portal.branches:edit', 'vendor-portal.branches:status_change',
    'vendor-portal.deals:view', 'vendor-portal.deals:create', 'vendor-portal.deals:edit', 'vendor-portal.deals:status_change',
    'vendor-portal.therapists:view', 'vendor-portal.therapists:create', 'vendor-portal.therapists:edit', 'vendor-portal.therapists:status_change',
    'vendor-portal.products:view', 'vendor-portal.products:create', 'vendor-portal.products:edit',
    'vendor-portal.customers:view',
    'vendor-portal.orders:view',
    // Purchase Verification plumbing gate (voucher verify/start/OTP/complete/ship/evidence) —
    // see seed.ts's EXTRA_ACTIONS_BY_MENU_KEY doc comment on this exact key. Excluded from the
    // delete-then-recreate below (`applyPermissionMatrix` never touches `custom`), same as
    // `vendors:custom` elsewhere in this file.
    'vendor-portal.orders:custom',
    'vendor-portal.payments:view',
    'vendor-portal.reports:view',
    'settings:view', 'settings:edit',
  ],
};
