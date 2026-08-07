import { z } from "../../config/zod";

/**
 * ==========================================================
 * ENUMS
 * ==========================================================
 */

export const SubCategoryStatusEnum = z
  .enum(["ACTIVE", "INACTIVE"])
  .openapi({
    example: "ACTIVE",
  });

/**
 * ==========================================================
 * BASE SUB CATEGORY SCHEMA
 * ==========================================================
 */

export const SubCategorySchema = z
  .object({
    id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440001",
    }),

    categoryId: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440000",
      description: "ID of the parent category.",
    }),

    name: z.string().trim().min(3).max(100).openapi({
      example: "Full Body Massage",
    }),

    slug: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .regex(/^[a-z0-9-]+$/, {
        message:
          "Slug can contain only lowercase letters, numbers and hyphens.",
      })
      .openapi({
        example: "full-body-massage",
      }),

    icon: z.string().url().openapi({
      example: "https://cdn.myspa.com/icons/full-body-massage.png",
      description: "URL of the sub-category icon image.",
    }),

    description: z.string().trim().max(500).optional().openapi({
      example: "Relaxing full body massage services.",
    }),

    status: SubCategoryStatusEnum,

    createdAt: z.string().datetime().openapi({
      example: "2026-08-07T10:30:00Z",
    }),

    updatedAt: z.string().datetime().openapi({
      example: "2026-08-07T10:30:00Z",
    }),
  })
  .openapi("SubCategory");

/**
 * ==========================================================
 * CREATE SUB CATEGORY
 * POST /subcategories
 * ==========================================================
 */

export const CreateSubCategorySchema = z
  .object({
    categoryId: SubCategorySchema.shape.categoryId,

    name: SubCategorySchema.shape.name,

    slug: SubCategorySchema.shape.slug,

    icon: SubCategorySchema.shape.icon,

    description: SubCategorySchema.shape.description,

    status: SubCategoryStatusEnum.default("ACTIVE"),
  })
  .openapi("CreateSubCategory");

/**
 * ==========================================================
 * UPDATE SUB CATEGORY
 * PUT /subcategories/:id
 * ==========================================================
 */

export const UpdateSubCategorySchema =
  CreateSubCategorySchema.partial().openapi("UpdateSubCategory");

/**
 * ==========================================================
 * PARAMS
 * ==========================================================
 */

export const SubCategoryParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .openapi("SubCategoryParams");

/**
 * ==========================================================
 * QUERY
 * GET /subcategories
 * ==========================================================
 */

export const SubCategoryQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),

    limit: z.coerce.number().int().positive().max(100).default(10),

    search: z.string().trim().optional(),

    categoryId: z.string().uuid().optional(),

    status: SubCategoryStatusEnum.optional(),

    sortBy: z
      .enum(["name", "createdAt", "updatedAt"])
      .optional(),

    sortOrder: z
      .enum(["asc", "desc"])
      .default("asc"),
  })
  .openapi("SubCategoryQuery");

/**
 * ==========================================================
 * SINGLE RESPONSE
 * ==========================================================
 */

export const SubCategoryResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: SubCategorySchema,
  })
  .openapi("SubCategoryResponse");

/**
 * ==========================================================
 * LIST RESPONSE
 * ==========================================================
 */

export const SubCategoryListResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: z.array(SubCategorySchema),

    pagination: z.object({
      page: z.number(),

      limit: z.number(),

      total: z.number(),

      totalPages: z.number(),
    }),
  })
  .openapi("SubCategoryListResponse");

/**
 * ==========================================================
 * DELETE RESPONSE
 * ==========================================================
 */

export const DeleteSubCategoryResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),
  })
  .openapi("DeleteSubCategoryResponse");

/**
 * ==========================================================
 * TYPES
 * ==========================================================
 */

export type SubCategory = z.infer<typeof SubCategorySchema>;

export type CreateSubCategoryDto = z.infer<
  typeof CreateSubCategorySchema
>;

export type UpdateSubCategoryDto = z.infer<
  typeof UpdateSubCategorySchema
>;

export type SubCategoryQuery = z.infer<
  typeof SubCategoryQuerySchema
>;

export type SubCategoryParams = z.infer<
  typeof SubCategoryParamsSchema
>;

