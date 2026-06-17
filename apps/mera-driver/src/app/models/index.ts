/**
 * App-local domain models for mera-driver.
 *
 * Per the architecture, each app owns its own models/api/auth (no shared logic
 * package). When the Express backend lands, these mirror its contract.
 */

/** Access roles. The base user is a customer or driver; staff roles are added on top. */
export type UserRole = 'customer' | 'driver' | 'admin' | 'marketing' | 'sales';

export const ALL_ROLES: UserRole[] = [
  'customer',
  'driver',
  'admin',
  'marketing',
  'sales',
];

export interface User {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
}

export interface Address {
  id: string;
  label: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface AccountProfile {
  name: string;
  email: string;
  phone: string;
}

export interface BlogCategory {
  id: string;
  slug: string;
  name: string;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  categorySlug: string;
  publishedAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
