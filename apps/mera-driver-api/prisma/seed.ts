/** Non-destructive seed: initialise new roles only; preserve all existing grants, names,
 * assignments and historical roles, including deliberately empty permission sets. */

import path from 'path';
import dotenv from 'dotenv';

// Load this app's own .env.local — mera-driver-api never shares env/config with msd-api,
// and this script may be run standalone (`npx tsx apps/mera-driver-api/prisma/seed.ts`)
// rather than through `npx prisma db seed`, which is why we load explicitly instead of
// relying on Prisma CLI's own env discovery.
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

import { PrismaClient } from '../src/generated/prisma-client';
import { seedNewRolePermissions } from './role-permission-seed';
import { workflowMenu } from '../src/services/workflow-menu';
import { permissionKeyFor } from '@skylabs-monorepo/shared-permissions';
import type { MenuNode, PermissionAction } from '@skylabs-monorepo/shared-types';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

interface RoleSeed {
  key: string;
  name: string;
  description: string;
  isSuperAdmin: boolean;
}

// The 9 approved staff roles + the 2 portal roles (Driver, Customer — out of scope for the
// RBAC overhaul, preserved as-is). `contributor` and `sales_marketing` were removed by the
// RBAC baseline reconciliation below (verified zero linked users/audit history before
// removal) and must never be recreated — they are deliberately absent from this list.
const ROLES: RoleSeed[] = [
  { key: 'super_admin', name: 'Super Admin', description: 'Full access to every module — auto-granted every permission.', isSuperAdmin: true },
  { key: 'admin', name: 'Admin', description: 'Driver/customer operations, KYC assignment/review, dispatch, bookings, pricing, accounts, masters and staff management.', isSuperAdmin: false },
  { key: 'vendor', name: 'Vendor', description: 'Own linked or created drivers, and their assigned bookings/commission.', isSuperAdmin: false },
  { key: 'marketing', name: 'Marketing', description: 'Promotions, promo usage, website FAQs and aggregated marketing reports.', isSuperAdmin: false },
  { key: 'sales', name: 'Sales', description: 'Own created or assigned driver/customer leads and their bookings.', isSuperAdmin: false },
  { key: 'company', name: 'Company', description: 'Own company booking requests, trips, payments and reports.', isSuperAdmin: false },
  { key: 'data_operator', name: 'Data Operator', description: 'Driver profile/onboarding/document entry for own created or assigned drivers.', isSuperAdmin: false },
  { key: 'support', name: 'Support', description: 'Limited driver/customer lookup, booking support and feedback for assigned work.', isSuperAdmin: false },
  { key: 'kyc_verification', name: 'KYC Verification', description: 'Reviews and updates verification status for assigned KYC cases only.', isSuperAdmin: false },
  // Portal roles — not staff roles. Preserved exactly as before; excluded from the staff
  // role selector/User Management list (see `GET /rbac/users/assignable-roles`).
  { key: 'customer', name: 'Customer', description: 'Rider booking trips through the mera-driver app.', isSuperAdmin: false },
  { key: 'driver', name: 'Driver', description: 'A driver on the platform. No admin-console module grants yet — reserved for the driver self-service portal.', isSuperAdmin: false },
];

async function seedRoles() {
  const roles = new Map<string, { id: string; key: string; isSuperAdmin: boolean }>();
  for (const seed of ROLES) {
    const existing = await prisma.role.findUnique({ where: { key: seed.key } });
    if (existing) continue;
    const role = await prisma.role.upsert({
      where: { key: seed.key },
      create: { key: seed.key, name: seed.name, description: seed.description, isSystem: true, isSuperAdmin: seed.isSuperAdmin },
      update: {},
    });
    roles.set(role.key, role);
  }
  return roles;
}

// ---------------------------------------------------------------------------
// Permissions — generated from the static menu, not hand-typed.
// ---------------------------------------------------------------------------

