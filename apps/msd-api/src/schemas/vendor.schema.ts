import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';
import { normalizeIdentifier } from '../lib/normalizeIdentifier';

extendZodWithOpenApi(z);

export const VendorListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
  status: z.enum(['PROFILE_INCOMPLETE', 'PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
});

/** Query for the "select an existing User to link as this Vendor's owner" search box. */
export const VendorUserSearchQuerySchema = PaginationQuerySchema.extend({
  q: z.string().max(200).optional(),
});

/** Query for the sidebar's cross-vendor Branches/Deals list pages. */
export const CrossVendorListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
});

/** Route param for the admin-scoped `/:vendorId/...` sub-resources — same shape as
 *  `UuidParamSchema` in `common.schema.ts`, just keyed `vendorId` to match the param name. */
export const VendorIdParamSchema = z.object({
  vendorId: z.string().uuid(),
});

const decimalString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'must be a plain decimal amount with up to 2 places, e.g. "199.00"');

const slugString = z
  .string()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lower-kebab-case');

const kycDocumentSchema = z.object({
  type: z.string().min(1).max(80),
  url: z.string().url(),
  uploadedAt: z.string().datetime().optional(),
});

// ─── Vendor field-format validation ───────────────────────────────────────────
// GST/PAN/pincode/phone were previously `z.string().max(N).optional()` with no format check at
// all. An empty string ("") is treated as "field cleared" and bypasses the regex — these fields
// stay optional (never newly required); only a *non-empty* value must match the expected shape.

const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}[Z]{1}[A-Z\d]{1}$/;
const PAN_REGEX = /^[A-Z]{5}\d{4}[A-Z]{1}$/;
const PINCODE_REGEX = /^\d{6}$/;
const INDIA_MOBILE_REGEX = /^\+91\d{10}$/;

const gstNumberSchema = z
  .string()
  .max(30)
  .transform((v) => v.toUpperCase())
  .refine((v) => v === '' || GSTIN_REGEX.test(v), { message: 'Enter a valid 15-character GST number' })
  .optional();

const panNumberSchema = z
  .string()
  .max(20)
  .transform((v) => v.toUpperCase())
  .refine((v) => v === '' || PAN_REGEX.test(v), { message: 'Enter a valid 10-character PAN number' })
  .optional();

const vendorPincodeSchema = z
  .string()
  .max(20)
  .refine((v) => v === '' || PINCODE_REGEX.test(v), { message: 'Enter a valid 6-digit pincode' })
  .optional();

/**
 * Vendor contact-phone fields (businessPhone/alternatePhone/ownerMobile/alternateOwnerMobile) —
 * NOT login identifiers/User.phone, so there's no duplicate-*user* risk here. Still reuses
 * `normalizeIdentifier()` (see lib/normalizeIdentifier.ts, applied at the OTP auth boundary) so
 * a bare 10-digit number and an already-`+91`-prefixed number are both accepted and always
 * stored the same way, matching that same normalize-then-validate discipline.
 */
const vendorPhoneSchema = z
  .string()
  .max(30)
  .transform((v) => (v === '' ? v : normalizeIdentifier(v)))
  .refine((v) => v === '' || INDIA_MOBILE_REGEX.test(v), { message: 'Enter a valid 10-digit mobile number' })
  .optional();

// ─── Vendor ──────────────────────────────────────────────────────────────────

/**
 * Every editable Vendor field except `ownerUserId` (admin-only linking) and identity/status
 * fields. `businessName` is optional at this layer — the admin onboarding pipeline persists a
 * Vendor after Step 1 (Vendor User) with only `ownerUserId` set, before Business Details (Step
 * 2) exists — but the pipeline's own Step 2 UI still requires it client-side before advancing.
 */
const VendorFieldsSchema = z.object({
  businessName: z.string().min(1).max(200).optional(),
  legalName: z.string().max(200).optional(),
  businessType: z.string().max(100).optional(),
  businessDescription: z.string().max(2000).optional(),
  businessEmail: z.string().email().optional(),
  businessPhone: vendorPhoneSchema,
  alternatePhone: vendorPhoneSchema,
  website: z.string().url().optional(),
  logoUrl: z.string().url().optional(),

  ownerName: z.string().max(150).optional(),
  contactPerson: z.string().max(150).optional(),
  ownerEmail: z.string().email().optional(),
  ownerMobile: vendorPhoneSchema,
  alternateOwnerMobile: vendorPhoneSchema,

  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  pincode: vendorPincodeSchema,
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),

  gstNumber: gstNumberSchema,
  panNumber: panNumberSchema,
  businessRegistrationNumber: z.string().max(100).optional(),
  kycDocuments: z.array(kycDocumentSchema).optional(),

  bankAccountHolder: z.string().max(150).optional(),
  bankName: z.string().max(150).optional(),
  bankAccountNumber: z.string().max(40).optional(),
  bankIfsc: z.string().max(20).optional(),
  upiId: z.string().max(100).optional(),
});

