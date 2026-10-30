import { apiGet } from './rbac/client';
import type { MediaImage, MediaVideo } from './media';
import type { BlogBlock } from '../types';
import type { BannerColorRole, BannerSlot } from './rbac/promotions';

/**
 * Public, unauthenticated customer catalogue client — mirrors msd-api's `/catalog/*` routes.
 * Reuses `apiGet` from `api/rbac/client.ts` (not the unused `api-client.ts`) because msd-api's
 * envelope/error shape (`{ data, error, meta }`) is identical for every route, public or not;
 * `apiGet` already supports a null token for exactly this case. No auth token is ever sent.
 */

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

/** One active Popular Tag mapping (Superadmin-managed, e.g. "Trending") — inactive tags are
 *  already filtered out server-side, never left to the frontend to hide (see msd-api's
 *  `getActiveTagNamesFor`). */
export interface CatalogPopularTag {
  id: string;
  name: string;
  slug: string;
}

/** Only ever present on a top-level row (see msd-api's `Category.type` schema doc comment) —
 *  `undefined` for a subcategory entry (which never appears at the top of the tree anyway). */
export interface CatalogCategoryWithChildren extends CatalogCategory {
  type?: 'SERVICE' | 'PRODUCT' | 'THERAPY' | null;
  sortOrder?: number;
  popularTags?: CatalogPopularTag[];
  children: CatalogCategory[];
}

/** `GET /catalog/locations`: distinct `{state, city}` pairs from active branches, plus the
 *  average branch coordinates for that city (null when no branch has coordinates). */
export interface CatalogLocation {
  state: string;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
}

/** A service Deal's own duration/price menu entry — a real child row (DealPackage), never a
 *  sibling Deal row. Only active packages are ever included here. Empty for a not-yet-migrated
 *  legacy service deal with no packages configured yet. */
export interface CatalogDealPackage {
  id: string;
  durationMinutes: number;
  sellingPrice: string;
  originalPrice: string | null;
}

/** Card tag computed by msd-api (PLANNING §4 D30): one per deal or product, or null. */
export type CatalogOfferTag = 'expire_soon' | 'hot' | 'new' | 'deal';
export const CATALOG_OFFER_TAGS: CatalogOfferTag[] = ['expire_soon', 'hot', 'new', 'deal'];

export interface CatalogDeal {
  id: string;
  tag?: CatalogOfferTag | null;
  title: string;
  slug: string;
  shortDescription: string | null;
  /** Rich HTML (sky-rich-text-editor), already server-sanitized — render via
   *  `dangerouslySetInnerHTML`, never as plain text (see deal-detail.tsx). */
  description: string | null;
  termsAndConditions: string | null;
  note: string | null;
  policy: string | null;
  /** A synced "from price"/default-duration display cache (kept in sync with the cheapest
   *  active `packages[]` entry server-side — see DealPackage's own schema doc comment in
   *  msd-api) — accurate for listing/sort/filter display, but NEVER the authoritative cart/order
   *  price for a service deal that has packages; the customer's selected `packages[].id` is. */
  originalPrice: string;
  salePrice: string;
  discountPercent: number | null;
  durationMinutes: number | null;
  images: string[] | null;
  category: CatalogCategory | null;
  subcategory: CatalogCategory | null;
  vendor: { id: string; slug: string | null; businessName: string | null; city: string | null; logoUrl: string | null } | null;
  /** `latitude`/`longitude` are Decimal → string over the wire (same convention as
   *  originalPrice/salePrice below), and nullable — most branches don't have coordinates set
   *  yet. Never fabricate a value when these are null; treat as "location not available". */
  branch: { id: string; name: string; city: string | null; address: string | null; latitude: string | null; longitude: string | null } | null;
  packages: CatalogDealPackage[];
  mediaImages?: MediaImage[];
  mediaVideo?: MediaVideo | null;
  popularTags?: CatalogPopularTag[];
  /** Real Haversine distance (km) to this deal's own branch coordinates, computed only when the
   *  caller passed `latitude`/`longitude` to `listCatalogDeals` — `null` whenever either side's
   *  coordinates are unavailable, never fabricated. Optional (not just nullable) since existing
   *  test fixtures typed as `CatalogDeal` predate this field. */
  distanceKm?: number | null;
}

export type CatalogCancellationPolicy = 'FREE_24H' | 'FREE_48H' | 'NON_REFUNDABLE';

