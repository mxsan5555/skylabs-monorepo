import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema, richTextField } from './common.schema';
import { normalizeIdentifier } from '../lib/normalizeIdentifier';
import { isIndiaLocation } from '@skylabs-monorepo/shared-utils';

extendZodWithOpenApi(z);

export const MemberListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
  documents: z.enum(['incomplete']).optional(),
  reviewFlag: z.enum(['true']).optional(),
  /** Allowlist only; anything else is a 422. Default order is newest first. */
  sort: z.enum(['businessName', 'status', 'documentsDueAt']).optional(),
  dir: z.enum(['asc', 'desc']).default('asc'),
});

/** Query for the "select an existing User to link as this Vendor's owner" search box. */
export const VendorUserSearchQuerySchema = PaginationQuerySchema.extend({
  q: z.string().max(200).optional(),
});

/** Query for the sidebar's cross-vendor Branches/Deals list pages. */
export const CrossVendorListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
});

/** Same as `CrossVendorListQuerySchema` plus an optional branch-state filter — used only by the
 *  cross-vendor Deals list, for the Home Hero admin screen's "search deals in this state" Deal
 *  picker (see `home-hero.tsx`). */
export const CrossVendorDealListQuerySchema = CrossVendorListQuerySchema.extend({
  state: z.string().max(100).optional(),
});

/** Route param for the admin-scoped `/:vendorId/...` sub-resources — same shape as
 *  `UuidParamSchema` in `common.schema.ts`, just keyed `vendorId` to match the param name. */
export const VendorIdParamSchema = z.object({
  vendorId: z.string().uuid(),
});

/** Route param for the member-scoped `/me/customers/:customerId` lookup — same shape as
 *  `UuidParamSchema`, just keyed `customerId` to match the param name. */
export const VendorCustomerIdParamSchema = z.object({
  customerId: z.string().uuid(),
});

/** Route param for the real KYC file-upload endpoints — `:documentType` must be one of the
 *  three real `VendorDocumentType` enum values (see schema.prisma), never a free-text label
 *  like the deprecated `kycDocuments` JSON blob's `type` field. */
export const VendorDocumentTypeParamSchema = z.object({
  documentType: z.enum(['GST', 'PAN', 'AADHAAR']),
});

export const VendorDocumentAdminParamSchema = z.object({
  id: z.string().uuid(),
  documentType: z.enum(['GST', 'PAN', 'AADHAAR']),
});

/** Route param for the admin vendor-image sub-resources (`/:id/images/:imageId[...]`). Using the
 *  bare `UuidParamSchema` (only `id`) here was a real bug: `validateParams` replaces `req.params`
 *  with Zod's parsed output, and Zod strips any key not declared on the schema — so `imageId`
 *  silently became `undefined` on every request, and `deleteVendorImage`/`setVendorPrimaryImage`
 *  received an undefined id, throwing an uncaught Prisma error. Every multi-param route must
 *  declare every param it reads. */
export const VendorImageIdParamSchema = z.object({
  id: z.string().uuid(),
  imageId: z.string().uuid(),
});

/** Route param for the admin product sub-resources (`/:vendorId/products/:productId[...]`) —
 *  same "every param must be declared" fix as `VendorImageIdParamSchema` above. `VendorIdParamSchema`
 *  (only `vendorId`) was silently stripping `productId` on every PATCH/DELETE here. */
export const VendorProductIdParamSchema = z.object({
  vendorId: z.string().uuid(),
  productId: z.string().uuid(),
});

const slugString = z
  .string()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lower-kebab-case');

const plainItems = (maxItems: number, maxLength: number) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems);

const kycDocumentSchema = z.object({
  type: z.string().min(1).max(80),
  url: z.string().url(),
  uploadedAt: z.string().datetime().optional(),
});

// ─── Vendor field-format validation ───────────────────────────────────────────
// GST/PAN/pincode/phone were previously `z.string().max(N).optional()` with no format check at
// all. An empty string ("") is treated as "field cleared" and bypasses the regex — these fields
// stay optional (never newly required); only a *non-empty* value must match the expected shape.