const RBAC_ROLES_ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'status_change'];
const RBAC_USERS_ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'assign', 'status_change'];
const RBAC_AUDIT_ACTIONS: PermissionAction[] = ['view'];
const GROUP_ACTIONS: PermissionAction[] = ['view']; // parent menu groups with no route of their own
const LEAF_ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete'];
// Adds `status_change` (Active/Inactive account toggle) and `assign` (KYC verifier
// assignment, plus the pre-existing link-user/unlink-user/create-user actions that were
// already gated by `drivers:assign` in the routes without ever having a grantable Permission
// row for a non-superadmin role) on top of the leaf default.
const DRIVERS_ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'status_change', 'assign'];
// Adds `assign` for the Customer <-> User self-service-portal linkage routes
// (link-user/unlink-user/create-user), same reasoning as `DRIVERS_ACTIONS` above — without
// this the Permission row wouldn't exist to grant `customers:assign` to any non-superadmin role.
const CUSTOMERS_ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'assign'];
// Row-level scoping for this menu is ownership (assignedVerifierId === caller), not
// permission — `view` here only gates whether the "KYC Assignments" screen appears at all.
const KYC_ASSIGNMENTS_ACTIONS: PermissionAction[] = ['view', 'edit'];

function actionsForNode(node: MenuNode): PermissionAction[] {
  if (node.children && node.children.length > 0) return GROUP_ACTIONS;
  switch (node.permissionKey) {
    case 'rbac.roles':
      return RBAC_ROLES_ACTIONS;
    case 'rbac.users':
      return RBAC_USERS_ACTIONS;
    case 'rbac.audit-logs':
      return RBAC_AUDIT_ACTIONS;
    case 'drivers':
      return DRIVERS_ACTIONS;
    case 'customers':
      return CUSTOMERS_ACTIONS;
    case 'kyc-assignments':
      return KYC_ASSIGNMENTS_ACTIONS;
    default:
      return LEAF_ACTIONS;
  }
}

function flattenMenu(nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenMenu(node.children) : [])]);
}

async function seedPermissions() {
  const nodes = flattenMenu(workflowMenu());
  const permissionIds: string[] = [];

  for (const node of nodes) {
    for (const action of actionsForNode(node)) {
      const key = permissionKeyFor(node.permissionKey, action);
      const permission = await prisma.permission.upsert({
        where: { key },
        create: { menuKey: node.permissionKey, action, key, label: `${node.title} — ${action}` },
        update: { menuKey: node.permissionKey, action, label: `${node.title} — ${action}` },
      });
      permissionIds.push(permission.id);
    }
  }

  return permissionIds;
}

async function grantAllPermissionsToSuperAdmin(superAdminRoleId: string, permissionIds: string[]) {
  // The ONLY place `isSuperAdmin` drives behavior in application logic: auto-grant every
  // Permission to any role flagged `isSuperAdmin: true`. Never a `role.key === 'super_admin'`
  // string comparison — this reads the boolean column on the Role row.
  await prisma.rolePermission.createMany({
    data: permissionIds.map((permissionId) => ({ roleId: superAdminRoleId, permissionId })),
    skipDuplicates: true,
  });
}

const ALL_MASTERS_MENU_KEYS = [
  'masters.vehicle-types',
  'masters.zones',
  'masters.source-types',
  'masters.statuses',
  'masters.driver-types',
  'masters.education',
  'masters.eye-visions',
  'masters.personal-docs',
  'masters.health-docs',
  'masters.police-docs',
  'masters.languages',
];

/** Driver/Customer are portal roles, out of scope for the RBAC overhaul — preserved exactly
 *  as before via the same small, always-additive (never full-replace) grants. */
async function grantPortalRolePermissions(roles: Map<string, { id: string }>) {
  const grantActionsOf = async (roleKey: string, menuKeys: string[], actions: PermissionAction[]) => {
    // Only initialise portal grants for roles created in this seed run.
    const role = roles.get(roleKey);
    if (!role) return;
    const permissions = await prisma.permission.findMany({ where: { menuKey: { in: menuKeys }, action: { in: actions } } });
    await prisma.rolePermission.createMany({ data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })), skipDuplicates: true });
  };

  // Driver: reference data their own self-service profile picker needs, not an admin
  // capability. Actual driver-portal access is gated by ownership (bootstrap.driver), not a
  // permission key — see `resolveOwnDriver`/`driverPortalGuard`.
  await grantActionsOf('driver', ['masters.languages'], ['view']);
  await grantActionsOf('customer', ['dashboard'], ['view']);
  await grantActionsOf('customer', ['trips.bookings'], ['view', 'create']);
}

