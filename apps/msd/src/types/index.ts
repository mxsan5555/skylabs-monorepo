/**
 * App-local domain models for msd.
 *
 * Per the architecture, each app owns its own types/api/auth (no shared logic
 * package). When a NestJS backend lands at apps/api, these mirror its contract.
 */

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
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
