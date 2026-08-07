import { z } from "../../config/zod";

/**
 * ==========================================================
 * PRODUCT STATUS
 * ==========================================================
 */

export const ProductStatusEnum = z
  .enum(["ACTIVE", "INACTIVE"])
  .openapi({
    example: "ACTIVE",
  });

/**
 * ==========================================================
 * BASE PRODUCT SCHEMA
 * ==========================================================
 */

export const ProductSchema = z
  .object({
    id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440007",
    }),

    vendor_id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440006",
    }),

    category_id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440001",
    }),

    name: z
      .string()
      .trim()
      .min(2, "Product name must be at least 2 characters.")
      .max(150, "Product name cannot exceed 150 characters.")
      .openapi({
        example: "Premium Facial Kit",
      }),

    description: z
      .string()
      .trim()
      .min(1, "Product description is required.")
      .max(2000, "Product description cannot exceed 2000 characters.")
      .openapi({
        example:
          "A premium facial care kit suitable for professional spa treatments.",
      }),

    price: z
      .number()
      .nonnegative("Price cannot be negative.")
      .openapi({
        example: 2499,
      }),

    discount_price: z
      .number()
      .nonnegative("Discount price cannot be negative.")
      .optional()
      .openapi({
        example: 1999,
      }),

    stock: z
      .number()
      .int()
      .nonnegative("Stock cannot be negative.")
      .openapi({
        example: 50,
      }),

    sku: z
      .string()
      .trim()
      .min(1, "SKU is required.")
      .max(100, "SKU cannot exceed 100 characters.")
      .openapi({
        example: "PFK-001",
      }),

    images: z
      .array(z.string().url())
      .openapi({
        example: [
          "https://cdn.myspa.com/products/facial-kit-1.jpg",
          "https://cdn.myspa.com/products/facial-kit-2.jpg",
        ],
      }),

    status: ProductStatusEnum,

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
  .openapi("Product");

/**
 * ==========================================================
 * CREATE PRODUCT
 * POST /products
 * ==========================================================
 */

export const CreateProductSchema = z
  .object({
    vendor_id: ProductSchema.shape.vendor_id,

    category_id: ProductSchema.shape.category_id,

    name: ProductSchema.shape.name,

    description: ProductSchema.shape.description,

    price: ProductSchema.shape.price,

    discount_price: ProductSchema.shape.discount_price,

    stock: ProductSchema.shape.stock,

    sku: ProductSchema.shape.sku,

    images: ProductSchema.shape.images,

    status: ProductStatusEnum.default("ACTIVE"),
  })
  .openapi("CreateProduct");

/**
 * ==========================================================
 * UPDATE PRODUCT
 * PUT /products/:id
 * ==========================================================
 */

export const UpdateProductSchema =
  CreateProductSchema.partial().openapi(
    "UpdateProduct"
  );

/**
 * ==========================================================
 * PARAMS
 * ==========================================================
 */

export const ProductParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .openapi("ProductParams");

/**
 * ==========================================================
 * QUERY
 * GET /products
 * ==========================================================
 */

export const ProductQuerySchema = z
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

    category_id: z
      .string()
      .uuid()
      .optional(),

    status: ProductStatusEnum.optional(),

    sortBy: z
      .enum([
        "name",
        "price",
        "discount_price",
        "stock",
        "created_at",
        "updated_at",
      ])
      .optional(),

    sortOrder: z
      .enum(["asc", "desc"])
      .default("asc"),
  })
  .openapi("ProductQuery");

/**
 * ==========================================================
 * SINGLE PRODUCT RESPONSE
 * ==========================================================
 */

export const ProductResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: ProductSchema,
  })
  .openapi("ProductResponse");

/**
 * ==========================================================
 * PRODUCT LIST RESPONSE
 * ==========================================================
 */

export const ProductListResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: z.array(ProductSchema),

    pagination: z.object({
      page: z.number(),

      limit: z.number(),

      total: z.number(),

      totalPages: z.number(),
    }),
  })
  .openapi("ProductListResponse");

/**
 * ==========================================================
 * DELETE PRODUCT RESPONSE
 * ==========================================================
 */

export const DeleteProductResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),
  })
  .openapi("DeleteProductResponse");

/**
 * ==========================================================
 * TYPES
 * ==========================================================
 */

export type Product = z.infer<
  typeof ProductSchema
>;

export type CreateProductDto = z.infer<
  typeof CreateProductSchema
>;

export type UpdateProductDto = z.infer<
  typeof UpdateProductSchema
>;

export type ProductQuery = z.infer<
  typeof ProductQuerySchema
>;

export type ProductParams = z.infer<
  typeof ProductParamsSchema
>;