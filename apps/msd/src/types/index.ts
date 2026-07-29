/**
 * App-local domain models for msd.
 *
 * Per the architecture, each app owns its own types/api/auth (no shared logic
 * package). When a NestJS/Express backend lands, these mirror its contract.
 */

/** Access roles. The backend supplies these in the JWT; the UI only gates on them. */
export type UserRole = 'user' | 'admin' | 'marketing' | 'sales';

export const ALL_ROLES: UserRole[] = ['user', 'admin', 'marketing', 'sales'];

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

// ─── Consumer storefront types ────────────────────────────────────────────────

export type PriceLevel = '$' | '$$' | '$$$';
export type SearchView = 'list' | 'grid' | 'map';
export type CheckoutStep = 'details' | 'datetime' | 'payment';
export type DealSort = 'popular' | 'rating' | 'price-asc' | 'price-desc' | 'distance';

export interface Subcategory {
  id: string;
  slug: string;
  name: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string;
  serviceCount: number;
  description: string;
  image: string;
  imageAlt: string;
  subcategories: Subcategory[];
}

export interface Deal {
  id: string;
  slug: string;
  title: string;
  providerName: string;
  categorySlug: string;
  subcategorySlug: string;
  description: string;
  image: string;
  imageAlt: string;
  gallery?: string[];
  price: number;
  originalPrice?: number;
  discount?: number;
  priceNote?: string;
  priceLevel: PriceLevel;
  priceUnit: string;
  duration: number;
  durationUnit: string;
  rating: number;
  reviews: number;
  distance: number;
  location: string;
  lat: number;
  lng: number;
  isOpen: boolean;
  isFeatured: boolean;
  isHot: boolean;
  badge?: string;
  features: string[];
  included: string[];
  howToUse: string[];
}

export interface CartItem {
  dealId: string;
  quantity: number;
  selectedDate?: string;
  selectedTime?: string;
}

export interface WishlistItem {
  dealId: string;
}

export interface SearchFilter {
  query: string;
  priceMin?: number;
  priceMax?: number;
  priceLevel?: PriceLevel[];
  categorySlug?: string;
  features?: string[];
  distanceMax?: number;
  suggested: boolean;
  sort: DealSort;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  image: string;
  gallery?: string[];
  price: number;
  originalPrice: number;
  rating: number;
  reviews: number;
  category: string;
  shortDescription: string;
  description: string;
  benefits: string[];
  ingredients: string[];
  howToUse: string[];
  affiliateUrl: string;
  slug: string;
}
