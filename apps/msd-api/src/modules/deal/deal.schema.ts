import { z } from "../../config/zod";

/**
 * ==========================================================
 * ENUMS
 * ==========================================================
 */

/**
 * Discount Type
 */
export const DiscountTypeEnum = z
  .enum(["PERCENTAGE", "FIXED"])
  .openapi({
    example: "PERCENTAGE",
  });

/**
 * Deal Status
 */
export const DealStatusEnum = z
  .enum(["ACTIVE", "INACTIVE"])
  .openapi({
    example: "ACTIVE",
  });

/**
 * ==========================================================
 * BASE DEAL SCHEMA
 * ==========================================================
 */

export const DealSchema = z
  .object({
    id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440005",
    }),

    vendor_id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440006",
    }),

    title: z
      .string()
      .trim()
      .min(2, "Deal title must be at least 2 characters.")
      .max(150, "Deal title cannot exceed 150 characters.")
      .openapi({
        example: "Summer Spa Special",
      }),

    description: z
      .string()
      .trim()
      .min(1, "Deal description is required.")
      .max(2000, "Deal description cannot exceed 2000 characters.")
      .openapi({
        example:
          "Get an exclusive discount on selected spa services this summer.",
      }),

    discount_type: DiscountTypeEnum,

    discount_value: z
      .number()
      .nonnegative("Discount value cannot be negative.")
      .openapi({
        example: 20,
      }),

    start_date: z
      .string()
      .datetime()
      .openapi({
        example: "2026-08-01T00:00:00Z",
      }),

    end_date: z
      .string()
      .datetime()
      .openapi({
        example: "2026-08-31T23:59:59Z",
      }),

    max_usage: z
      .number()
      .int()
      .positive("Maximum usage must be greater than 0.")
      .optional()
      .openapi({
        example: 100,
      }),

    status: DealStatusEnum,

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
  .openapi("Deal");

/**
 * ==========================================================
 * CREATE DEAL
 * POST /deals
 * ==========================================================
 */

export const CreateDealSchema = z
  .object({
    vendor_id: DealSchema.shape.vendor_id,

    title: DealSchema.shape.title,

    description: DealSchema.shape.description,

    discount_type: DiscountTypeEnum,

    discount_value: DealSchema.shape.discount_value,

    start_date: DealSchema.shape.start_date,

    end_date: DealSchema.shape.end_date,

    max_usage: DealSchema.shape.max_usage,

    status: DealStatusEnum.default("ACTIVE"),
  })
  .openapi("CreateDeal");

/**
 * ==========================================================
 * UPDATE DEAL
 * PUT /deals/:id
 * ==========================================================
 */

export const UpdateDealSchema =
  CreateDealSchema.partial().openapi(
    "UpdateDeal"
  );

/**
 * ==========================================================
 * PARAMS
 * ==========================================================
 */

export const DealParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .openapi("DealParams");

/**
 * ==========================================================
 * QUERY
 * GET /deals
 * ==========================================================
 */

export const DealQuerySchema = z
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

    discount_type: DiscountTypeEnum.optional(),

    status: DealStatusEnum.optional(),

    sortBy: z
      .enum([
        "title",
        "discount_value",
        "start_date",
        "end_date",
        "max_usage",
        "created_at",
        "updated_at",
      ])
      .optional(),

    sortOrder: z
      .enum(["asc", "desc"])
      .default("asc"),
  })
  .openapi("DealQuery");

/**
 * ==========================================================
 * SINGLE DEAL RESPONSE
 * ==========================================================
 */

export const DealResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: DealSchema,
  })
  .openapi("DealResponse");

/**
 * ==========================================================
 * DEAL LIST RESPONSE
 * ==========================================================
 */

export const DealListResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: z.array(DealSchema),

    pagination: z.object({
      page: z.number(),

      limit: z.number(),

      total: z.number(),

      totalPages: z.number(),
    }),
  })
  .openapi("DealListResponse");

/**
 * ==========================================================
 * DELETE DEAL RESPONSE
 * ==========================================================
 */

export const DeleteDealResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),
  })
  .openapi("DeleteDealResponse");

/**
 * ==========================================================
 * TYPES
 * ==========================================================
 */

export type Deal = z.infer<
  typeof DealSchema
>;

export type CreateDealDto = z.infer<
  typeof CreateDealSchema
>;

export type UpdateDealDto = z.infer<
  typeof UpdateDealSchema
>;

export type DealQuery = z.infer<
  typeof DealQuerySchema
>;

export type DealParams = z.infer<
  typeof DealParamsSchema
>;