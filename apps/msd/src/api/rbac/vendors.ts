import { apiGet, apiPatch, apiPost, apiDelete } from './client';
import type { MediaImage, MediaVideo } from '../media';

export type VendorStatus =
  | 'PROFILE_INCOMPLETE'
  | 'PENDING_VERIFICATION'
  | 'APPROVED'
  | 'REJECTED'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'SUSPENDED';

export type KycStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
export type DealStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
export type DealApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface KycDocument {
  type: string;
  url: string;
  uploadedAt?: string;
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
  ownerName?: string;
  contactPerson?: string;
  ownerEmail?: string;
  ownerMobile?: string;
  alternateOwnerMobile?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
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
  ownerUserId: string | null;
  kycStatus: KycStatus;
  kycRejectionReason: string | null;
  status: VendorStatus;
  statusReason: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { branches: number };
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
}

export type VendorCreateInput = VendorFields & { ownerUserId?: string };
export type VendorUpdateInput = Partial<VendorCreateInput>;
export type VendorSelfInput = Partial<VendorFields> & Pick<VendorFields, 'businessName'>;
export type VendorSelfUpdateInput = Partial<VendorFields>;

export interface Branch {
  id: string;
  vendorId: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  email?: string | null;
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
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  email?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
}

export interface Deal {
  id: string;
  vendorId: string;
  branchId: string;
  categoryId: string;
  subcategoryId: string | null;
  /** Exactly one of serviceId/productId — every deal represents one catalog item (Service or
   *  Product), enforced server-side. Nullable only because deals created before this field
   *  existed have neither. */
  serviceId: string | null;
  productId: string | null;
  title: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
  originalPrice: string;
  salePrice: string;
  discountPercent?: number | null;
  /** Only meaningful for a service deal (bookable duration) — never required for a product deal. */
  durationMinutes?: number | null;
  termsAndConditions?: string | null;
  images?: string[] | null;
  maxBookings?: number | null;
  availableBookings?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  status: DealStatus;
  approvalStatus: DealApprovalStatus;
  approvalRejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  category?: Category;
  subcategory?: Category | null;
  service?: { id: string; name: string } | null;
  product?: { id: string; name: string } | null;
  /** Only present on the cross-vendor `GET /vendors/deals` sidebar listing. */
  vendor?: { id: string; businessName: string | null };
  branch?: { id: string; name: string };
  /** The deal's own duration/price menu (a real child table — DealPackage — mirrors
   *  TherapistPackage exactly). Always empty for a product deal. */
  packages?: DealPackage[];
  /** Uploaded media (shared Deal/Product/Therapist system) — the authoritative image/video
   *  source going forward; `images` above is the legacy pasted-URL field, kept only for rows
   *  that predate this table (see `resolveDealMedia` in `utils/media.ts`). */
  mediaImages?: MediaImage[];
  mediaVideo?: MediaVideo | null;
}

