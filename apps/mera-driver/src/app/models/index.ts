/**
 * App-local domain models for mera-driver.
 *
 * Per the architecture, each app owns its own models/api/auth (no shared logic
 * package). When the Express backend lands, these mirror its contract.
 */

/**
 * Access roles are dynamic now — real roles + granted permissions come from
 * `GET /rbac/bootstrap` (see `@skylabs-monorepo/shared-auth/angular`'s `AuthService`
 * and `@skylabs-monorepo/shared-types`'s `Role`/`BootstrapResponse`). This loose
 * alias exists only so older call sites that reference the *type name* `UserRole`
 * still compile — nothing in the app may branch on a specific role string.
 */
export type UserRole = string;

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

// --- Booking domain -------------------------------------------------------
// The rider booking flow (home → ride → driver → verify → payment). Mock data
// backs these today; they mirror the shape the mera-driver API will return.

/** A geographic point. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** A saved or recent address the rider can pick as pickup / drop-off. */
export interface Place {
  id: string;
  label: string;
  address: string;
  coord: LatLng;
  kind: 'saved' | 'recent';
}

/** Whether the trip is a single drop or a there-and-back. */
export type TripType = 'one-way' | 'round-trip';

/** Ride families offered by mera-driver. */
export type RideCategoryId =
  | 'car'
  | 'package'
  | 'outstation'
  | 'monthly'
  | 'language';

/** Sub-tier for the "package" category (hire a driver by duration). */
export type PackageTier = 'hourly' | 'half-day' | 'full-day';

/** One bookable ride/driver-hire option shown on the "Choose a ride" step. */
export interface RideOption {
  id: string;
  category: RideCategoryId;
  title: string;
  subtitle: string;
  /** Material Symbol name for the option's leading icon. */
  icon: string;
  etaMinutes: number;
  priceINR: number;
  seats: number;
  /** Only set for category === 'package'. */
  tier?: PackageTier;
  /** Only set for category === 'language' (e.g. "Hindi", "Tamil"). */
  language?: string;
  /** Highlighted as the recommended pick. */
  recommended?: boolean;
}

/** A driver a rider can pick or bookmark. */
export interface DriverSummary {
  id: string;
  name: string;
  /** Avatar URL (mock/remote today). */
  photo: string;
  rating: number;
  reviews: number;
  vehicle: string;
  plate: string;
  priceINR: number;
  etaMinutes: number;
  /** Passed police background verification. */
  policeVerified: boolean;
  /** Languages the driver speaks (supports the language-based option). */
  languages: string[];
  bookmarked: boolean;
}

export type PaymentKind = 'upi' | 'card' | 'cash' | 'wallet';

/** A saved payment method on the "Pay with" step. */
export interface PaymentMethod {
  id: string;
  kind: PaymentKind;
  label: string;
  detail?: string;
  /** Material Symbol name for the leading icon. */
  icon: string;
  expired?: boolean;
}

export type BookingStatus = 'draft' | 'confirmed';

/** The in-progress booking, assembled across the flow steps. */
export interface Booking {
  pickup: Place | null;
  drop: Place | null;
  ride: RideOption | null;
  driver: DriverSummary | null;
  payment: PaymentMethod | null;
  status: BookingStatus;
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
