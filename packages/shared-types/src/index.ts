/**
 * Cross-app RBAC domain types. Consumed by both frontends (msd-admin, mera-driver)
 * and both backends (msd-api, mera-driver-api) via `import type` — no runtime code,
 * no business data. Each app's database still owns its own rows; this package only
 * fixes the shape they agree on.
 */

export type AppId = 'msd' | 'mera-driver';

/** The sixteen configurable action kinds a Permission can grant on a menu key. */
export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'export'
  | 'import'
  | 'approve'
  | 'reject'
  | 'upload'
  | 'download'
  | 'print'
  | 'assign'
  | 'restore'
  | 'permanent_delete'
  | 'status_change'
  | 'custom';

export const PERMISSION_ACTIONS: PermissionAction[] = [
  'view',
  'create',
  'edit',
  'delete',
  'export',
  'import',
  'approve',
  'reject',
  'upload',
  'download',
  'print',
  'assign',
  'restore',
  'permanent_delete',
  'status_change',
  'custom',
];

export type UserStatus = 'active' | 'inactive' | 'blocked';

export interface Role {
  id: string;
  key: string;
  name: string;
  description?: string;
  isSystem: boolean;
  isSuperAdmin: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One grantable (menuKey, action) pair. `key` is the canonical `${menuKey}:${action}` string used everywhere. */
export interface Permission {
  id: string;
  key: string;
  menuKey: string;
  action: PermissionAction;
  label: string;
}

export interface DashboardWidget {
  id: string;
  key: string;
  title: string;
  module: string;
  description?: string;
}

export interface RoleDashboardWidget {
  roleId: string;
  widgetId: string;
  order: number;
}

export interface User {
  id: string;
  email?: string;
  phone?: string;
  name: string;
  googleId?: string;
  status: UserStatus;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** A node in `shared-menu`'s static menu.json — visibility is derived from `${permissionKey}:view`. */
export interface MenuNode {
  id: string;
  title: string;
  icon: string;
  route?: string;
  permissionKey: string;
  parent?: string | null;
  children?: MenuNode[];
  order: number;
}

/** Widget config resolved for the caller's roles — the component each `key` renders is a local app registry, not shared. */
export interface WidgetConfig {
  key: string;
  title: string;
  order: number;
}

/** Payload returned by `GET /rbac/bootstrap` right after login (and refetched on token refresh). */
export interface BootstrapResponse {
  user: Pick<User, 'id' | 'name' | 'email' | 'phone' | 'status'>;
  roles: Pick<Role, 'id' | 'key' | 'name' | 'isSuperAdmin'>[];
  permissions: string[]; // flattened `${menuKey}:${action}` keys granted across all of the user's roles
  menu: MenuNode[]; // already filtered server-side to what `permissions` allows
  dashboardWidgets: WidgetConfig[];
  /** Present only for a "Login As" preview token. */
  preview?: {
    isPreview: true;
    impersonatedBy: string;
  };
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export interface LoginHistoryEntry {
  id: string;
  userId: string;
  method: 'otp_email' | 'otp_phone' | 'google';
  success: boolean;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export interface DeviceSession {
  id: string;
  userId: string;
  deviceInfo?: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}

/** Standard success/error envelope every *-api route returns (per skylabs-api.md). */
export interface ApiEnvelope<T> {
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  meta?: { total?: number; page?: number; pageSize?: number };
}