export interface DealPackage {
  id: string;
  dealId: string;
  durationMinutes: number;
  sellingPrice: string;
  originalPrice: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** `id` present = update that existing package row; absent = create a new one — the whole array
 *  is submitted together with the Deal create/update request and diffed server-side by `id`
 *  (see vendor.service.ts#updateDeal). */
export interface DealPackageInput {
  id?: string;
  durationMinutes: number;
  sellingPrice: number;
  originalPrice?: number;
  isActive?: boolean;
  sortOrder?: number;
}

export interface DealInput {
  categoryId: string;
  subcategoryId?: string;
  serviceId?: string;
  productId?: string;
  title: string;
  slug: string;
  shortDescription?: string;
  description?: string;
  originalPrice: string;
  salePrice: string;
  discountPercent?: number;
  durationMinutes?: number;
  termsAndConditions?: string;
  images?: string[];
  maxBookings?: number;
  availableBookings?: number;
  startDate?: string;
  endDate?: string;
  /** Required (>=1) for a service deal — omit entirely on update to leave existing packages
   *  untouched. Never set for a product deal. */
  packages?: DealPackageInput[];
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

/** Cross-vendor deal list for the sidebar's standalone "Deals" page. */
export function listAllDeals(token: string | null, opts: { page?: number; pageSize?: number; search?: string } = {}) {
  return apiGet<Deal[]>(`/vendors/deals${toQuery(opts)}`, token);
}

export function createVendor(token: string | null, input: VendorCreateInput) {
  return apiPost<Vendor>('/vendors', token, input);
}

export function getVendor(token: string | null, id: string) {
  return apiGet<Vendor>(`/vendors/${id}`, token);
}

/** Existing-user typeahead for "Add Vendor → Select Existing User" — reuses the same
 *  search/pagination shape as the RBAC Users screen, scoped to the `vendors:create` permission. */
export function searchUsersForVendor(token: string | null, q: string) {
  return apiGet<UserSummary[]>(`/vendors/users/search${toQuery({ q })}`, token);
}

export function updateVendor(token: string | null, id: string, input: VendorUpdateInput) {
  return apiPatch<Vendor>(`/vendors/${id}`, token, input);
}

export function approveVendor(token: string | null, id: string) {
  return apiPatch<Vendor>(`/vendors/${id}/approve`, token);
}

export function rejectVendor(token: string | null, id: string, reason: string) {
  return apiPatch<Vendor>(`/vendors/${id}/reject`, token, { reason });
}

export function setVendorStatus(
  token: string | null,
  id: string,
  status: Extract<VendorStatus, 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'>,
  reason?: string,
) {
  return apiPatch<Vendor>(`/vendors/${id}/status`, token, { status, reason });
}

export function reviewVendorKyc(
  token: string | null,
  id: string,
  kycStatus: Extract<KycStatus, 'VERIFIED' | 'REJECTED'>,
  rejectionReason?: string,
) {
  return apiPatch<Vendor>(`/vendors/${id}/kyc-review`, token, { kycStatus, rejectionReason });
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

export function createDeal(token: string | null, vendorId: string, branchId: string, input: DealInput) {
  return apiPost<Deal>(`/vendors/${vendorId}/branches/${branchId}/deals`, token, input);
}

export function updateDeal(
  token: string | null,
  vendorId: string,
  branchId: string,
  dealId: string,
  input: Partial<DealInput>,
) {
  return apiPatch<Deal>(`/vendors/${vendorId}/branches/${branchId}/deals/${dealId}`, token, input);
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

export function approveDeal(token: string | null, vendorId: string, branchId: string, dealId: string) {
  return apiPatch<Deal>(`/vendors/${vendorId}/branches/${branchId}/deals/${dealId}/approve`, token);
}

export function rejectDeal(token: string | null, vendorId: string, branchId: string, dealId: string, rejectionReason: string) {
  return apiPatch<Deal>(`/vendors/${vendorId}/branches/${branchId}/deals/${dealId}/reject`, token, { rejectionReason });
}

// ─── Self-service surface ─────────────────────────────────────────────────────

export function getMyVendor(token: string | null) {
  return apiGet<Vendor>('/vendors/me', token);
}

export function createMyVendor(token: string | null, input: VendorSelfInput) {
  return apiPost<Vendor>('/vendors/me', token, input);
}

export function updateMyVendor(token: string | null, input: VendorSelfUpdateInput) {
  return apiPatch<Vendor>('/vendors/me', token, input);
}

export function submitMyVendor(token: string | null) {
  return apiPost<Vendor>('/vendors/me/submit', token);
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

export function createMyDeal(token: string | null, branchId: string, input: DealInput) {
  return apiPost<Deal>(`/vendors/me/branches/${branchId}/deals`, token, input);
}

export function updateMyDeal(token: string | null, branchId: string, dealId: string, input: Partial<DealInput>) {
  return apiPatch<Deal>(`/vendors/me/branches/${branchId}/deals/${dealId}`, token, input);
}

export function setMyDealStatus(token: string | null, branchId: string, dealId: string, status: DealStatus) {
  return apiPatch<Deal>(`/vendors/me/branches/${branchId}/deals/${dealId}/status`, token, { status });
}

/** One row of the vendor's own customer list — everyone who has ordered from or booked
 *  with this vendor. Flat, no nested objects, matching `GET /vendors/me/customers`. */
export interface CustomerRow {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  orderCount: number;
  bookingCount: number;
  lastActivityAt: string;
}

/** The logged-in vendor's own customers, resolved server-side from the caller's JWT (never a
 *  client-supplied vendorId) — same pattern as every other `/vendors/me/*` self-service route. */
export function listMyCustomers(token: string | null, opts: { page?: number; pageSize?: number } = {}) {
  return apiGet<CustomerRow[]>(`/vendors/me/customers${toQuery(opts)}`, token);
}

/** A vendor's customers as seen by the admin Vendor Detail view — same shape as the vendor's own
 *  `listMyCustomers` above, scoped by an explicit `vendorId` instead of the caller's JWT. See
 *  `GET /vendors/:vendorId/customers`, gated `vendors:view` — the same permission that already
 *  guards this whole admin screen (mirrors `listVendorTherapistsForAdmin` below). */
export function listVendorCustomersForAdmin(token: string | null, vendorId: string, opts: { page?: number; pageSize?: number } = {}) {
  return apiGet<CustomerRow[]>(`/vendors/${vendorId}/customers${toQuery(opts)}`, token);
}

/** A therapist staffed at one of the vendor's own branches. Branch-scoped (not vendor-wide)
 *  because bookings reference `vendorId`+`branchId` consistency — see `GET
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
  specialization: string | null;
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

export function listCategories(token: string | null) {
  return apiGet<Category[]>('/vendors/categories', token);
}
