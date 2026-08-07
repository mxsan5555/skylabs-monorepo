import { z } from "../../config/zod";

/**
 * ==========================================================
 * BASE WISHLIST SCHEMA
 * ==========================================================
 */

export const WishlistSchema = z
    .object({
        id: z.string().uuid().openapi({
            example: "550e8400-e29b-41d4-a716-446655440012",
        }),

        customer_id: z.string().uuid().openapi({
            example: "550e8400-e29b-41d4-a716-446655440002",
        }),

        service_id: z
            .string()
            .uuid()
            .nullable()
            .optional()
            .openapi({
                example: "550e8400-e29b-41d4-a716-446655440009",
            }),

        product_id: z
            .string()
            .uuid()
            .nullable()
            .optional()
            .openapi({
                example: "550e8400-e29b-41d4-a716-446655440007",
            }),

        created_at: z
            .string()
            .datetime()
            .openapi({
                example: "2026-08-07T10:30:00Z",
            }),
    })
    .openapi("Wishlist");

/**
 * ==========================================================
 * WISHLIST INPUT BASE SCHEMA
 * ==========================================================
 */

const WishlistInputSchema = z.object({
    customer_id: WishlistSchema.shape.customer_id,

    service_id: WishlistSchema.shape.service_id,

    product_id: WishlistSchema.shape.product_id,
});

/**
 * ==========================================================
 * CREATE WISHLIST
 * POST /wishlists
 * ==========================================================
 */

export const CreateWishlistSchema = WishlistInputSchema
    .refine(
        (data) => data.service_id || data.product_id,
        {
            message:
                "Either service_id or product_id is required.",
        }
    )
    .openapi("CreateWishlist");

/**
 * ==========================================================
 * UPDATE WISHLIST
 * PUT /wishlists/:id
 * ==========================================================
 */

export const UpdateWishlistSchema =
    WishlistInputSchema.partial().openapi(
        "UpdateWishlist"
    );
/**
 * ==========================================================
 * PARAMS
 * ==========================================================
 */

export const WishlistParamsSchema = z
    .object({
        id: z.string().uuid(),
    })
    .openapi("WishlistParams");

/**
 * ==========================================================
 * QUERY
 * GET /wishlists
 * ==========================================================
 */

export const WishlistQuerySchema = z
    .object({
        page: z.coerce.number().int().positive().default(1),

        limit: z.coerce
            .number()
            .int()
            .positive()
            .max(100)
            .default(10),

        customer_id: z
            .string()
            .uuid()
            .optional(),

        service_id: z
            .string()
            .uuid()
            .optional(),

        product_id: z
            .string()
            .uuid()
            .optional(),

        sortOrder: z
            .enum(["asc", "desc"])
            .default("desc"),
    })
    .openapi("WishlistQuery");

/**
 * ==========================================================
 * SINGLE WISHLIST RESPONSE
 * ==========================================================
 */

export const WishlistResponseSchema = z
    .object({
        success: z.boolean(),

        message: z.string(),

        data: WishlistSchema,
    })
    .openapi("WishlistResponse");

/**
 * ==========================================================
 * WISHLIST LIST RESPONSE
 * ==========================================================
 */

export const WishlistListResponseSchema = z
    .object({
        success: z.boolean(),

        message: z.string(),

        data: z.array(WishlistSchema),

        pagination: z.object({
            page: z.number(),

            limit: z.number(),

            total: z.number(),

            totalPages: z.number(),
        }),
    })
    .openapi("WishlistListResponse");

/**
 * ==========================================================
 * DELETE WISHLIST RESPONSE
 * ==========================================================
 */

export const DeleteWishlistResponseSchema = z
    .object({
        success: z.boolean(),

        message: z.string(),
    })
    .openapi("DeleteWishlistResponse");

/**
 * ==========================================================
 * TYPES
 * ==========================================================
 */

export type Wishlist = z.infer<
    typeof WishlistSchema
>;

export type CreateWishlistDto = z.infer<
    typeof CreateWishlistSchema
>;

export type UpdateWishlistDto = z.infer<
    typeof UpdateWishlistSchema
>;

export type WishlistQuery = z.infer<
    typeof WishlistQuerySchema
>;

export type WishlistParams = z.infer<
    typeof WishlistParamsSchema
>;