// ---------------------------------------------------------------------------
// RBAC baseline reconciliation — ONE-TIME, versioned, never re-applied.
// ---------------------------------------------------------------------------

/** menuKey -> actions, per the approved 9-role baseline policy. `delete` is deliberately
 *  absent from every entry here — Super Admin is the only role with delete-by-default
 *  (via `grantAllPermissionsToSuperAdmin`, untouched by this reconciliation). Each role's
 *  record-level *scope* (own/assigned/all) is enforced in the route/service layer, not by
 *  which actions are granted here — see `resolveOwnDriver`-style ownership checks. */
const ROLE_BASELINE: Record<string, { menuKey: string; actions: PermissionAction[] }[]> = {
  admin: [
    { menuKey: 'dashboard', actions: ['view'] },
    { menuKey: 'drivers', actions: ['view', 'create', 'edit', 'status_change', 'assign'] },
    { menuKey: 'customers', actions: ['view', 'create', 'edit', 'assign'] },
    { menuKey: 'kyc-assignments', actions: ['view', 'edit'] },
    { menuKey: 'vehicles', actions: ['view', 'create', 'edit'] },
    { menuKey: 'trips.trip-types', actions: ['view', 'create', 'edit'] },
    { menuKey: 'trips.bookings', actions: ['view', 'create', 'edit'] },
    { menuKey: 'trips.driver-locations', actions: ['view'] },
    { menuKey: 'trips.cancellation-reasons', actions: ['view', 'create', 'edit'] },
    { menuKey: 'trips.pricing', actions: ['view', 'create', 'edit'] },
    { menuKey: 'attendance', actions: ['view', 'create', 'edit'] },
    { menuKey: 'payments.overview', actions: ['view', 'create', 'edit'] },
    // Wallet Transactions / Driver Payouts have no backend mutation route yet (menu-only
    // stub modules, same as Promotions/FAQs/Feedback above) — view-only until real CRUD
    // routes exist for them.
    { menuKey: 'payments.wallet-transactions', actions: ['view'] },
    { menuKey: 'payments.driver-payouts', actions: ['view'] },
    { menuKey: 'reports', actions: ['view'] },
    ...ALL_MASTERS_MENU_KEYS.map((menuKey) => ({ menuKey, actions: ['view', 'create', 'edit'] as PermissionAction[] })),
    { menuKey: 'settings', actions: ['view'] },
    { menuKey: 'administration', actions: ['view'] },
    // Admin may VIEW Role Management; changing role permissions stays Super-Admin-only —
    // no `edit`/`create`/`delete`/`status_change` on `rbac.roles` here.
    { menuKey: 'rbac.roles', actions: ['view'] },
    // Staff management — `assertRoleDelegation` (role.service.ts) already blocks granting
    // Super Admin through this, so this is not a privilege-escalation path.
    { menuKey: 'rbac.users', actions: ['view', 'create', 'edit', 'assign', 'status_change'] },
    { menuKey: 'rbac.audit-logs', actions: ['view'] },
  ],
  vendor: [
    { menuKey: 'dashboard', actions: ['view'] },
    { menuKey: 'drivers', actions: ['view', 'create', 'edit'] },
    { menuKey: 'trips.bookings', actions: ['view'] },
    { menuKey: 'payments.overview', actions: ['view'] },
  ],
  marketing: [
    { menuKey: 'dashboard', actions: ['view'] },
    // Promotions/FAQs have no backend mutation routes yet (menu-only stub modules — see
    // `role.service.ts`'s `buildPermissionCatalog()` `supported` map, which already
    // restricts these to `view`). Granting create/edit here would be a fake permission
    // with no route to enforce it — narrowed from the literal policy-table wording to
    // match actual backend capability, per the task's own "don't create fake permissions"
    // instruction. Revisit once Promotions/FAQs CRUD routes ship.
    { menuKey: 'promotions.promo-codes', actions: ['view'] },
    { menuKey: 'promotions.promo-usage', actions: ['view'] },
    { menuKey: 'faqs', actions: ['view'] },
    { menuKey: 'reports', actions: ['view'] },
  ],
  sales: [
    { menuKey: 'dashboard', actions: ['view'] },
    { menuKey: 'drivers', actions: ['view', 'create', 'edit'] },
    { menuKey: 'customers', actions: ['view', 'create', 'edit'] },
    { menuKey: 'trips.bookings', actions: ['view', 'create'] },
    { menuKey: 'reports', actions: ['view'] },
  ],
  company: [
    { menuKey: 'dashboard', actions: ['view'] },
    { menuKey: 'trips.bookings', actions: ['view', 'create', 'edit'] },
    { menuKey: 'payments.overview', actions: ['view'] },
    { menuKey: 'reports', actions: ['view'] },
  ],
  data_operator: [
    { menuKey: 'dashboard', actions: ['view'] },
    // Driver profile/onboarding/document entry — not `status_change`/`assign` (cannot
    // verify DL, approve KYC, assign reviewers, or change account status).
    { menuKey: 'drivers', actions: ['view', 'create', 'edit'] },
    // View-only: master dropdown lookups their driver forms need keep working without
    // granting edit access to the Masters module itself.
    ...ALL_MASTERS_MENU_KEYS.map((menuKey) => ({ menuKey, actions: ['view'] as PermissionAction[] })),
  ],
  support: [
    { menuKey: 'dashboard', actions: ['view'] },
    { menuKey: 'drivers', actions: ['view'] },
    { menuKey: 'customers', actions: ['view'] },
    // Booking support edits — the admin `booking.service.ts` CRUD layer already blocks
    // mutating a priced booking's fare/payout/workflow fields (pushes to Accounts/
    // trip-workflow instead), so this can't reach fare, payout, OTP or KYC overrides.
    { menuKey: 'trips.bookings', actions: ['view', 'edit'] },
    // Feedback has no backend mutation route yet (menu-only stub module) — narrowed to
    // `view`, same reasoning as Marketing's Promotions/FAQs grant above.
    { menuKey: 'feedback', actions: ['view'] },
  ],
  kyc_verification: [
    { menuKey: 'dashboard', actions: ['view'] },
    // Deliberately no flat `drivers:*` grant — every driver would be visible to every
    // verifier under that. Access to assigned cases is ownership-scoped off
    // `assignedVerifierId` (`GET /drivers/assigned-to-me*`), not permission-scoped. This
    // role cannot assign itself a case — only `drivers:assign` holders (Admin/Super Admin)
    // can set `assignedVerifierId` via `PATCH /drivers/:id/assign-verifier`.
    { menuKey: 'kyc-assignments', actions: ['view', 'edit'] },
  ],
};