// 9th character is the entity/registration code — alphanumeric (a PAN with multiple GST
// registrations in one state gets 2, 3, ... up through a letter there), never digit-only.
const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[A-Z\d]{1}$/;
const PAN_REGEX = /^[A-Z]{5}\d{4}[A-Z]{1}$/;
const PINCODE_REGEX = /^\d{6}$/;
/** Canonical Indian mobile rule — first digit 6-9, exactly 10 digits after the `+91` this
 *  schema's own `normalizeIdentifier()` transform always prepends. Matches the frontend's
 *  `INDIA_MOBILE_REGEX` in `vendor-profile-form.tsx` (applied there to the plain 10-digit value
 *  before this schema ever sees it) — same canonical rule, same digit class, on both sides. */
const INDIA_MOBILE_REGEX = /^\+91[6-9]\d{9}$/;

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

  ownerFirstName: z.string().max(75).optional(),
  ownerLastName: z.string().max(75).optional(),
  contactPerson: z.string().max(150).optional(),
  ownerEmail: z.string().email().optional(),
  ownerMobile: vendorPhoneSchema,
  alternateOwnerMobile: vendorPhoneSchema,

  address: z.string().max(500).optional(),
  addressLine2: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  pincode: vendorPincodeSchema,
  /** A pasted Google Maps share URL (e.g. `https://maps.app.goo.gl/...`) — replaces manual
   *  latitude/longitude entry. Resolved server-side into `latitude`/`longitude` (see
   *  vendor.service.ts + providers/maps/googleMapsUrlResolver.provider.ts); this schema no
   *  longer accepts raw lat/lng from the client at all. The self-service schema strips them
   *  silently; the strict admin `VendorUpdateSchema` rejects them with 422. */
  mapLocationUrl: z.string().url().optional(),

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
  /** NOT read by `createVendor` (see that function's own doc comment: a Vendor's owner is
   *  always a brand-new User, never an existing one). Kept only for the deprecated create doc. */
  ownerUserId: z.string().uuid().optional(),
}).openapi('VendorCreate');

/** The admin Profile tab body. Strict allowlist (spec section 6): an unknown key, `ownerUserId`
 *  (owners are never re-linked) or the legacy `kycDocuments` list returns 422. */
export const VendorUpdateSchema = VendorFieldsSchema.omit({ kycDocuments: true }).partial().strict().openapi('VendorUpdate');

/** Query for the "Add Vendor" owner-identity AVAILABILITY preview — UX-only (see
 *  `vendorService.checkVendorOwnerAvailability`'s own doc comment); at least one of
 *  email/mobile must be given. */
export const VendorOwnerLookupQuerySchema = z
  .object({
    email: z.string().email().optional(),
    mobile: vendorPhoneSchema,
  })
  .refine((v) => Boolean(v.email) || Boolean(v.mobile), { message: 'Provide an email or mobile number' });

export const VendorSelfUpdateSchema = VendorFieldsSchema.partial().openapi('VendorSelfUpdate');

/** The short Add member form. Everything else is completed later on the Profile tab. */
export const MemberCreateSchema = z
  .object({
    businessName: z.string().trim().min(1).max(200),
    ownerFirstName: z.string().trim().min(1).max(75),
    ownerLastName: z.string().trim().min(1).max(75),
    ownerEmail: z.string().trim().email().max(254),
    ownerMobile: z
      .string()
      .max(30)
      .transform((v) => normalizeIdentifier(v))
      .refine((v) => INDIA_MOBILE_REGEX.test(v), { message: 'Enter a valid 10-digit mobile number' }),
  })
  .strict()
  .openapi('MemberCreate');

export const MemberStatusChangeSchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
    reason: z.string().trim().min(10).max(500),
  })
  .strict()
  .openapi('MemberStatusChange');

export const MemberDeleteSchema = z
  .object({ reason: z.string().trim().min(10).max(500) })
  .strict()
  .openapi('MemberDelete');

export const MemberDocumentReviewSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .openapi('MemberDocumentReview');

// ─── Branch ──────────────────────────────────────────────────────────────────

/** Route param for the admin-scoped `/:vendorId/branches/:branchId/...` sub-resources — same
 *  "every param must be declared" discipline as `VendorImageIdParamSchema`/`VendorProductIdParamSchema`
 *  above (bare `VendorIdParamSchema` would silently strip `branchId`). */
export const VendorBranchIdParamSchema = z.object({
  vendorId: z.string().uuid(),
  branchId: z.string().uuid(),
});

/** Same 6-digit-only rule as Vendor's own PINCODE_REGEX above — Branch previously had no format
 *  check at all here (`z.string().max(20)`), unlike Vendor. */
const branchPincodeSchema = z
  .string()
  .max(20)
  .refine((v) => v === '' || PINCODE_REGEX.test(v), { message: 'Enter a valid 6-digit pincode' })
  .optional();

