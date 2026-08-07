import { z } from "../../config/zod";

/**
 * ==========================================================
 * SERVICE STATUS
 * ==========================================================
 */

export const ServiceStatusEnum = z
  .enum(["ACTIVE", "INACTIVE"])
  .openapi({
    example: "ACTIVE",
  });

/**
 * ==========================================================
 * BASE SERVICE SCHEMA
 * ==========================================================
 */

export const ServiceSchema = z
  .object({
    id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440009",
    }),

    vendor_id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440008",
    }),

    subcategory_id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440010",
    }),

    name: z
      .string()
      .trim()
      .min(2, "Service name must be at least 2 characters.")
      .max(150, "Service name cannot exceed 150 characters.")
      .openapi({
        example: "Deep Tissue Massage",
      }),

    description: z
      .string()
      .trim()
      .min(1, "Service description is required.")
      .max(2000, "Service description cannot exceed 2000 characters.")
      .openapi({
        example:
          "A relaxing deep tissue massage designed to relieve muscle tension.",
      }),

    duration: z
      .number()
      .int()
      .positive("Duration must be greater than 0.")
      .openapi({
        example: 60,
      }),

    price: z
      .number()
      .nonnegative("Price cannot be negative.")
      .openapi({
        example: 1999,
      }),

    discount_price: z
      .number()
      .nonnegative("Discount price cannot be negative.")
      .optional()
      .openapi({
        example: 1499,
      }),

    status: ServiceStatusEnum,

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
  })
  .openapi("Service");

/**
 * ==========================================================
 * CREATE SERVICE
 * POST /services
 * ==========================================================
 */

export const CreateServiceSchema = z
  .object({
    vendor_id: ServiceSchema.shape.vendor_id,

    subcategory_id: ServiceSchema.shape.subcategory_id,

    name: ServiceSchema.shape.name,

    description: ServiceSchema.shape.description,

    duration: ServiceSchema.shape.duration,

    price: ServiceSchema.shape.price,

    discount_price: ServiceSchema.shape.discount_price,

    status: ServiceStatusEnum.default("ACTIVE"),
  })
  .openapi("CreateService");

/**
 * ==========================================================
 * UPDATE SERVICE
 * PUT /services/:id
 * ==========================================================
 */

export const UpdateServiceSchema =
  CreateServiceSchema.partial().openapi(
    "UpdateService"
  );

/**
 * ==========================================================
 * PARAMS
 * ==========================================================
 */

export const ServiceParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .openapi("ServiceParams");

/**
 * ==========================================================
 * QUERY
 * GET /services
 * ==========================================================
 */

export const ServiceQuerySchema = z
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

    vendor_id: z
      .string()
      .uuid()
      .optional(),

    subcategory_id: z
      .string()
      .uuid()
      .optional(),

    status: ServiceStatusEnum.optional(),

    sortBy: z
      .enum([
        "name",
        "duration",
        "price",
        "discount_price",
        "created_at",
        "updated_at",
      ])
      .optional(),

    sortOrder: z
      .enum(["asc", "desc"])
      .default("asc"),
  })
  .openapi("ServiceQuery");

/**
 * ==========================================================
 * SINGLE SERVICE RESPONSE
 * ==========================================================
 */

export const ServiceResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: ServiceSchema,
  })
  .openapi("ServiceResponse");

/**
 * ==========================================================
 * SERVICE LIST RESPONSE
 * ==========================================================
 */

export const ServiceListResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: z.array(ServiceSchema),

    pagination: z.object({
      page: z.number(),

      limit: z.number(),

      total: z.number(),

      totalPages: z.number(),
    }),
  })
  .openapi("ServiceListResponse");

/**
 * ==========================================================
 * DELETE SERVICE RESPONSE
 * ==========================================================
 */

export const DeleteServiceResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),
  })
  .openapi("DeleteServiceResponse");

/**
 * ==========================================================
 * TYPES
 * ==========================================================
 */

export type Service = z.infer<
  typeof ServiceSchema
>;

export type CreateServiceDto = z.infer<
  typeof CreateServiceSchema
>;

export type UpdateServiceDto = z.infer<
  typeof UpdateServiceSchema
>;

export type ServiceQuery = z.infer<
  typeof ServiceQuerySchema
>;

export type ServiceParams = z.infer<
  typeof ServiceParamsSchema
>;