// ---------------------------------------------------------------------------
// Dashboard widgets
// ---------------------------------------------------------------------------

interface WidgetSeed {
  key: string;
  title: string;
  module: string;
  description: string;
}

const WIDGETS: WidgetSeed[] = [
  { key: 'drivers-active', title: 'Active Drivers', module: 'drivers', description: 'Count of drivers currently online.' },
  { key: 'trips-today', title: "Today's Trips", module: 'trips', description: 'Trips started or completed today.' },
  { key: 'payments-summary', title: 'Payments Summary', module: 'payments', description: 'Revenue collected this period.' },
];

async function seedDashboardWidgets() {
  const widgets = new Map<string, { id: string; key: string }>();
  for (const seed of WIDGETS) {
    const widget = await prisma.dashboardWidget.upsert({
      where: { key: seed.key },
      create: seed,
      update: seed,
    });
    widgets.set(widget.key, widget);
  }
  return widgets;
}

async function assignDashboardWidgets(
  roles: Map<string, { id: string; isSuperAdmin: boolean }>,
  widgets: Map<string, { id: string; key: string }>,
) {
  const assign = async (roleKey: string, widgetKey: string, order: number) => {
    const role = roles.get(roleKey);
    const widget = widgets.get(widgetKey);
    if (!role || !widget) return;
    await prisma.roleDashboardWidget.upsert({
      where: { roleId_widgetId: { roleId: role.id, widgetId: widget.id } },
      create: { roleId: role.id, widgetId: widget.id, order },
      update: { order },
    });
  };

  // SuperAdmin sees every widget, same principle as grantAllPermissionsToSuperAdmin above.
  for (const [key, role] of roles.entries()) {
    if (!role.isSuperAdmin) continue;
    let order = 1;
    for (const widgetKey of widgets.keys()) {
      await assign(key, widgetKey, order);
      order += 1;
    }
  }

  // admin sees everything
  await assign('admin', 'drivers-active', 1);
  await assign('admin', 'trips-today', 2);
  await assign('admin', 'payments-summary', 3);

  // sales cares about trips + payments, not driver headcount
  await assign('sales', 'trips-today', 1);
  await assign('sales', 'payments-summary', 2);

  // marketing only cares about trip volume as a proxy for demand
  await assign('marketing', 'trips-today', 1);
}

