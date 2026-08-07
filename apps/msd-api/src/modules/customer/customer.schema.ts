import { z } from "../../config/zod";

/**
 * ==========================================================
 * ENUMS
 * ==========================================================
 */

/**
 * Customer Gender
 *
 * Adjust these values if the approved business requirement
 * uses different values.
 */
export const CustomerGenderEnum = z
  .enum(["MALE", "FEMALE", "OTHER"])
  .openapi({
    example: "MALE",
  });

/**
 * Customer Status
 */
export const CustomerStatusEnum = z
  .enum(["ACTIVE", "INACTIVE"])
  .openapi({
    example: "ACTIVE",
  });

/**
 * ==========================================================
 * BASE CUSTOMER SCHEMA
 * ==========================================================
 */

export const CustomerSchema = z
  .object({
    id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440002",
    }),

    firstName: z
      .string()
      .trim()
      .min(2, "First name must be at least 2 characters.")
      .max(50, "First name cannot exceed 50 characters.")
      .openapi({
        example: "Raj",
      }),

    lastName: z
      .string()
      .trim()
      .min(2, "Last name must be at least 2 characters.")
      .max(50, "Last name cannot exceed 50 characters.")
      .openapi({
        example: "Upadhyay",
      }),

    email: z
      .string()
      .trim()
      .email("Invalid email address.")
      .max(150, "Email cannot exceed 150 characters.")
      .openapi({
        example: "raj@example.com",
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

    gender: CustomerGenderEnum,

    dob: z
      .string()
      .date()
      .optional()
      .openapi({
        example: "1998-05-15",
      }),

    profileImage: z
      .string()
      .url()
      .optional()
      .openapi({
        example:
          "https://cdn.myspa.com/profiles/customer-123.jpg",
      }),

    status: CustomerStatusEnum,

    createdAt: z
      .string()
      .datetime()
      .openapi({
        example: "2026-08-07T10:30:00Z",
      }),

    updatedAt: z
      .string()
      .datetime()
      .openapi({
        example: "2026-08-07T11:30:00Z",
      }),
  })
  .openapi("Customer");

/**
 * ==========================================================
 * CREATE CUSTOMER
 * POST /customers
 * ==========================================================
 */

export const CreateCustomerSchema = z
  .object({
    firstName: CustomerSchema.shape.firstName,

    lastName: CustomerSchema.shape.lastName,

    email: CustomerSchema.shape.email,

    phone: CustomerSchema.shape.phone,

    gender: CustomerGenderEnum,

    dob: CustomerSchema.shape.dob,

    profileImage: CustomerSchema.shape.profileImage,

    status: CustomerStatusEnum.default("ACTIVE"),
  })
  .openapi("CreateCustomer");

/**
 * ==========================================================
 * UPDATE CUSTOMER
 * PUT /customers/:id
 * ==========================================================
 */

export const UpdateCustomerSchema =
  CreateCustomerSchema.partial().openapi(
    "UpdateCustomer"
  );

/**
 * ==========================================================
 * PARAMS
 * ==========================================================
 */

export const CustomerParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .openapi("CustomerParams");

/**
 * ==========================================================
 * QUERY
 * GET /customers
 * ==========================================================
 */

export const CustomerQuerySchema = z
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

    gender: CustomerGenderEnum.optional(),

    status: CustomerStatusEnum.optional(),

    sortBy: z
      .enum([
        "firstName",
        "lastName",
        "email",
        "createdAt",
        "updatedAt",
      ])
      .optional(),

    sortOrder: z
      .enum(["asc", "desc"])
      .default("asc"),
  })
  .openapi("CustomerQuery");

/**
 * ==========================================================
 * SINGLE CUSTOMER RESPONSE
 * ==========================================================
 */

export const CustomerResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: CustomerSchema,
  })
  .openapi("CustomerResponse");

/**
 * ==========================================================
 * CUSTOMER LIST RESPONSE
 * ==========================================================
 */

export const CustomerListResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: z.array(CustomerSchema),

    pagination: z.object({
      page: z.number(),

      limit: z.number(),

      total: z.number(),

      totalPages: z.number(),
    }),
  })
  .openapi("CustomerListResponse");

/**
 * ==========================================================
 * DELETE CUSTOMER RESPONSE
 * ==========================================================
 */

export const DeleteCustomerResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),
  })
  .openapi("DeleteCustomerResponse");

/**
 * ==========================================================
 * TYPES
 * ==========================================================
 */

export type Customer = z.infer<typeof CustomerSchema>;

export type CreateCustomerDto = z.infer<
  typeof CreateCustomerSchema
>;

export type UpdateCustomerDto = z.infer<
  typeof UpdateCustomerSchema
>;

export type CustomerQuery = z.infer<
  typeof CustomerQuerySchema
>;

export type CustomerParams = z.infer<
  typeof CustomerParamsSchema
>;

