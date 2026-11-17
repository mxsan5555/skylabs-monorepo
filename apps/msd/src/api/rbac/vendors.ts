import { apiGet, apiPatch, apiPost, apiDelete, apiPostForm } from './client';
import type { MediaImage, MediaVideo } from '../media';

export type VendorStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type MemberStatus = VendorStatus;

export type KycStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
export type DealStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED';

/** Deprecated — the old pasted-URL KYC shape, kept only so `Vendor.kycDocuments` (legacy rows)
 *  still types correctly. Real KYC documents are `VendorDocument` below. */
export interface KycDocument {
  type: string;
  url: string;
  uploadedAt?: string;
}

export type VendorDocumentType = 'GST' | 'PAN' | 'AADHAAR';

export type MemberDocumentStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

/** What a member response carries for each document: type and status only. The file fields and
 *  the masked number come from the documents endpoints, and only for viewers allowed to see them. */
export interface MemberDocumentSummary {
  id: string;
  documentType: VendorDocumentType;
  status: MemberDocumentStatus;
}

/** A real uploaded KYC document — one per `documentType`, replacing the deprecated
 *  `KycDocument`/pasted-URL shape (see msd-api's `VendorDocument` model doc comment). */
export interface VendorDocument {
  id: string;
  documentType: VendorDocumentType;
  /** Signed link to the private file; expires after 5 minutes, so lists are refetched to reopen. */
  fileUrl: string | null;
  originalFilename: string | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/** Minimal, non-sensitive summary of a User — no session/token data — used both by the
 *  "select existing user" search results and to display a vendor's linked "Vendor Account". */
export interface UserSummary {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status: 'active' | 'inactive' | 'blocked';
  roles: { id: string; key: string; name: string }[];
}

/** Every editable Vendor field — matches `VendorFieldsSchema` in msd-api's `vendor.schema.ts`.
 *  `businessName` is optional here (the admin pipeline's Step 1 persists a Vendor with only
 *  `ownerUserId` set) — `Vendor` below narrows it to `string | null` for the read shape. */
export interface VendorFields {
  businessName?: string;
  legalName?: string;
  businessType?: string;
  businessDescription?: string;
  businessEmail?: string;
  businessPhone?: string;
  alternatePhone?: string;
  website?: string;
  logoUrl?: string;
  ownerFirstName?: string;
  ownerLastName?: string;
  contactPerson?: string;
  ownerEmail?: string;
  ownerMobile?: string;
  alternateOwnerMobile?: string;
  address?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  /** A pasted Google Maps URL — the server resolves it into `latitude`/`longitude` (see
   *  `googleMapsUrlResolver.provider.ts` in msd-api). Replaces the old directly-editable
   *  `latitude`/`longitude` number fields; those remain on the `Vendor` read shape below
   *  (still returned, still Decimal-as-string over JSON) but are no longer client-supplied. */
  mapLocationUrl?: string;
  gstNumber?: string;
  panNumber?: string;
  businessRegistrationNumber?: string;
  kycDocuments?: KycDocument[];
  bankAccountHolder?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  upiId?: string;
}

export interface Vendor extends Omit<VendorFields, 'businessName'> {
  id: string;
  businessName: string | null;
  /** Public storefront URL slug (`/vendor/:slug`) — generated server-side from `businessName` at
   *  creation time, never client-supplied or client-editable (see msd-api's `lib/slug.ts`). */
  slug: string | null;
  /** Still returned by the API (Decimal columns, serialized as strings over JSON — same
   *  convention as every other Decimal field in this codebase) even though `mapLocationUrl` is
   *  now the only client-editable location input; resolved server-side from `mapLocationUrl`. */
  latitude?: number | null;
  longitude?: number | null;
  ownerUserId: string | null;
  /** Per-vendor commission override for Member Settlements — `null` means "use
   *  `FinanceSettings.defaultCommissionRatePercent`" (see `api/rbac/settlements.ts`'s
   *  `setVendorCommissionRate`). Returned as-is by `GET /vendors/:id` (no `select` narrowing on
   *  the backend — `serializeVendor` spreads every scalar column). */
  commissionRatePercent?: string | null;
  kycStatus: KycStatus;
  kycRejectionReason: string | null;
  status: VendorStatus;
  statusReason: string | null;
  createdByUserId: string | null;
  /** The creator's display name, resolved server-side — `null` for self-registered vendors
   *  (`createdByUserId` itself is `null`) and for any historical row whose creator no longer
   *  resolves. The UI shows "Not recorded" for either case rather than inventing a creator. */
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Dormant business-module flags (D10: categories are open to every member); nothing reads
   *  them. Dropped with the grant tables in the contract phase. */
  offersService: boolean;
  offersProduct: boolean;
  offersTherapy: boolean;
  /** Every row, including drafts and inactive items. */
  _count?: { branches: number; deals: number; products: number; therapists: number };
  /** Distinct customers and orders with an order line from this member. Only on the member detail
   *  (`GET /members/:id`), same rows as the Customers list (P10-49). */
  customerCount?: number;
  orderCount?: number;
  /** Active branches/products/therapists and ACTIVE + APPROVED deals. Only on `GET /vendors` and
   *  `GET /vendors/:id`. Show it as "live of total" next to `_count`. */
  liveCounts?: { branches: number; deals: number; products: number; therapists: number };
  /** Only present on `GET /vendors/me` — the self-service "complete your profile" checklist. */
  profileCompletion?: { percent: number; sections: { key: string; label: string; complete: boolean }[] };
  /** The existing User account this vendor is linked to — null if an admin created the
   *  profile without linking an owner yet. Never includes session/auth data. */
  owner: UserSummary | null;
  /** Uploaded media (shared Deal/Product/Therapist/Vendor system) — the authoritative image/
   *  video source going forward; `logoUrl` above is the legacy pasted-URL field, kept only for
   *  rows that predate this table (see `resolveVendorMedia` in `utils/media.ts`). */
  mediaImages?: MediaImage[];
  mediaVideo?: MediaVideo | null;
  /** Type and status of each uploaded document. Load files with `listMyKycDocuments` or
   *  `listVendorKycDocuments`. `kycDocuments` above is the deprecated pasted-URL shape. */
  documents?: MemberDocumentSummary[];
  statusChangedAt?: string | null;
  documentsDueAt?: string | null;
  reviewFlaggedAt?: string | null;
  documentsSummary?: {
    complete: boolean;
    missing: VendorDocumentType[];
    rejected: VendorDocumentType[];
    dueAt: string | null;
    overdue: boolean;
  };
}

export interface VendorApplicationInput {
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerMobile: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

export interface VendorApplicationResponse {
  id: string;
  status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  message: string;
  createdAt: string;
}

export type VendorCreateInput = VendorFields & { ownerUserId?: string };
export type VendorUpdateInput = Partial<VendorCreateInput>;
export type VendorSelfInput = Partial<VendorFields> & Pick<VendorFields, 'businessName'>;
export type VendorSelfUpdateInput = Partial<VendorFields>;

// ─── KYC documents (real file upload) — self-service ─────────────────────────────────────────

export function listMyKycDocuments(token: string | null) {
  return apiGet<VendorDocument[]>('/vendors/me/kyc-documents', token);
}

export function uploadMyKycDocument(token: string | null, documentType: VendorDocumentType, file: Blob, filename: string) {
  const formData = new FormData();
  formData.append('file', file, filename);
  return apiPostForm<VendorDocument>(`/vendors/me/kyc-documents/${documentType}`, token, formData);
}

export function deleteMyKycDocument(token: string | null, documentType: VendorDocumentType) {
  return apiDelete<{ deleted: true }>(`/vendors/me/kyc-documents/${documentType}`, token);
}

// ─── KYC documents (real file upload) — admin-on-behalf ──────────────────────────────────────

export function listVendorKycDocuments(token: string | null, vendorId: string) {
  return apiGet<VendorDocument[]>(`/vendors/${vendorId}/kyc-documents`, token);
}

export function uploadVendorKycDocument(token: string | null, vendorId: string, documentType: VendorDocumentType, file: Blob, filename: string) {
  const formData = new FormData();
  formData.append('file', file, filename);
  return apiPostForm<VendorDocument>(`/vendors/${vendorId}/kyc-documents/${documentType}`, token, formData);
}

export function deleteVendorKycDocument(token: string | null, vendorId: string, documentType: VendorDocumentType) {
  return apiDelete<{ deleted: true }>(`/vendors/${vendorId}/kyc-documents/${documentType}`, token);
}

/** One weekday's opening hours — `open: false` means closed all day (start/end are then
 *  ignored/omitted). Stored as `Branch.openingHours` Json — this shape is a frontend convention
 *  only, not enforced by a backend schema (the column is a loosely-structured `Json?`). */
export interface DayHours {
  open: boolean;
  start?: string;
  end?: string;
}

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type OpeningHours = Partial<Record<WeekdayKey, DayHours>>;

export interface Branch {
  id: string;
  vendorId: string;
  name: string;
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Still returned by the API — the pasted URL the vendor supplied, from which `latitude`/
   *  `longitude` above were resolved server-side (see `googleMapsUrlResolver.provider.ts`). */
  mapLocationUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  openingHours?: OpeningHours | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { deals: number };
  /** Only present on the cross-vendor `GET /vendors/branches` sidebar listing. */
  vendor?: { id: string; businessName: string | null };
}

export interface BranchInput {
  name: string;
  address?: string;
  addressLine2?: string;
  /** From the India location list (`@skylabs-monorepo/shared-utils`); required with `state`. */
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  /** A pasted Google Maps URL — the server resolves it into `latitude`/`longitude`. Replaces the
   *  old directly-editable `latitude`/`longitude` number fields. */
  mapLocationUrl?: string;
  phone?: string;
  email?: string;
  openingHours?: OpeningHours;
}

export type CategoryType = 'SERVICE' | 'PRODUCT' | 'THERAPY';

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
  /** Only ever set on a top-level row (`parentId: null`) — a subcategory inherits its parent's
   *  type by join, never duplicated here (see msd-api's `category.service.ts`). */
  type?: CategoryType | null;
}

export type DealCancellationPolicy = 'FREE_24H' | 'FREE_48H' | 'NON_REFUNDABLE';

export interface DealFaq {
  id?: string;
  question: string;
  answer: string;
}

/** A deal in the console (docs/msd/PLANNING.md §2.7). Prices, discount and duration are the
 *  server's cache of the cheapest active package; never sent back. */
export interface Deal {
  id: string;
  vendorId: string;
  branchId: string;
  categoryId: string;
  subcategoryId: string | null;
  title: string;
  slug: string;
  /** Same text as `tagline` (stored in `shortDescription`). */
  shortDescription?: string | null;
  tagline?: string | null;
  highlights?: string[];
  description?: string | null;
  originalPrice: string;
  salePrice: string;
  discountPercent?: number | null;
  durationMinutes?: number | null;
  termsAndConditions?: string | null;
  bookingRequired?: boolean;
  bookingInstructions?: string | null;
  cancellationPolicy?: DealCancellationPolicy;
  cancellationNote?: string | null;
  eligibility?: string[];
  validityDays?: number | null;
  limitPerCustomer?: number | null;
  /** Total stock; `stockLeft` is what is still for sale. */
  maxBookings?: number | null;
  stockLeft?: number | null;
  images?: string[] | null;
  startDate?: string | null;
  endDate?: string | null;
  publishedAt?: string | null;
  previousSlugs?: string[];
  status: DealStatus;
  createdAt: string;
  updatedAt: string;
  category?: Category | { id: string; name: string };
  subcategory?: Category | { id: string; name: string } | null;
  /** Only present on the cross-vendor `GET /vendors/deals` sidebar listing. */
  vendor?: { id: string; businessName: string | null };
  branch?: { id: string; name: string; city?: string | null; state?: string | null; isActive?: boolean };
  packages?: DealPackage[];
  faqs?: DealFaq[];
  /** Uploaded media; `images` above is the legacy URL field (see `resolveDealMedia`). */
  mediaImages?: MediaImage[];
  mediaVideo?: MediaVideo | null;
  therapists?: { id: string; personName: string; therapistType: string; isActive: boolean }[];
}

export interface DealPackage {
  id: string;
  dealId: string;
  name: string | null;
  durationMinutes: number;
  persons: number;
  sellingPrice: string;
  originalPrice: string | null;
  inclusions: string[];
  isActive: boolean;
  sortOrder: number;
  discountPercent?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

/** One package card. */
export interface DealPackageInput {
  name?: string;
  durationMinutes: number;
  persons: number;
  sellingPrice: number;
  originalPrice?: number;
  inclusions: string[];
  isActive: boolean;
}

/** Create body (`DealCreate`, API.md §2.1). */
export interface DealInput {
  categoryId: string;
  subcategoryId?: string;
  title: string;
  slug?: string;
  tagline?: string;
  highlights?: string[];
  description?: string;
  startDate?: string;
  endDate?: string;
  validityDays?: number;
  maxBookings?: number;
  limitPerCustomer?: number;
  bookingRequired?: boolean;
  bookingInstructions?: string;
  cancellationPolicy?: DealCancellationPolicy;
  cancellationNote?: string;
  eligibility?: string[];
  termsAndConditions?: string;
  faqs?: { question: string; answer: string }[];
  therapistIds?: string[];
  packages: DealPackageInput[];
}

/** Update body: packages have their own routes; `null` clears an optional field. */
export type DealUpdateInput = Partial<
  Omit<DealInput, 'packages' | 'subcategoryId' | 'startDate' | 'endDate' | 'validityDays' | 'maxBookings' | 'limitPerCustomer'>
> & {
  subcategoryId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  validityDays?: number | null;
  maxBookings?: number | null;
  limitPerCustomer?: number | null;
};

export type DealPackageUpdateInput = Partial<Omit<DealPackageInput, 'name' | 'originalPrice'>> & {
  name?: string | null;
  originalPrice?: number | null;
};

/** Who is editing: the member on their own business (`/vendors/me`) or staff for a member
 *  (`/vendors/:vendorId`). Same routes and bodies on both (API.md §2.2). */
export type DealSurface = { kind: 'member' } | { kind: 'staff'; vendorId: string };

/** All deal calls for one surface. */
export function dealApi(token: string | null, surface: DealSurface) {
  const root = surface.kind === 'member' ? '/vendors/me' : `/vendors/${surface.vendorId}`;
  const deal = (branchId: string, dealId: string) => `${root}/branches/${branchId}/deals/${dealId}`;
  return {
    listAll: () => apiGet<Deal[]>(`${root}/deals`, token),
    list: (branchId: string) => apiGet<Deal[]>(`${root}/branches/${branchId}/deals`, token),
    get: (branchId: string, dealId: string) => apiGet<Deal>(deal(branchId, dealId), token),
    create: (branchId: string, input: DealInput) => apiPost<Deal>(`${root}/branches/${branchId}/deals`, token, input),
    update: (branchId: string, dealId: string, input: DealUpdateInput) => apiPatch<Deal>(deal(branchId, dealId), token, input),
    setStatus: (branchId: string, dealId: string, status: Exclude<DealStatus, 'EXPIRED'>) =>
      apiPatch<Deal>(`${deal(branchId, dealId)}/status`, token, { status }),
    copy: (branchId: string, dealId: string, targetBranchId: string) =>
      apiPost<Deal>(`${deal(branchId, dealId)}/copy`, token, { branchId: targetBranchId }),
    /** Staff only (Super Admin on the server). */
    remove: (branchId: string, dealId: string) => apiDelete<null>(deal(branchId, dealId), token),
    addPackage: (branchId: string, dealId: string, input: DealPackageInput) => apiPost<Deal>(`${deal(branchId, dealId)}/packages`, token, input),
    updatePackage: (branchId: string, dealId: string, packageId: string, input: DealPackageUpdateInput) =>
      apiPatch<Deal>(`${deal(branchId, dealId)}/packages/${packageId}`, token, input),
    deletePackage: (branchId: string, dealId: string, packageId: string) => apiDelete<Deal>(`${deal(branchId, dealId)}/packages/${packageId}`, token),
    reorderPackages: (branchId: string, dealId: string, packageIds: string[]) =>
      apiPatch<Deal>(`${deal(branchId, dealId)}/packages/reorder`, token, { packageIds }),
    setImageAlt: (branchId: string, dealId: string, imageId: string, altText: string) =>
      apiPatch<MediaImage>(`${deal(branchId, dealId)}/images/${imageId}`, token, { altText }),
  };
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

// ─── Admin surface ───────────────────────────────────────────────────────────

export function listVendors(
  token: string | null,
  opts: { page?: number; pageSize?: number; search?: string; status?: VendorStatus } = {},
) {
  return apiGet<Vendor[]>(`/vendors${toQuery(opts)}`, token);
}

/** Cross-vendor branch list for the sidebar's standalone "Branches" page. */
export function listAllBranches(token: string | null, opts: { page?: number; pageSize?: number; search?: string } = {}) {
  return apiGet<Branch[]>(`/vendors/branches${toQuery(opts)}`, token);
}

/** Cross-vendor deal list for the sidebar's standalone "Deals" page, and (with `state`) for the
 *  Home Hero admin screen's "search deals in this state" Deal picker — each row carries an
 *  `eligible` flag (same bar as the public `VISIBLE_DEAL_WHERE`) so the picker can show why a
 *  deal isn't eligible yet without silently filtering it out. */
export function listAllDeals(
  token: string | null,
  opts: { page?: number; pageSize?: number; search?: string; state?: string } = {},
) {
  return apiGet<(Deal & { eligible?: boolean })[]>(`/vendors/deals${toQuery(opts)}`, token);
}

/** Cross-vendor therapist list for the sidebar's standalone "Therapists" page. */
export function listAllTherapists(token: string | null, opts: { page?: number; pageSize?: number; search?: string } = {}) {
  return apiGet<CrossVendorTherapist[]>(`/vendors/therapists${toQuery(opts)}`, token);
}

export function createVendor(token: string | null, input: VendorCreateInput) {
  return apiPost<Vendor>('/vendors', token, input);
}

/** Public, unauthenticated "Become a Vendor" registration (`POST /vendors/public/register`). No
 *  token is sent. Registration is closed: staff create every member, so the server always answers
 *  403 with a "contact our team" message and creates nothing. Rate limited server-side; a 429
 *  surfaces as an ordinary `ApiRequestError` with code `RATE_LIMITED`. */
export function registerPublicVendor(input: VendorSelfInput) {
  return apiPost<Vendor>('/vendors/public/register', null, input);
}

export function getVendor(token: string | null, id: string) {
  return apiGet<Vendor>(`/vendors/${id}`, token);
}

/** Existing-user typeahead for "Add Vendor → Select Existing User" — reuses the same
 *  search/pagination shape as the RBAC Users screen, scoped to the `vendors:create` permission. */
export function searchUsersForVendor(token: string | null, q: string) {
  return apiGet<UserSummary[]>(`/vendors/users/search${toQuery({ q })}`, token);
}

export interface VendorOwnerAvailability {
  available: boolean;
  conflicts: ('email' | 'phone')[];
}

/** "Add Vendor" owner-identity AVAILABILITY preview (`GET /vendors/users/lookup`) — UX only. A
 *  Vendor's owner is always a brand-new User (see msd-api's `createVendorOwner` doc comment) —
 *  this just lets the frontend show "already taken" before the admin fills in the rest of the
 *  form; `createVendor`/`registerPublicVendor` always re-check independently regardless of what
 *  this returned (backend is always the source of truth). */
export function getVendorOwnerAvailability(token: string | null, opts: { email?: string; mobile?: string }) {
  return apiGet<VendorOwnerAvailability>(`/vendors/users/lookup${toQuery(opts)}`, token);
}

export function updateVendor(token: string | null, id: string, input: VendorUpdateInput) {
  return apiPatch<Vendor>(`/vendors/${id}`, token, input);
}

export function listBranches(token: string | null, vendorId: string) {
  return apiGet<Branch[]>(`/vendors/${vendorId}/branches`, token);
}

export function createBranch(token: string | null, vendorId: string, input: BranchInput) {
  return apiPost<Branch>(`/vendors/${vendorId}/branches`, token, input);
}

export function updateBranch(token: string | null, vendorId: string, branchId: string, input: Partial<BranchInput>) {
  return apiPatch<Branch>(`/vendors/${vendorId}/branches/${branchId}`, token, input);
}

export function setBranchStatus(token: string | null, vendorId: string, branchId: string, isActive: boolean) {
  return apiPatch<Branch>(`/vendors/${vendorId}/branches/${branchId}/status`, token, { isActive });
}

export function listDeals(token: string | null, vendorId: string, branchId: string) {
  return apiGet<Deal[]>(`/vendors/${vendorId}/branches/${branchId}/deals`, token);
}

/** A deal as seen by the admin Vendor Detail view — every deal across every branch of a given
 *  vendor (every status; admin sees the full picture), with the branch it belongs to nested in.
 *  See `GET /vendors/:vendorId/deals`, gated `vendors.deals:view` — mirrors
 *  `listVendorTherapistsForAdmin`'s own "vendor-wide, not branch-scoped" shape exactly. */
export interface AdminDeal extends Deal {
  branch: { id: string; name: string };
}

export function listVendorDealsForAdmin(token: string | null, vendorId: string) {
  return apiGet<AdminDeal[]>(`/vendors/${vendorId}/deals`, token);
}

export function setDealStatus(
  token: string | null,
  vendorId: string,
  branchId: string,
  dealId: string,
  status: DealStatus,
) {
  return apiPatch<Deal>(`/vendors/${vendorId}/branches/${branchId}/deals/${dealId}/status`, token, { status });
}

/** Hard delete (admin-on-behalf) — blocked (409) if the deal has real order/cart history; use
 *  `setDealStatus`'s INACTIVE instead in that case. */
export function deleteDeal(token: string | null, vendorId: string, branchId: string, dealId: string) {
  return apiDelete<null>(`/vendors/${vendorId}/branches/${branchId}/deals/${dealId}`, token);
}

// ─── Self-service surface ─────────────────────────────────────────────────────

export function getMyVendor(token: string | null) {
  return apiGet<Vendor>('/vendors/me', token);
}

export function updateMyVendor(token: string | null, input: VendorSelfUpdateInput) {
  return apiPatch<Vendor>('/vendors/me', token, input);
}

export function listMyBranches(token: string | null) {
  return apiGet<Branch[]>('/vendors/me/branches', token);
}

export function createMyBranch(token: string | null, input: BranchInput) {
  return apiPost<Branch>('/vendors/me/branches', token, input);
}

export function updateMyBranch(token: string | null, branchId: string, input: Partial<BranchInput>) {
  return apiPatch<Branch>(`/vendors/me/branches/${branchId}`, token, input);
}

export function setMyBranchStatus(token: string | null, branchId: string, isActive: boolean) {
  return apiPatch<Branch>(`/vendors/me/branches/${branchId}/status`, token, { isActive });
}

export function listMyDeals(token: string | null, branchId: string) {
  return apiGet<Deal[]>(`/vendors/me/branches/${branchId}/deals`, token);
}

export function setMyDealStatus(token: string | null, branchId: string, dealId: string, status: DealStatus) {
  return apiPatch<Deal>(`/vendors/me/branches/${branchId}/deals/${dealId}/status`, token, { status });
}

/** One row of the vendor's own customer list — everyone who has ordered from this vendor
 *  (Deal, Product, or Therapist alike — every purchase kind is an OrderItem). Flat, no nested
 *  objects, matching `GET /vendors/me/customers`. */
export interface CustomerRow {
  id: string;
  name: string | null;
  /** Shipping city of the customer's latest order with this member that has one. */
  city: string | null;
  /** On the member's own list, phone and email are null unless `hasOpenOrder` (D19). */
  phone: string | null;
  email: string | null;
  orderCount: number;
  lastActivityAt: string;
  /** The customer has a CONFIRMED (paid, not completed) order with this member. */
  hasOpenOrder: boolean;
}

/** The logged-in vendor's own customers, resolved server-side from the caller's JWT (never a
 *  client-supplied vendorId) — same pattern as every other `/vendors/me/*` self-service route. */
export function listMyCustomers(token: string | null, opts: { page?: number; pageSize?: number } = {}) {
  return apiGet<CustomerRow[]>(`/vendors/me/customers${toQuery(opts)}`, token);
}

/** Member-scoped single-customer lookup (name/phone/email + aggregate order/payment stats) for
 *  the vendor-facing Customer Detail page — `GET /vendors/me/customers/:customerId`, gated
 *  `vendors:custom`. 404s (never confirms existence) for a customerId unrelated to this vendor —
 *  see msd-api's `vendor.service.ts#getMyCustomerOrThrow`. */
export interface MyCustomerDetail {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  totalOrders: number;
  confirmedPaymentsTotal: number;
}

export function getMyCustomer(token: string | null, customerId: string) {
  return apiGet<MyCustomerDetail>(`/vendors/me/customers/${customerId}`, token);
}

/** A vendor's customers as seen by the admin Vendor Detail view — same shape as the vendor's own
 *  `listMyCustomers` above, scoped by an explicit `vendorId` instead of the caller's JWT. See
 *  `GET /vendors/:vendorId/customers`, gated `vendors:view` — the same permission that already
 *  guards this whole admin screen (mirrors `listVendorTherapistsForAdmin` below). */
export function listVendorCustomersForAdmin(token: string | null, vendorId: string, opts: { page?: number; pageSize?: number } = {}) {
  return apiGet<CustomerRow[]>(`/vendors/${vendorId}/customers${toQuery(opts)}`, token);
}

/** A therapist staffed at one of the vendor's own branches. Branch-scoped (not vendor-wide)
 *  because CartItem/OrderItem reference `vendorId`+`branchId` consistency — see `GET
 *  /vendors/me/branches/:branchId/therapists`. */
export interface Therapist {
  id: string;
  vendorId: string;
  branchId: string;
  /** The service/role label a customer browses by (e.g. "Legs Therapist") — distinct from
   *  `personName` below, never merged into one field. */
  therapistType: string;
  /** The actual staff member (e.g. "Ramesh Kumar"). */
  personName: string;
  gender: string | null;
  /** Free-text, historical display only — kept for backward compatibility with rows created
   *  before `specializationCategoryId` existed; new create/update flows should prefer it. */
  specialization: string | null;
  /** Restricted choice — a top-level Category with `type: THERAPY` (or one of its subcategories)
   *  that this vendor has been granted access to; validated server-side. */
  specializationCategoryId?: string | null;
  bio: string | null;
  experienceYears: number | null;
  photoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Uploaded media (shared Deal/Product/Therapist system) — the authoritative image/video
   *  source going forward; `photoUrl` above is the legacy pasted-URL field, kept only for rows
   *  that predate this table (see `resolveTherapistMedia` in `utils/media.ts`). */
  mediaImages?: MediaImage[];
  mediaVideo?: MediaVideo | null;
}

export interface TherapistInput {
  therapistType: string;
  personName: string;
  gender?: string;
  specialization?: string;
  specializationCategoryId?: string;
  bio?: string;
  experienceYears?: number;
  photoUrl?: string;
}

export function listMyTherapists(token: string | null, branchId: string) {
  return apiGet<Therapist[]>(`/vendors/me/branches/${branchId}/therapists`, token);
}

export function createTherapist(token: string | null, branchId: string, input: TherapistInput) {
  return apiPost<Therapist>(`/vendors/me/branches/${branchId}/therapists`, token, input);
}

export function updateTherapist(token: string | null, therapistId: string, input: Partial<TherapistInput>) {
  return apiPatch<Therapist>(`/vendors/me/therapists/${therapistId}`, token, input);
}

export function setTherapistStatus(token: string | null, therapistId: string, isActive: boolean) {
  return apiPatch<Therapist>(`/vendors/me/therapists/${therapistId}/status`, token, { isActive });
}

/** A therapist as seen by the admin Vendor Detail view — every therapist across every branch
 *  of a given vendor (active AND inactive; admin sees the full picture), with the branch it
 *  belongs to nested in. See `GET /vendors/:vendorId/therapists`, gated `vendors:view` — the
 *  same permission that already guards this whole admin screen. */
export interface AdminTherapist extends Therapist {
  branch: { id: string; name: string };
}

export function listVendorTherapistsForAdmin(token: string | null, vendorId: string) {
  return apiGet<AdminTherapist[]>(`/vendors/${vendorId}/therapists`, token);
}

/** A therapist as seen by the sidebar's standalone cross-vendor "Therapists" page — same shape
 *  as `AdminTherapist` plus the owning vendor, mirroring `Branch`/`Deal`'s own `vendor` field
 *  above. See `GET /vendors/therapists`, gated `vendors:view`. */
export interface CrossVendorTherapist extends AdminTherapist {
  vendor?: { id: string; businessName: string | null };
  _count?: { packages: number };
}

/** Admin-on-behalf create/update/status — lets an admin/salesperson staff a Therapist for a
 *  vendor that hasn't logged in yet (onboarding wizard Step 4). Mirrors the self-service
 *  create/update/status functions above exactly, scoped by an explicit `vendorId` instead of
 *  the caller's own JWT-derived vendor. See `POST /vendors/:vendorId/branches/:branchId/therapists`,
 *  `PATCH /vendors/:vendorId/therapists/:therapistId[/status]`. */
export function createVendorTherapist(token: string | null, vendorId: string, branchId: string, input: TherapistInput) {
  return apiPost<Therapist>(`/vendors/${vendorId}/branches/${branchId}/therapists`, token, input);
}

export function updateVendorTherapist(token: string | null, vendorId: string, therapistId: string, input: Partial<TherapistInput>) {
  return apiPatch<Therapist>(`/vendors/${vendorId}/therapists/${therapistId}`, token, input);
}

export function setVendorTherapistStatus(token: string | null, vendorId: string, therapistId: string, isActive: boolean) {
  return apiPatch<Therapist>(`/vendors/${vendorId}/therapists/${therapistId}/status`, token, { isActive });
}

/** Hard delete (admin-on-behalf) — blocked (409) if the therapist has real order/cart history;
 *  use `setVendorTherapistStatus`'s isActive=false instead in that case. */
export function deleteVendorTherapist(token: string | null, vendorId: string, therapistId: string) {
  return apiDelete<null>(`/vendors/${vendorId}/therapists/${therapistId}`, token);
}

/** A therapist's own duration/price menu entry — independent of any Deal (no Deal picker, no
 *  `dealId`; see msd-api's TherapistPackage schema doc comment). Combined with a Deal only at
 *  purchase time, by matching `durationMinutes` — never by any shared id. See `GET
 *  /vendors/me/therapists/:therapistId/packages`. */
export interface TherapistPackage {
  id: string;
  therapistId: string;
  durationMinutes: number;
  sellingPrice: string;
  originalPrice: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TherapistPackageInput {
  durationMinutes: number;
  sellingPrice: number;
  originalPrice?: number;
  isActive?: boolean;
  sortOrder?: number;
}

export function listTherapistPackages(token: string | null, therapistId: string) {
  return apiGet<TherapistPackage[]>(`/vendors/me/therapists/${therapistId}/packages`, token);
}

export function createTherapistPackage(token: string | null, therapistId: string, input: TherapistPackageInput) {
  return apiPost<TherapistPackage>(`/vendors/me/therapists/${therapistId}/packages`, token, input);
}

export function updateTherapistPackage(
  token: string | null,
  therapistId: string,
  packageId: string,
  input: Partial<TherapistPackageInput>,
) {
  return apiPatch<TherapistPackage>(`/vendors/me/therapists/${therapistId}/packages/${packageId}`, token, input);
}

export function deleteTherapistPackage(token: string | null, therapistId: string, packageId: string) {
  return apiDelete<{ deleted: boolean }>(`/vendors/me/therapists/${therapistId}/packages/${packageId}`, token);
}

// ─── Reference lookups ────────────────────────────────────────────────────────

/** Active categories for the vendor-facing dropdowns (deal, product, therapist). `type` filters
 *  by module; every member sees the same list (D10: no category grants). */
export function listCategories(token: string | null, opts: { type?: CategoryType } = {}) {
  return apiGet<Category[]>(`/vendors/categories${toQuery(opts)}`, token);
}

// ─── Product (vendor-owned catalog — self-service + admin-on-behalf, mirrors Branch/Deal) ───

export interface VendorProduct {
  id: string;
  vendorId: string;
  name: string;
  slug: string;
  brand?: string | null;
  categoryId: string;
  subcategoryId: string | null;
  description?: string | null;
  summary?: string | null;
  benefits?: string[] | null;
  howToUse?: string[] | null;
  ingredients?: string | null;
  returnPolicy?: string | null;
  image?: string | null;
  gallery?: string[] | null;
  imageAlt?: string | null;
  badge?: string | null;
  price: string;
  originalPrice?: string | null;
  discount?: number | null;
  isNew: boolean;
  isFeatured: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string };
  subcategory?: { id: string; name: string } | null;
  mediaImages?: MediaImage[];
  mediaVideo?: MediaVideo | null;
}

export interface VendorProductInput {
  name: string;
  slug: string;
  brand?: string;
  categoryId: string;
  subcategoryId?: string;
  description?: string;
  summary?: string;
  benefits?: string[];
  howToUse?: string[];
  ingredients?: string;
  returnPolicy?: string;
  image?: string;
  gallery?: string[];
  imageAlt?: string;
  badge?: string;
  price: string;
  originalPrice?: string;
  discount?: number;
  isNew?: boolean;
  isFeatured?: boolean;
}

export function listMyProducts(token: string | null, opts: { page?: number; pageSize?: number; search?: string; status?: 'active' | 'inactive' } = {}) {
  return apiGet<VendorProduct[]>(`/vendors/me/products${toQuery(opts)}`, token);
}

export function createMyProduct(token: string | null, input: VendorProductInput) {
  return apiPost<VendorProduct>('/vendors/me/products', token, input);
}

export function updateMyProduct(token: string | null, productId: string, input: Partial<VendorProductInput>) {
  return apiPatch<VendorProduct>(`/vendors/me/products/${productId}`, token, input);
}

export function setMyProductStatus(token: string | null, productId: string, isActive: boolean) {
  return apiPatch<VendorProduct>(`/vendors/me/products/${productId}/status`, token, { isActive });
}

export function deleteMyProduct(token: string | null, productId: string) {
  return apiDelete<null>(`/vendors/me/products/${productId}`, token);
}

export function listVendorProducts(
  token: string | null,
  vendorId: string,
  opts: { page?: number; pageSize?: number; search?: string; status?: 'active' | 'inactive' } = {},
) {
  return apiGet<VendorProduct[]>(`/vendors/${vendorId}/products${toQuery(opts)}`, token);
}

export function createVendorProduct(token: string | null, vendorId: string, input: VendorProductInput) {
  return apiPost<VendorProduct>(`/vendors/${vendorId}/products`, token, input);
}

export function updateVendorProduct(token: string | null, vendorId: string, productId: string, input: Partial<VendorProductInput>) {
  return apiPatch<VendorProduct>(`/vendors/${vendorId}/products/${productId}`, token, input);
}

export function setVendorProductStatus(token: string | null, vendorId: string, productId: string, isActive: boolean) {
  return apiPatch<VendorProduct>(`/vendors/${vendorId}/products/${productId}/status`, token, { isActive });
}

export function deleteVendorProduct(token: string | null, vendorId: string, productId: string) {
  return apiDelete<null>(`/vendors/${vendorId}/products/${productId}`, token);
}