/** One weekday's hours — mirrors the frontend's own `DayHours` shape exactly
 *  (`apps/msd/src/api/rbac/vendors.ts`). `open: false` means closed all day; `start`/`end` are
 *  then meaningless and simply not validated. */
const DayHoursSchema = z.object({
  open: z.boolean(),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM').optional(),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM').optional(),
});

/** Every key optional — a branch need not set every day (e.g. only weekdays configured so far).
 *  Root cause of "branch hours never save": this field didn't exist on `BranchFieldsSchema` at
 *  all, so `validateBody` (which replaces `req.body` with Zod's parsed output, silently dropping
 *  any undeclared key) stripped `openingHours` before it ever reached `createBranch`/
 *  `updateBranch` — the vendor's saved hours simply never persisted, regardless of the edit form
 *  itself working correctly. */
const OpeningHoursSchema = z.object({
  mon: DayHoursSchema.optional(),
  tue: DayHoursSchema.optional(),
  wed: DayHoursSchema.optional(),
  thu: DayHoursSchema.optional(),
  fri: DayHoursSchema.optional(),
  sat: DayHoursSchema.optional(),
  sun: DayHoursSchema.optional(),
});

const BranchFieldsSchema = z.object({
  name: z.string().min(1).max(150),
  address: z.string().max(500).optional(),
  addressLine2: z.string().max(200).optional(),
  /** State and city come from the India location list (`@skylabs-monorepo/shared-utils`), so a
   *  branch always lines up with the storefront location filters (PLANNING §2.7, C-03). */
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  country: z.string().max(100).optional(),
  pincode: branchPincodeSchema,
  /** Same Map Location URL contract as `VendorFieldsSchema.mapLocationUrl` above — see that
   *  field's doc comment. */
  mapLocationUrl: z.string().url().optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  openingHours: OpeningHoursSchema.optional(),
});

const LOCATION_MESSAGE = 'Pick a state and one of its cities from the list';

export const BranchCreateSchema = BranchFieldsSchema.refine((b) => isIndiaLocation(b.state, b.city), {
  message: LOCATION_MESSAGE,
  path: ['city'],
}).openapi('BranchCreate');

/** State and city change together: both or neither. */
export const BranchUpdateSchema = BranchFieldsSchema.partial()
  .refine((b) => (b.state === undefined) === (b.city === undefined), { message: 'Send state and city together', path: ['city'] })
  .refine((b) => b.state === undefined || b.city === undefined || isIndiaLocation(b.state, b.city), { message: LOCATION_MESSAGE, path: ['city'] })
  .openapi('BranchUpdate');
export const BranchStatusUpdateSchema = z.object({ isActive: z.boolean() }).openapi('BranchStatusUpdate');

// ─── Therapist ───────────────────────────────────────────────────────────────

