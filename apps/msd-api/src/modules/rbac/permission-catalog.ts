import type { PermissionAction } from '@skylabs-monorepo/shared-types';

export interface RbacResourceDefinition {
  key: string;
  title: string;
  actions: PermissionAction[];
}

export const RBAC_RESOURCE_CATALOG: RbacResourceDefinition[] = [
  {
    key: 'members',
    title: 'Members',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'branches',
    title: 'Branches',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'deals',
    title: 'Deals',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'therapists',
    title: 'Therapists',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'products',
    title: 'Products',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'orders',
    title: 'Orders',
    actions: ['view'],
  },
  {
    key: 'customers',
    title: 'Customers',
    actions: ['view'],
  },
  {
    key: 'content',
    title: 'Content',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'payments_payouts',
    title: 'Payments & Payouts',
    actions: ['view'],
  },
  {
    key: 'reports',
    title: 'Reports',
    actions: ['view'],
  },
  {
    key: 'staff_users',
    title: 'Staff Users',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'system_settings',
    title: 'System Settings',
    actions: ['view', 'edit'],
  },
  {
    key: 'logs',
    title: 'Logs',
    actions: ['view'],
  },
  {
    key: 'my_profile',
    title: 'My Profile',
    actions: ['view', 'edit'],
  },
];