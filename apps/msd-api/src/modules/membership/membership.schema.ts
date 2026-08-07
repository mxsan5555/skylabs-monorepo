import { z } from "../../config/zod";

/**
 * ==========================================================
 * MEMBERSHIP STATUS
 * ==========================================================
 */

export const MembershipStatusEnum = z
  .enum(["ACTIVE", "INACTIVE"])
  .openapi({
    example: "ACTIVE",
  });

/**
 * ==========================================================
 * BASE MEMBERSHIP SCHEMA
 * ==========================================================
 */

export const MembershipSchema = z
  .object({
    id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440004",
    }),

    name: z
      .string()
      .trim()
      .min(2, "Membership name must be at least 2 characters.")
      .max(100, "Membership name cannot exceed 100 characters.")
      .openapi({
        example: "Premium Membership",
      }),

    price: z
      .number()
      .nonnegative("Price cannot be negative.")
      .openapi({
        example: 1999,
      }),

    duration: z
      .number()
      .int()
      .positive("Duration must be greater than 0.")
      .openapi({
        example: 30,
      }),

    benefits: z
      .array(z.string().trim().min(1))
      .openapi({
        example: [
          "20% discount on spa services",
          "Priority booking",
          "Free consultation",
        ],
      }),

    status: MembershipStatusEnum,

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
  .openapi("Membership");

/**
 * ==========================================================
 * CREATE MEMBERSHIP
 * POST /memberships
 * ==========================================================
 */

export const CreateMembershipSchema = z
  .object({
    name: MembershipSchema.shape.name,

    price: MembershipSchema.shape.price,

    duration: MembershipSchema.shape.duration,

    benefits: MembershipSchema.shape.benefits,

    status: MembershipStatusEnum.default("ACTIVE"),
  })
  .openapi("CreateMembership");

/**
 * ==========================================================
 * UPDATE MEMBERSHIP
 * PUT /memberships/:id
 * ==========================================================
 */

export const UpdateMembershipSchema =
  CreateMembershipSchema.partial().openapi(
    "UpdateMembership"
  );

/**
 * ==========================================================
 * PARAMS
 * ==========================================================
 */

export const MembershipParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .openapi("MembershipParams");

/**
 * ==========================================================
 * QUERY
 * GET /memberships
 * ==========================================================
 */

export const MembershipQuerySchema = z
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

    status: MembershipStatusEnum.optional(),

    sortBy: z
      .enum([
        "name",
        "price",
        "duration",
        "created_at",
        "updated_at",
      ])
      .optional(),

    sortOrder: z
      .enum(["asc", "desc"])
      .default("asc"),
  })
  .openapi("MembershipQuery");

/**
 * ==========================================================
 * SINGLE MEMBERSHIP RESPONSE
 * ==========================================================
 */

export const MembershipResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: MembershipSchema,
  })
  .openapi("MembershipResponse");

/**
 * ==========================================================
 * MEMBERSHIP LIST RESPONSE
 * ==========================================================
 */

export const MembershipListResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: z.array(MembershipSchema),

    pagination: z.object({
      page: z.number(),

      limit: z.number(),

      total: z.number(),

      totalPages: z.number(),
    }),
  })
  .openapi("MembershipListResponse");

/**
 * ==========================================================
 * DELETE MEMBERSHIP RESPONSE
 * ==========================================================
 */

export const DeleteMembershipResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),
  })
  .openapi("DeleteMembershipResponse");

/**
 * ==========================================================
 * TYPES
 * ==========================================================
 */

export type Membership = z.infer<
  typeof MembershipSchema
>;

export type CreateMembershipDto = z.infer<
  typeof CreateMembershipSchema
>;

export type UpdateMembershipDto = z.infer<
  typeof UpdateMembershipSchema
>;

export type MembershipQuery = z.infer<
  typeof MembershipQuerySchema
>;

export type MembershipParams = z.infer<
  typeof MembershipParamsSchema
>;