const TherapistFieldsSchema = z.object({
  /** The service/role label a customer browses by (e.g. "Legs Therapist") — distinct from
   *  `personName` below, never merged into one field. */
  therapistType: z.string().min(1).max(200),
  /** The actual staff member (e.g. "Ramesh Kumar"). */
  personName: z.string().min(1).max(200),
  gender: z.string().max(50).optional(),
  /** Free-text, historical display only — kept for backward compatibility, never validated
   *  against the category catalog. New create/update flows should prefer
   *  `specializationCategoryId` below. */
  specialization: z.string().max(200).optional(),
  /** Restricted choice — must be a top-level Category with `type: THERAPY` (or one of its
   *  subcategories) that this vendor has been granted access to; validated in
   *  vendor.service.ts via assertVendorHasCategoryAccess. */
  specializationCategoryId: z.string().uuid().optional(),
  bio: richTextField(2000),
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

// ─── Deal (docs/msd/PLANNING.md §2.7, API.md §2.1) ──────────────────────────
// Prices, discount and duration are never accepted: the server derives them from the cheapest
// active package. `.strict()` turns any other key (status, notes, policy, salePrice, ...) into 422.

const DealFaqInputSchema = z
  .object({
    question: z.string().trim().min(1).max(200),
    answer: z.string().trim().min(1).max(1000),
  })
  .strict();

const DealFieldsSchema = z
  .object({
    categoryId: z.string().uuid(),
    subcategoryId: z.string().uuid().optional(),
    title: z.string().trim().min(5).max(120),
    /** Generated as `{title}-{member}-{city}` when omitted. */
    slug: slugString.max(90).optional(),
    /** Stored in `shortDescription`: subtitle under the h1 and the meta description. */
    tagline: z.string().trim().max(140).optional(),
    highlights: plainItems(6, 80).optional(),
    description: z.string().max(5000).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    validityDays: z.number().int().min(1).max(365).optional(),
    maxBookings: z.number().int().min(0).optional(),
    limitPerCustomer: z.number().int().min(1).max(20).optional(),
    bookingRequired: z.boolean().optional(),
    bookingInstructions: z.string().max(2000).optional(),
    cancellationPolicy: z.enum(['FREE_24H', 'FREE_48H', 'NON_REFUNDABLE']).optional(),
    cancellationNote: z.string().trim().max(500).optional(),
    eligibility: plainItems(6, 40).optional(),
    termsAndConditions: z.string().max(5000).optional(),
    /** Array order is the display order; replaces the set when sent. */
    faqs: z.array(DealFaqInputSchema).max(10).optional(),
    /** Therapists of this deal's branch; replaces the set when sent (`[]` clears it). */
    therapistIds: z.array(z.string().uuid()).optional(),
  })
  .strict();

const endAfterStart = (d: { startDate?: string | null; endDate?: string | null }) =>
  !d.startDate || !d.endDate || new Date(d.endDate) > new Date(d.startDate);

/** One package card. `durationMinutes` + `persons` are unique within a deal. */
export const DealPackageCreateSchema = z
  .object({
    name: z.string().trim().max(80).optional(),
    durationMinutes: z.number().int().min(15).max(480),
    persons: z.number().int().min(1).max(6).default(1),
    sellingPrice: z.number().min(0),
    originalPrice: z.number().min(0).optional(),
    inclusions: plainItems(8, 80).default([]),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((p) => p.originalPrice === undefined || p.originalPrice >= p.sellingPrice, {
    message: 'Original price must not be below the price',
    path: ['originalPrice'],
  })
  .openapi('DealPackageCreate');

export const DealPackageUpdateSchema = z
  .object({
    name: z.string().trim().max(80).nullable().optional(),
    durationMinutes: z.number().int().min(15).max(480).optional(),
    persons: z.number().int().min(1).max(6).optional(),
    sellingPrice: z.number().min(0).optional(),
    originalPrice: z.number().min(0).nullable().optional(),
    inclusions: plainItems(8, 80).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((p) => p.originalPrice == null || p.sellingPrice === undefined || p.originalPrice >= p.sellingPrice, {
    message: 'Original price must not be below the price',
    path: ['originalPrice'],
  })
  .openapi('DealPackageUpdate');

export const DealPackageReorderSchema = z
  .object({ packageIds: z.array(z.string().uuid()).min(1).max(10) })
  .strict()
  .openapi('DealPackageReorder');

export const DealCreateSchema = DealFieldsSchema.extend({
  packages: z.array(DealPackageCreateSchema).min(1, 'Add at least one package').max(10),
})
  .refine(endAfterStart, { message: 'Sale end must be after sale start', path: ['endDate'] })
  .refine((d) => new Set(d.packages.map((p) => `${p.durationMinutes}:${p.persons}`)).size === d.packages.length, {
    message: 'Two packages have the same duration and people',
    path: ['packages'],
  })
  .openapi('DealCreate');

/** Packages are managed through their own routes on an existing deal. `null` clears a field. */
export const DealUpdateSchema = DealFieldsSchema.partial()
  .extend({
    subcategoryId: z.string().uuid().nullable().optional(),
    startDate: z.string().datetime().nullable().optional(),
    endDate: z.string().datetime().nullable().optional(),
    validityDays: z.number().int().min(1).max(365).nullable().optional(),
    maxBookings: z.number().int().min(0).nullable().optional(),
    limitPerCustomer: z.number().int().min(1).max(20).nullable().optional(),
  })
  .strict()
  .refine(endAfterStart, { message: 'Sale end must be after sale start', path: ['endDate'] })
  .openapi('DealUpdate');

export const DealStatusUpdateSchema = z
  .object({ status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']) })
  .strict()
  .openapi('DealStatusUpdate');

export const DealCopySchema = z.object({ branchId: z.string().uuid() }).strict().openapi('DealCopy');

export const DealImageUpdateSchema = z
  .object({ altText: z.string().trim().max(125) })
  .strict()
  .openapi('DealImageUpdate');