/** A package on the deal page: the card fields plus name, people, inclusions and its discount. */
export interface CatalogDealDetailPackage extends CatalogDealPackage {
  name: string | null;
  persons: number;
  inclusions: string[];
  discountPercent: number | null;
}

/** `GET /catalog/deals/:idOrSlug` (API.md §4): everything the deal page shows in one call. */
export interface CatalogDealDetail extends Omit<CatalogDeal, 'packages' | 'branch' | 'vendor' | 'mediaImages'> {
  tagline: string | null;
  highlights: string[];
  eligibility: string[];
  currency: 'INR';
  bookingRequired: boolean;
  bookingInstructions: string | null;
  validityDays: number | null;
  limitPerCustomer: number | null;
  cancellationPolicy: CatalogCancellationPolicy;
  cancellationNote: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** Paid units, or null under 10 (the page shows "{n} bought" from 10). */
  boughtCount: number | null;
  isSoldOut: boolean;
  /** Units left, or null without a stock limit. */
  stockLeft: number | null;
  packages: CatalogDealDetailPackage[];
  faqs: { id: string; question: string; answer: string }[];
  mediaImages?: (MediaImage & { altText?: string | null })[];
  vendor: (NonNullable<CatalogDeal['vendor']> & { businessDescription: string | null; website: string | null; mediaImages?: MediaImage[] }) | null;
  branch:
    | (NonNullable<CatalogDeal['branch']> & {
        addressLine2: string | null;
        state: string | null;
        pincode: string | null;
        phone: string | null;
        mapLocationUrl: string | null;
        openingHours: CatalogOpeningHours | null;
      })
    | null;
  therapists: CatalogTherapist[];
}

/** `Branch.openingHours` shape — keys are lowercase 3-letter day codes (`mon`…`sun`); `open:
 *  false` means closed all day (start/end are then meaningless). Mirrors the vendor-facing edit
 *  form's own `DayHours`/`OpeningHours` types (`apps/msd/src/api/rbac/vendors.ts`) exactly — kept
 *  as an independent type here (not imported) since this is the public, unauthenticated catalog
 *  API surface, never the authenticated RBAC vendor client. Absent (`null`) for branches that
 *  haven't set hours yet, or missing a given day's key if only some days were configured. */
export interface CatalogDayHours {
  open: boolean;
  start?: string;
  end?: string;
}
export type CatalogOpeningHours = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', CatalogDayHours>>;

/** A therapist's own duration/price menu entry — independent of any Deal (see msd-api's
 *  TherapistPackage schema doc comment). Combined with a Deal only at purchase time, by matching
 *  `durationMinutes` against the customer's selected Deal — never by any shared id. Only active
 *  packages are ever included here. */
export interface CatalogTherapistPackage {
  id: string;
  durationMinutes: number;
  sellingPrice: string;
  originalPrice: string | null;
}

export interface CatalogVendorTherapist {
  id: string;
  slug: string | null;
  /** The service/role label a customer browses by (e.g. "Legs Therapist") — distinct from
   *  `personName` below, never merged into one field; the customer must see both clearly. */
  therapistType: string;
  /** The actual staff member (e.g. "Ramesh Kumar"). */
  personName: string;
  gender: string | null;
  specialization: string | null;
  /** Rich HTML (sky-rich-text-editor), already server-sanitized — render via
   *  `dangerouslySetInnerHTML`, never as plain text (see therapist-detail.tsx). */
  bio: string | null;
  experienceYears: number | null;
  photoUrl: string | null;
  packages: CatalogTherapistPackage[];
  mediaImages?: MediaImage[];
  mediaVideo?: MediaVideo | null;
  popularTags?: CatalogPopularTag[];
}

/** The flat, independently-browsable Therapist listing entry (`GET /catalog/therapists`) —
 *  unlike `CatalogVendorTherapist` above (nested under a vendor storefront), this also carries
 *  `vendor`/`branch`, since a customer browsing Therapists directly never picks a Deal/vendor
 *  first (see msd-api's PUBLIC_THERAPIST_LISTING_SELECT doc comment). */
export interface CatalogTherapist extends CatalogVendorTherapist {
  vendor: { id: string; slug: string | null; businessName: string | null; city: string | null; logoUrl: string | null } | null;
  branch: { id: string; name: string; city: string | null; address: string | null; latitude: string | null; longitude: string | null } | null;
  /** See `CatalogDeal`'s identical field doc comment. */
  distanceKm?: number | null;
}

