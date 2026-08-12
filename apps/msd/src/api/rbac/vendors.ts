import { apiGet, apiPatch, apiPost } from './client';

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

// ─── Reference lookups ────────────────────────────────────────────────────────

export function listCategories(token: string | null) {
  return apiGet<Category[]>('/vendors/categories', token);
}
