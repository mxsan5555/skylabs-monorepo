import { z } from "../../config/zod";

/**
 * ==========================================================
 * ENUMS
 * ==========================================================
 */

export const CategoryStatusEnum = z.enum(["ACTIVE", "INACTIVE"]);

/**
 * ==========================================================
 * BASE CATEGORY
 * ==========================================================
 */

export const CategorySchema = z
  .object({
    id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),

    name: z.string().trim().min(3).max(100).openapi({
      example: "Spa",
    }),

    slug: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .regex(/^[a-z0-9-]+$/)
      .openapi({
        example: "spa",
      }),

    description: z.string().max(500).optional().openapi({
      example: "Spa related services",
    }),

    icon: z.string().url().optional().openapi({
      example: "https://cdn.myspa.com/icon.png",
    }),

    banner: z.string().url().optional().openapi({
      example: "https://cdn.myspa.com/banner.jpg",
    }),

    displayOrder: z.number().int().nonnegative().default(0).openapi({
      example: 1,
    }),

    status: CategoryStatusEnum.openapi({
      example: "ACTIVE",
    }),

    createdAt: z.string().datetime().openapi({
      example: "2026-08-06T10:30:00Z",
    }),

    updatedAt: z.string().datetime().openapi({
      example: "2026-08-06T10:30:00Z",
    }),
  })
  .openapi("Category");

  export const CreateCategorySchema = z
  .object({
    name: CategorySchema.shape.name,

    slug: CategorySchema.shape.slug,

    description: CategorySchema.shape.description,

    icon: CategorySchema.shape.icon,

    banner: CategorySchema.shape.banner,

    displayOrder: CategorySchema.shape.displayOrder,

    status: CategoryStatusEnum.default("ACTIVE"),
  })
  .openapi("CreateCategory");

  export const UpdateCategorySchema =
  CreateCategorySchema.partial().openapi(
    "UpdateCategory"
  );

  export const CategoryParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .openapi("CategoryParams");

  export const CategoryQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),

    limit: z.coerce.number().int().positive().max(100).default(10),

    search: z.string().optional(),

    status: CategoryStatusEnum.optional(),

    sortBy: z
      .enum([
        "name",
        "displayOrder",
        "createdAt",
      ])
      .optional(),

    sortOrder: z
      .enum(["asc", "desc"])
      .default("asc"),
  })
  .openapi("CategoryQuery");

  export const CategoryResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: CategorySchema,
  })
  .openapi("CategoryResponse");

  export const CategoryListResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: z.array(CategorySchema),

    pagination: z.object({
      page: z.number(),

      limit: z.number(),

      total: z.number(),

      totalPages: z.number(),
    }),
  })
  .openapi("CategoryListResponse");

  export const DeleteCategoryResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),
  })
  .openapi("DeleteCategoryResponse");

  export type Category = z.infer<typeof CategorySchema>;

export type CreateCategoryDto = z.infer<
  typeof CreateCategorySchema
>;

export type UpdateCategoryDto = z.infer<
  typeof UpdateCategorySchema
>;

export type CategoryQuery = z.infer<
  typeof CategoryQuerySchema
>;

export type CategoryParams = z.infer<
  typeof CategoryParamsSchema
>;