export interface CatalogVendorBranch {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  openingHours: CatalogOpeningHours | null;
  /** Decimal → string over the wire, nullable — see `CatalogDeal.branch`'s identical field doc
   *  comment. Used client-side to resolve the customer's nearest branch (never fabricated). */
  latitude: string | null;
  longitude: string | null;
  therapists: CatalogVendorTherapist[];
}

export interface CatalogVendorDetail {
  id: string;
  slug: string;
  businessName: string;
  businessDescription: string | null;
  logoUrl: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  branches: CatalogVendorBranch[];
}

/** A comma-joined list param, or undefined when empty (so it is left out of the query). */
const joinList = (values?: string[]) => (values?.length ? values.join(',') : undefined);

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listCatalogCategories() {
  return apiGet<CatalogCategoryWithChildren[]>('/catalog/categories', null);
}

export function getCatalogCategory(slug: string) {
  return apiGet<CatalogCategoryWithChildren>(`/catalog/categories/${encodeURIComponent(slug)}`, null);
}

/** Mirrors msd-api's `CatalogDealQuerySchema.sort`/`CatalogProductQuerySchema.sort` enums. */
export type CatalogDealSort = 'relevance' | 'price_asc' | 'price_desc' | 'distance' | 'newest' | 'discount';
export type CatalogProductSort = 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'discount';

export interface CatalogPopularTreatmentGroup {
  id: string;
  name: string;
  slug: string;
  treatments: CatalogPopularTreatmentGroup[];
}

/** Public home page Treatment directory — active groups only, each holding only its own active
 *  treatments (server-filtered; see msd-api's `popular-treatment.service.ts#getPublicTreatmentDirectory`). */
export function listCatalogPopularTreatments() {
  return apiGet<CatalogPopularTreatmentGroup[]>('/catalog/popular-treatments', null);
}

/** One CTA banner for a slot (docs/msd/PLANNING.md §6): the visitor's state's banners, else the
 *  Global/Default ones (msd-api `promotion.service.ts#getPublicBanners`). `image` is a raw
 *  `storageKey` (or `null`) — pass it through `resolveMediaUrl` from `api/media.ts`. `href` is an
 *  in-app path built by the server. */
export interface CatalogBanner {
  id: string;
  title: string;
  description: string | null;
  buttonLabel: string | null;
  backgroundRole: BannerColorRole;
  buttonRole: BannerColorRole;
  href: string;
  image: string | null;
}

export function listCatalogBanners(slot: BannerSlot, state?: string | null) {
  const qs = new URLSearchParams({ slot, ...(state ? { state } : {}) });
  return apiGet<CatalogBanner[]>(`/catalog/banners?${qs}`, null);
}

/** Public Home Hero slider of deals and products — `state: null` means the Global/Default slider
 *  served (the requested state has no publishable slider yet, or none was requested). `slides` is
 *  empty when even the Global/Default slider isn't publishable (fewer than 5 eligible items). */
export type CatalogHomeHeroSlide =
  | { id: string; type: 'deal'; deal: CatalogDeal }
  | { id: string; type: 'product'; product: CatalogProduct };

export interface CatalogHomeHero {
  state: string | null;
  slides: CatalogHomeHeroSlide[];
}

export function getCatalogHomeHero(state?: string) {
  return apiGet<CatalogHomeHero>(`/catalog/home-hero${state ? `?state=${encodeURIComponent(state)}` : ''}`, null);
}

/** Public Home Tag Section rails — New / Deal / Hot Deal / Expire soon (docs/msd/PLANNING.md
 *  §7.1). Each tag resolves independently to the visitor's state or Global/Default; a tag with
 *  no eligible section anywhere is simply absent from the array. */
export type CatalogHomeTagSectionTag = 'NEW' | 'DEAL' | 'HOT_DEAL' | 'EXPIRE_SOON';

export interface CatalogHomeTagSection {
  tag: CatalogHomeTagSectionTag;
  title: string;
  state: string | null;
  deals: CatalogDeal[];
}

export function getCatalogHomeTagSections(state?: string) {
  return apiGet<CatalogHomeTagSection[]>(`/catalog/home-tag-sections${state ? `?state=${encodeURIComponent(state)}` : ''}`, null);
}

