import { z } from "../../config/zod";

/**
 * ==========================================================
 * VENDOR STATUS
 * ==========================================================
 */

export const VendorStatusEnum = z
  .enum(["ACTIVE", "INACTIVE"])
  .openapi({
    example: "ACTIVE",
  });

/**
 * ==========================================================
 * BASE VENDOR SCHEMA
 * ==========================================================
 */

export const VendorSchema = z
  .object({
    id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440008",
    }),

    business_name: z
      .string()
      .trim()
      .min(2, "Business name must be at least 2 characters.")
      .max(150, "Business name cannot exceed 150 characters.")
      .openapi({
        example: "MySpa Wellness Center",
      }),

    owner_name: z
      .string()
      .trim()
      .min(2, "Owner name must be at least 2 characters.")
      .max(100, "Owner name cannot exceed 100 characters.")
      .openapi({
        example: "Raj Upadhyay",
      }),

    email: z
      .string()
      .trim()
      .email("Invalid email address.")
      .max(150, "Email cannot exceed 150 characters.")
      .openapi({
        example: "vendor@example.com",
      }),

    phone: z
      .string()
      .trim()
      .regex(/^\+?[1-9]\d{9,14}$/, {
        message: "Invalid phone number.",
      })
      .openapi({
        example: "+919876543210",
      }),

    gst_number: z
      .string()
      .trim()
      .min(1, "GST number is required.")
      .max(20, "GST number cannot exceed 20 characters.")
      .openapi({
        example: "09ABCDE1234F1Z5",
      }),

    address: z
      .string()
      .trim()
      .min(2, "Address must be at least 2 characters.")
      .max(500, "Address cannot exceed 500 characters.")
      .openapi({
        example: "123 Main Street, Sector 18",
      }),

    city: z
      .string()
      .trim()
      .min(2, "City must be at least 2 characters.")
      .max(100, "City cannot exceed 100 characters.")
      .openapi({
        example: "Noida",
      }),

    state: z
      .string()
      .trim()
      .min(2, "State must be at least 2 characters.")
      .max(100, "State cannot exceed 100 characters.")
      .openapi({
        example: "Uttar Pradesh",
      }),

    country: z
      .string()
      .trim()
      .min(2, "Country must be at least 2 characters.")
      .max(100, "Country cannot exceed 100 characters.")
      .openapi({
        example: "India",
      }),

    latitude: z
      .number()
      .min(-90, "Latitude must be between -90 and 90.")
      .max(90, "Latitude must be between -90 and 90.")
      .openapi({
        example: 28.6139,
      }),

    longitude: z
      .number()
      .min(-180, "Longitude must be between -180 and 180.")
      .max(180, "Longitude must be between -180 and 180.")
      .openapi({
        example: 77.209,
      }),

    logo: z
      .string()
      .url("Invalid logo URL.")
      .optional()
      .openapi({
        example:
          "https://cdn.myspa.com/vendors/vendor-logo.jpg",
      }),

    cover_image: z
      .string()
      .url("Invalid cover image URL.")
      .optional()
      .openapi({
        example:
          "https://cdn.myspa.com/vendors/vendor-cover.jpg",
      }),

    description: z
      .string()
      .trim()
      .max(2000, "Description cannot exceed 2000 characters.")
      .optional()
      .openapi({
        example:
          "Premium wellness and spa center offering a range of relaxing treatments.",
      }),

    status: VendorStatusEnum,

    rating: z
      .number()
      .min(0, "Rating cannot be less than 0.")
      .max(5, "Rating cannot exceed 5.")
      .openapi({
        example: 4.5,
      }),

    created_at: z
      .string()
      .datetime()
      .openapi({
        example: "2026-08-07T10:30:00Z",
      }),

    updated_at: z
      .string()
      .datetime()
      .openapi({
        example: "2026-08-07T11:30:00Z",
      }),

    deleted_at: z
      .string()
      .datetime()
      .nullable()
      .openapi({
        example: null,
      }),
  })
  .openapi("Vendor");

/**
 * ==========================================================
 * CREATE VENDOR
 * POST /vendors
 * ==========================================================
 */

export const CreateVendorSchema = z
  .object({
    business_name: VendorSchema.shape.business_name,

    owner_name: VendorSchema.shape.owner_name,

    email: VendorSchema.shape.email,

    phone: VendorSchema.shape.phone,

    gst_number: VendorSchema.shape.gst_number,

    address: VendorSchema.shape.address,

    city: VendorSchema.shape.city,

    state: VendorSchema.shape.state,

    country: VendorSchema.shape.country,

    latitude: VendorSchema.shape.latitude,

    longitude: VendorSchema.shape.longitude,

    logo: VendorSchema.shape.logo,

    cover_image: VendorSchema.shape.cover_image,

    description: VendorSchema.shape.description,

    status: VendorStatusEnum.default("ACTIVE"),

    rating: VendorSchema.shape.rating.default(0),
  })
  .openapi("CreateVendor");

/**
 * ==========================================================
 * UPDATE VENDOR
 * PUT /vendors/:id
 * ==========================================================
 */

export const UpdateVendorSchema =
  CreateVendorSchema.partial().openapi(
    "UpdateVendor"
  );

/**
 * ==========================================================
 * PARAMS
 * ==========================================================
 */

export const VendorParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .openapi("VendorParams");

/**
 * ==========================================================
 * QUERY
 * GET /vendors
 * ==========================================================
 */

export const VendorQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),

    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(100)
      .default(10),

    search: z
      .string()
      .trim()
      .optional(),

    city: z
      .string()
      .trim()
      .optional(),

    state: z
      .string()
      .trim()
      .optional(),

    country: z
      .string()
      .trim()
      .optional(),

    status: VendorStatusEnum.optional(),

    sortBy: z
      .enum([
        "business_name",
        "owner_name",
        "email",
        "city",
        "rating",
        "created_at",
        "updated_at",
      ])
      .optional(),

    sortOrder: z
      .enum(["asc", "desc"])
      .default("asc"),
  })
  .openapi("VendorQuery");

/**
 * ==========================================================
 * SINGLE VENDOR RESPONSE
 * ==========================================================
 */

export const VendorResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: VendorSchema,
  })
  .openapi("VendorResponse");

/**
 * ==========================================================
 * VENDOR LIST RESPONSE
 * ==========================================================
 */

export const VendorListResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: z.array(VendorSchema),

    pagination: z.object({
      page: z.number(),

      limit: z.number(),

      total: z.number(),

      totalPages: z.number(),
    }),
  })
  .openapi("VendorListResponse");

/**
 * ==========================================================
 * DELETE VENDOR RESPONSE
 * ==========================================================
 */

export const DeleteVendorResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),
  })
  .openapi("DeleteVendorResponse");

/**
 * ==========================================================
 * TYPES
 * ==========================================================
 */

export type Vendor = z.infer<
  typeof VendorSchema
>;

export type CreateVendorDto = z.infer<
  typeof CreateVendorSchema
>;

export type UpdateVendorDto = z.infer<
  typeof UpdateVendorSchema
>;

export type VendorQuery = z.infer<
  typeof VendorQuerySchema
>;

export type VendorParams = z.infer<
  typeof VendorParamsSchema
>;