/**
 * Pre-creates the SuperAdmin user (with the super_admin role already attached) so their
 * *first* OTP login doesn't fall through to whatever default-role logic applies to a
 * roles.length===0 user. Identifier comes from SUPERADMIN_PHONE/SUPERADMIN_EMAIL in
 * .env.local — skipped (not guessed) if neither is set.
 */
async function seedSuperAdminUser(roles: Map<string, { id: string; isSuperAdmin: boolean }>) {
  const phone = process.env.SUPERADMIN_PHONE || undefined;
  const email = process.env.SUPERADMIN_EMAIL || undefined;
  if (!phone && !email) {
    console.log('SUPERADMIN_PHONE/SUPERADMIN_EMAIL not set — skipping SuperAdmin user seed.');
    return;
  }

  const superAdminRole = roles.get('super_admin') ?? await prisma.role.findUnique({ where: { key: 'super_admin' } });
  if (!superAdminRole) return;

  // Never reassign a configured existing account after an administrator removed its role.
  const existingUser = await prisma.user.findUnique({where: phone ? {phone} : {email: email!}});
  if (existingUser) return;
  const user = await prisma.user.upsert({
    where: phone ? { phone } : { email: email! },
    update: {},
    create: { name: 'Super Admin', phone, email },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: user.id, roleId: superAdminRole.id },
  });

  console.log(`Seeded SuperAdmin user (${phone ?? email}).`);
}

// Starter language list for the driver self-service portal's language picker — the only
// MasterListItem category seeded with rows (every other category is deliberately left for
// Super Admin to populate) because Phase 3B's driver portal is a real, immediate consumer of
// this list, not just an admin-managed reference table with nothing reading it yet.
const STARTER_LANGUAGES = [
  'Hindi', 'English', 'Bhojpuri', 'Punjabi', 'Marathi', 'Gujarati',
  'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Bengali', 'Urdu',
];

async function seedLanguages() {
  for (const name of STARTER_LANGUAGES) {
    await prisma.masterListItem.upsert({
      where: { category_name: { category: 'languages', name } },
      create: { category: 'languages', name, status: 'Active' },
      update: {},
    });
  }
}

async function main() {
  console.log('Seeding mera-driver-api...');

  const roles = await seedRoles();
  const permissionIds = await seedPermissions();

  const superAdmin = roles.get('super_admin');
  if (superAdmin) {
    await grantAllPermissionsToSuperAdmin(superAdmin.id, permissionIds);
  }
  // One-time versioned reconciliation of the 9-staff-role baseline — guarded by
  // SystemFlag, never re-applies, never overwrites a Super Admin's later customization.
  await seedNewRolePermissions(prisma, roles, ROLE_BASELINE);
  // Driver/Customer portal roles are out of scope for the RBAC overhaul — small, always-
  // additive grants, safe to re-run every seed.
  await grantPortalRolePermissions(roles);

  const widgets = await seedDashboardWidgets();
  await assignDashboardWidgets(roles, widgets);

  await seedSuperAdminUser(roles);
  await seedLanguages();

  console.log(`Seeded ${roles.size} roles, ${permissionIds.length} permissions, ${widgets.size} dashboard widgets.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