export interface CatalogDealListOptions {
  page?: number;
  pageSize?: number;
  categoryId?: string;
  subcategoryId?: string;
  vendorId?: string;
  branchId?: string;
  /** Comma-joined server-side; wins over the single `vendorId`/`branchId` above when both are given. */
  vendorIds?: string[];
  branchIds?: string[];
  search?: string;
  state?: string;
  city?: string;
  sort?: CatalogDealSort;
  minPrice?: number;
  maxPrice?: number;
  /** From `useVisitorLocation()`'s `coords` — when both are present, results come back
   *  nearest-first with a real `distanceKm` per item; omitted → unchanged behavior. */
  latitude?: number;
  longitude?: number;
  /** Radius in km around `latitude`/`longitude`; ignored without coordinates. */
  radiusKm?: number;
  /** Only items whose card tag is one of these. */
  tags?: CatalogOfferTag[];
}

const dealQuery = ({ vendorIds, branchIds, tags, ...rest }: Omit<CatalogDealListOptions, 'sort'> & { sort?: string }) =>
  toQuery({ ...rest, vendorIds: joinList(vendorIds), branchIds: joinList(branchIds), tags: joinList(tags) });

export function listCatalogDeals(opts: CatalogDealListOptions = {}) {
  return apiGet<CatalogDeal[]>(`/catalog/deals${dealQuery(opts)}`, null);
}

export interface CatalogDealFacets {
  vendors: { id: string; name: string; count: number }[];
  branches: { id: string; name: string; city: string | null; vendorName: string; count: number }[];
  distance: { km: number; count: number }[];
  price: { min: number; max: number } | null;
  /** Count per card tag (every tag, zeros included); absent on therapist facets. */
  tags?: { tag: CatalogOfferTag; count: number }[];
}

/** Filter-panel counts for the same filters as `listCatalogDeals` (no paging/sort). */
export function getCatalogDealFacets(opts: Omit<CatalogDealListOptions, 'page' | 'pageSize' | 'sort'> = {}) {
  return apiGet<CatalogDealFacets>(`/catalog/deals/facets${dealQuery(opts)}`, null);
}

/** The deal page (`GET /catalog/deals/:idOrSlug`): a UUID, the current slug or an old slug. The
 *  response always carries the current `slug` (PLANNING §2.7 URLs). */
export function getCatalogDeal(idOrSlug: string) {
  return apiGet<CatalogDealDetail>(`/catalog/deals/${encodeURIComponent(idOrSlug)}`, null);
}

/** Product is a fully independent, directly-purchasable catalog entity (see msd-api's Product
 *  schema doc comment) — never nested under or fetched through a Deal. No branch/location
 *  fields (Product has no branchId) and no `packages` (no duration/tier concept applies). */
export interface CatalogProduct {
  id: string;
  tag?: CatalogOfferTag | null;
  name: string;
  slug: string;
  brand: string | null;
  /** Rich HTML (sky-rich-text-editor), already server-sanitized — render via
   *  `dangerouslySetInnerHTML`, never as plain text (see product-detail.tsx). */
  description: string | null;
  summary: string | null;
  /** Rich HTML, same as `description` — previously saved by vendors but never exposed/rendered
   *  on the public page; now shown in its own accordion section. */
  returnPolicy: string | null;
  image: string | null;
  imageAlt: string | null;
  price: string;
  originalPrice: string | null;
  discount: number | null;
  category: CatalogCategory | null;
  subcategory: CatalogCategory | null;
  vendor: { id: string; slug: string | null; businessName: string | null; city: string | null; logoUrl: string | null } | null;
  mediaImages?: MediaImage[];
  mediaVideo?: MediaVideo | null;
  popularTags?: CatalogPopularTag[];
}

export interface CatalogProductListOptions {
  page?: number;
  pageSize?: number;
  categoryId?: string;
  /** Top-level category ids; win over `categoryId`. */
  categoryIds?: string[];
  subcategoryId?: string;
  vendorId?: string;
  /** Business (member) ids, the Business filter (item 4); win over `vendorId`. */
  vendorIds?: string[];
  search?: string;
  sort?: CatalogProductSort;
  minPrice?: number;
  maxPrice?: number;
  tags?: CatalogOfferTag[];
}

const productQuery = ({ categoryIds, vendorIds, tags, ...rest }: CatalogProductListOptions) =>
  toQuery({ ...rest, categoryIds: joinList(categoryIds), vendorIds: joinList(vendorIds), tags: joinList(tags) });

