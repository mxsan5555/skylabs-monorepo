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

/** A block of article body content. Maps cleanly to a CMS/API block model. */
export type BlogBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'quote'; text: string };

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  categorySlug: string;
  publishedAt: string; // ISO date
  coverImage: string;
  imageAlt: string;
  author: string;
  readMinutes: number;
  tags: string[];
  body: BlogBlock[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type BlogSort = 'newest' | 'oldest' | 'title';
export type ReadingBucket = 'any' | 'short' | 'long';

/** Blog list query — mirrors the future `GET /posts?...` request. */
export interface BlogQuery {
  search?: string;
  sort?: BlogSort;
  categories?: string[];
  reading?: ReadingBucket;
  authors?: string[];
  tags?: string[];
  page?: number;
  pageSize?: number;
}