export const VendorCreateSchema = VendorFieldsSchema.extend({
  /** Admin-only: link an existing User (with the `vendor` role) as this business's owner. */
  ownerUserId: z.string().uuid().optional(),
}).openapi('VendorCreate');

export const VendorUpdateSchema = VendorCreateSchema.partial().openapi('VendorUpdate');

// Self-registration has no "Step 1 only" concept (unlike the admin pipeline) — re-require
// businessName here even though the base VendorFieldsSchema relaxed it to optional.
export const VendorSelfCreateSchema = VendorFieldsSchema.extend({
  businessName: z.string().min(1).max(200),
}).openapi('VendorSelfCreate');

export const VendorSelfUpdateSchema = VendorFieldsSchema.partial().openapi('VendorSelfUpdate');

export const VendorRejectSchema = z
  .object({ reason: z.string().min(1).max(1000) })
  .openapi('VendorReject');

export const VendorStatusUpdateSchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
    reason: z.string().max(1000).optional(),
  })
  .refine((v) => v.status === 'ACTIVE' || Boolean(v.reason), {
    message: 'reason is required when deactivating or suspending a vendor',
    path: ['reason'],
  })
  .openapi('VendorStatusUpdate');

export const VendorKycReviewSchema = z
  .object({
    kycStatus: z.enum(['VERIFIED', 'REJECTED']),
    rejectionReason: z.string().max(1000).optional(),
  })
  .refine((v) => v.kycStatus === 'VERIFIED' || Boolean(v.rejectionReason), {
    message: 'rejectionReason is required when rejecting KYC',
    path: ['rejectionReason'],
  })
  .openapi('VendorKycReview');

// ─── Branch ──────────────────────────────────────────────────────────────────

const BranchFieldsSchema = z.object({
  name: z.string().min(1).max(150),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  pincode: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
});

export const BranchCreateSchema = BranchFieldsSchema.openapi('BranchCreate');
export const BranchUpdateSchema = BranchFieldsSchema.partial().openapi('BranchUpdate');
export const BranchStatusUpdateSchema = z.object({ isActive: z.boolean() }).openapi('BranchStatusUpdate');

// ─── Therapist ───────────────────────────────────────────────────────────────

const TherapistFieldsSchema = z.object({
  /** The service/role label a customer browses by (e.g. "Legs Therapist") — distinct from
   *  `personName` below, never merged into one field. */
  therapistType: z.string().min(1).max(200),
  /** The actual staff member (e.g. "Ramesh Kumar"). */
  personName: z.string().min(1).max(200),
  gender: z.string().max(50).optional(),
  specialization: z.string().max(200).optional(),
  bio: z.string().max(2000).optional(),
  experienceYears: z.number().int().min(0).max(60).optional(),
  /** URL only — matches Vendor.logoUrl/Deal.images' existing validation in this file; no
   *  upload pipeline exists yet. */
  photoUrl: z.string().url().optional(),
});

export const TherapistCreateSchema = TherapistFieldsSchema.openapi('TherapistCreate');
export const TherapistUpdateSchema = TherapistFieldsSchema.partial().openapi('TherapistUpdate');
export const TherapistStatusUpdateSchema = z.object({ isActive: z.boolean() }).openapi('TherapistStatusUpdate');

// ─── TherapistPackage (a therapist's own duration/price menu — independent of any Deal) ───

/** `durationMinutes` identifies the package (unique per therapist) — editable on update too
 *  (mirrors sellingPrice/originalPrice/isActive/sortOrder), subject to the same uniqueness
 *  constraint the database enforces (see vendor.service.ts#updateTherapistPackage). */