export function listCatalogProducts(opts: CatalogProductListOptions = {}) {
  return apiGet<CatalogProduct[]>(`/catalog/products${productQuery(opts)}`, null);
}

export interface CatalogProductFacets {
  categories: { id: string; name: string; slug: string; count: number }[];
  vendors: { id: string; name: string; count: number }[];
  tags: { tag: CatalogOfferTag; count: number }[];
  price: { min: number; max: number } | null;
}

/** Filter-panel counts for the same filters as `listCatalogProducts` (no paging/sort). */
export function getCatalogProductFacets(opts: Omit<CatalogProductListOptions, 'page' | 'pageSize' | 'sort'> = {}) {
  return apiGet<CatalogProductFacets>(`/catalog/products/facets${productQuery(opts)}`, null);
}

export function getCatalogProduct(id: string) {
  return apiGet<CatalogProduct>(`/catalog/products/${id}`, null);
}

/** Distinct `{state, city}` pairs from active branches — drives the public State/City picker
 *  (Explore's location filter, etc.) without fetching every branch. */
export function listCatalogLocations() {
  return apiGet<CatalogLocation[]>('/catalog/locations', null);
}

export function getCatalogVendor(slug: string, opts: { state?: string; city?: string } = {}) {
  return apiGet<CatalogVendorDetail>(`/catalog/vendors/${encodeURIComponent(slug)}${toQuery(opts)}`, null);
}

export type CatalogTherapistSort = 'relevance' | 'price_asc' | 'price_desc' | 'distance';

export interface CatalogTherapistListOptions {
  page?: number;
  pageSize?: number;
  categoryId?: string;
  subcategoryId?: string;
  vendorId?: string;
  branchId?: string;
  vendorIds?: string[];
  branchIds?: string[];
  search?: string;
  state?: string;
  city?: string;
  /** Price = the lowest active package; sorted and paged server-side. */
  sort?: CatalogTherapistSort;
  minPrice?: number;
  maxPrice?: number;
  radiusKm?: number;
  /** See `listCatalogDeals`'s identical param doc comment. */
  latitude?: number;
  longitude?: number;
}

const therapistQuery = ({ vendorIds, branchIds, ...rest }: CatalogTherapistListOptions) =>
  toQuery({ ...rest, vendorIds: joinList(vendorIds), branchIds: joinList(branchIds) });

export function listCatalogTherapists(opts: CatalogTherapistListOptions = {}) {
  return apiGet<CatalogTherapist[]>(`/catalog/therapists${therapistQuery(opts)}`, null);
}

/** Vendor, branch, distance and price ("From" price) counts for the therapist list. */
export function getCatalogTherapistFacets(opts: Omit<CatalogTherapistListOptions, 'page' | 'pageSize' | 'sort'> = {}) {
  return apiGet<CatalogDealFacets>(`/catalog/therapists/facets${therapistQuery(opts)}`, null);
}

export function getCatalogTherapist(id: string) {
  return apiGet<CatalogTherapist>(`/catalog/therapists/${id}`, null);
}

// ─── CMS (About Us / Contact Us) — same "no auth, one function per public GET" discipline as
// every other function in this file. Blog Post reads live in `apps/msd/src/blog/blog.ts`
// instead (that module's own doc comment anticipates being the one file that swaps from static
// data to the real API), so they are not duplicated here. ─────────────────────────────────────

/** Singleton row (see msd-api's `AboutUsContent` schema doc comment) — `GET /catalog/about-us`
 *  always returns the current saved content, created on first admin save. */
export interface CatalogAboutUs {
  id: string;
  heroTitle: string;
  heroSubtitle: string;
  missionStatement: string;
  body: BlogBlock[];
  metaTitle?: string | null;
  metaDescription?: string | null;
  updatedAt: string;
  mediaImages: MediaImage[];
}

export interface CatalogSocialLink {
  platform: string;
  url: string;
}

/** Same singleton-row convention as `CatalogAboutUs` above — no media (a contact page has no
 *  gallery need, see msd-api's `ContactUsContent` schema doc comment). */
export interface CatalogContactUs {
  id: string;
  address: string;
  phone: string;
  email: string;
  mapEmbedUrl: string;
  socialLinks: CatalogSocialLink[];
  metaTitle?: string | null;
  metaDescription?: string | null;
  updatedAt: string;
}