const TherapistPackageFieldsSchema = z.object({
  durationMinutes: z.number().int().positive(),
  sellingPrice: z.number().min(0),
  originalPrice: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const TherapistPackageCreateSchema = TherapistPackageFieldsSchema
  .refine((data) => data.originalPrice === undefined || data.originalPrice >= data.sellingPrice, {
    message: 'originalPrice must be greater than or equal to sellingPrice',
    path: ['originalPrice'],
  })
  .openapi('TherapistPackageCreate');

export const TherapistPackageUpdateSchema = TherapistPackageFieldsSchema
  .partial()
  .refine((data) => data.originalPrice === undefined || data.sellingPrice === undefined || data.originalPrice >= data.sellingPrice, {
    message: 'originalPrice must be greater than or equal to sellingPrice',
    path: ['originalPrice'],
  })
  .openapi('TherapistPackageUpdate');

// ─── Deal ────────────────────────────────────────────────────────────────────

const DealFieldsSchema = z.object({
  categoryId: z.string().uuid(),
  subcategoryId: z.string().uuid().optional(),
  /** Exactly one of serviceId/productId must be set — enforced in vendor.service.ts (needs a
   *  DB read to check existence + category match, so it can't live in this schema alone; see
   *  assertExactlyOneOffering/assertOfferingMatchesCatalogItem). */
  serviceId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  slug: slugString,
  shortDescription: z.string().max(300).optional(),
  description: z.string().max(5000).optional(),
  originalPrice: decimalString,
  salePrice: decimalString,
  discountPercent: z.number().int().min(0).max(100).optional(),
  /** Only meaningful for a service deal — required there, ignored for a product deal (see
   *  vendor.service.ts's assertDurationRequiredForService). */
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  termsAndConditions: z.string().max(5000).optional(),
  images: z.array(z.string().url()).optional(),
  maxBookings: z.number().int().min(0).optional(),
  availableBookings: z.number().int().min(0).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/** A service Deal's own duration/price menu — mirrors TherapistPackageFieldsSchema exactly (see
 *  DealPackage's own schema doc comment for the full rationale). `id` present = update that
 *  existing package row; absent = create a new one. Never used for a product deal. */
const DealPackageFieldsSchema = z.object({
  id: z.string().uuid().optional(),
  durationMinutes: z.number().int().positive(),
  sellingPrice: z.number().min(0),
  originalPrice: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const DealCreateSchema = DealFieldsSchema.extend({
  /** Required (>=1) for a service deal — the customer always books a specific package, never
   *  the Deal's own price directly (see booking.service.ts#createBookingFromDeal). Must be
   *  absent/empty for a product deal — no duration/package concept applies there. */
  packages: z.array(DealPackageFieldsSchema).optional(),
})
  .refine((data) => !data.serviceId || (data.packages && data.packages.length > 0), {
    message: 'At least one package (duration + price) is required for a service deal.',
    path: ['packages'],
  })
  .refine((data) => !data.productId || !data.packages || data.packages.length === 0, {
    message: 'Packages only apply to service deals, never a product deal.',
    path: ['packages'],
  })
  .refine((data) => (data.packages ?? []).every((p) => p.originalPrice === undefined || p.originalPrice >= p.sellingPrice), {
    message: "Each package's originalPrice must be greater than or equal to its sellingPrice.",
    path: ['packages'],
  })
  .openapi('DealCreate');

export const DealUpdateSchema = DealFieldsSchema.partial()
  .extend({
    /** Omit entirely to leave existing packages untouched. When present, replaces the full set
     *  (diff by `id` — entries with an id update that row, entries without one are created, any
     *  existing row whose id is no longer present is deleted — see
     *  vendor.service.ts#updateDeal) and must have >=1 entry (a service deal can never be left
     *  with zero packages via update either). */
    packages: z.array(DealPackageFieldsSchema).optional(),
  })
  .refine((data) => data.packages === undefined || data.packages.length > 0, {
    message: 'A service deal must have at least one package — omit `packages` to leave them unchanged instead of clearing them.',
    path: ['packages'],
  })
  .refine((data) => (data.packages ?? []).every((p) => p.originalPrice === undefined || p.originalPrice >= p.sellingPrice), {
    message: "Each package's originalPrice must be greater than or equal to its sellingPrice.",
    path: ['packages'],
  })
  .openapi('DealUpdate');

export const DealStatusUpdateSchema = z
  .object({ status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'EXPIRED']) })
  .openapi('DealStatusUpdate');

export const DealRejectSchema = z
  .object({ rejectionReason: z.string().min(1).max(1000) })
  .openapi('DealReject');