export function getCatalogAboutUs() {
  return apiGet<CatalogAboutUs>('/catalog/about-us', null);
}

export function getCatalogContactUs() {
  return apiGet<CatalogContactUs>('/catalog/contact-us', null);
}

/** `GET /catalog/faqs` — always `isActive` only, ordered by `sortOrder` (see msd-api's `Faq`
 *  schema doc comment). No pagination — the home page's FAQ accordion renders the whole list. */
export interface CatalogFaq {
  id: string;
  question: string;
  answer: string;
}

export function listCatalogFaqs() {
  return apiGet<CatalogFaq[]>('/catalog/faqs', null);
}

// ─── CMS (Blog categories / Website pages / How It Works / Careers / Social links) — same
// "no auth, one function per public GET" discipline as every other function in this file. ──────

/** `GET /catalog/blog-categories` — always `isActive: true`, ordered (see msd-api's
 *  `listPublicBlogCategories` doc comment). Drives the Blog index's category filter facet. */
export interface CatalogBlogCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

export function listCatalogBlogCategories() {
  return apiGet<CatalogBlogCategory[]>('/catalog/blog-categories', null);
}

/** One of the 4 fixed `WebsitePage` rows (privacy/terms/accessibility/cookies) — always
 *  `status: 'PUBLISHED'` server-side (see msd-api's `getPublicWebsitePageBySlugOrThrow`).
 *  `content` is a `BlogBlock[]`, same convention as `CatalogAboutUs.body` above, rendered with
 *  `blog-detail.tsx`'s shared `renderBlock`. */
export interface CatalogWebsitePage {
  id: string;
  slug: string;
  title: string;
  content: BlogBlock[];
  metaTitle?: string | null;
  metaDescription?: string | null;
  updatedAt?: string;
}

export function getCatalogPage(slug: string) {
  return apiGet<CatalogWebsitePage>(`/catalog/pages/${encodeURIComponent(slug)}`, null);
}

/** Singleton row (same convention as `CatalogAboutUs`/`CatalogContactUs`) — the public "How It
 *  Works" page's hero copy. */
export interface CatalogHowItWorksContent {
  heroTitle: string;
  heroSubtitle: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
}

/** One active step in the public "How It Works" flow, ordered by `sortOrder` (see msd-api's
 *  `getPublicHowItWorks` doc comment). `icon` is a Material Symbols icon name, rendered via
 *  `<md-icon>`/`Icon` — falsy for a step with no icon chosen yet. */
export interface CatalogHowItWorksStep {
  id: string;
  title: string;
  description: string;
  icon?: string | null;
  sortOrder: number;
}

export interface CatalogHowItWorks {
  content: CatalogHowItWorksContent;
  steps: CatalogHowItWorksStep[];
}

export function getCatalogHowItWorks() {
  return apiGet<CatalogHowItWorks>('/catalog/how-it-works', null);
}

/** Singleton row (same convention as `CatalogHowItWorksContent`) — the public "Careers" page's
 *  hero copy. */
export interface CatalogCareersContent {
  heroTitle: string;
  heroSubtitle: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
}

/** One `PUBLISHED` job listing (see msd-api's `getPublicCareers` doc comment) — `applyUrl` and
 *  `applyInstructions` are both optional; a listing shows whichever one the admin filled in. */
export interface CatalogCareersJob {
  id: string;
  jobTitle: string;
  department: string;
  location: string;
  employmentType: string;
  description: string;
  responsibilities: string;
  requirements: string;
  applyUrl?: string | null;
  applyInstructions?: string | null;
}

export interface CatalogCareers {
  content: CatalogCareersContent;
  jobs: CatalogCareersJob[];
}

export function getCatalogCareers() {
  return apiGet<CatalogCareers>('/catalog/careers', null);
}

/** `GET /catalog/social-links` — always `isActive: true`, ordered (see msd-api's
 *  `listPublicSocialMediaLinks` doc comment). `platform` is freeform text (facebook/instagram/
 *  youtube/linkedin/x/whatsapp/...); the frontend maps known keys to icons with a generic
 *  fallback for anything else (see `footer.tsx`'s `SOCIAL_ICONS`). */
export interface CatalogSocialMediaLink {
  id: string;
  platform: string;
  displayName: string;
  url: string;
}

export function listCatalogSocialLinks() {
  return apiGet<CatalogSocialMediaLink[]>('/catalog/social-links', null);
}
