import { z } from "../../config/zod";

/**
 * ==========================================================
 * ENUMS
 * ==========================================================
 */

/**
 * Payment Method
 */
export const PaymentMethodEnum = z
  .enum([
    "CARD",
    "UPI",
    "NET_BANKING",
    "WALLET",
    "CASH",
  ])
  .openapi({
    example: "UPI",
  });

/**
 * Payment Status
 */
export const PaymentStatusEnum = z
  .enum([
    "PENDING",
    "SUCCESS",
    "FAILED",
    "REFUNDED",
  ])
  .openapi({
    example: "SUCCESS",
  });

/**
 * ==========================================================
 * BASE PAYMENT SCHEMA
 * ==========================================================
 */

export const PaymentSchema = z
  .object({
    id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440013",
    }),

    booking_id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440011",
    }),

    customer_id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440002",
    }),

    transaction_id: z
      .string()
      .trim()
      .min(1, "Transaction ID is required.")
      .max(150, "Transaction ID cannot exceed 150 characters.")
      .openapi({
        example: "TXN_20260807123456",
      }),

    payment_gateway: z
      .string()
      .trim()
      .min(1, "Payment gateway is required.")
      .max(100, "Payment gateway cannot exceed 100 characters.")
      .openapi({
        example: "RAZORPAY",
      }),

    payment_method: PaymentMethodEnum,

    amount: z
      .number()
      .nonnegative("Amount cannot be negative.")
      .openapi({
        example: 1799,
      }),

    currency: z
      .string()
      .trim()
      .length(3, "Currency must be a 3-letter code.")
      .toUpperCase()
      .openapi({
        example: "INR",
      }),

    payment_status: PaymentStatusEnum,

    paid_at: z
      .string()
      .datetime()
      .nullable()
      .openapi({
        example: "2026-08-07T10:35:00Z",
      }),

    created_at: z
      .string()
      .datetime()
      .openapi({
        example: "2026-08-07T10:30:00Z",
      }),
  })
  .openapi("Payment");

/**
 * ==========================================================
 * CREATE PAYMENT
 * POST /payments
 * ==========================================================
 */

export const CreatePaymentSchema = z
  .object({
    booking_id: PaymentSchema.shape.booking_id,

    customer_id: PaymentSchema.shape.customer_id,

    transaction_id: PaymentSchema.shape.transaction_id,

    payment_gateway: PaymentSchema.shape.payment_gateway,

    payment_method: PaymentMethodEnum,

    amount: PaymentSchema.shape.amount,

    currency: PaymentSchema.shape.currency.default("INR"),

    payment_status: PaymentStatusEnum.default(
      "PENDING"
    ),

    paid_at: PaymentSchema.shape.paid_at.optional(),
  })
  .openapi("CreatePayment");

/**
 * ==========================================================
 * UPDATE PAYMENT
 * PUT /payments/:id
 * ==========================================================
 */

export const UpdatePaymentSchema =
  CreatePaymentSchema.partial().openapi(
    "UpdatePayment"
  );

/**
 * ==========================================================
 * PARAMS
 * ==========================================================
 */

export const PaymentParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .openapi("PaymentParams");

/**
 * ==========================================================
 * QUERY
 * GET /payments
 * ==========================================================
 */

export const PaymentQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),

    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(100)
      .default(10),

    booking_id: z
      .string()
      .uuid()
      .optional(),

    customer_id: z
      .string()
      .uuid()
      .optional(),

    transaction_id: z
      .string()
      .trim()
      .optional(),

    payment_gateway: z
      .string()
      .trim()
      .optional(),

    payment_method: PaymentMethodEnum.optional(),

    payment_status: PaymentStatusEnum.optional(),

    currency: z
      .string()
      .trim()
      .length(3)
      .toUpperCase()
      .optional(),

    sortBy: z
      .enum([
        "amount",
        "paid_at",
        "created_at",
      ])
      .optional(),

    sortOrder: z
      .enum(["asc", "desc"])
      .default("desc"),
  })
  .openapi("PaymentQuery");

/**
 * ==========================================================
 * SINGLE PAYMENT RESPONSE
 * ==========================================================
 */

export const PaymentResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: PaymentSchema,
  })
  .openapi("PaymentResponse");

/**
 * ==========================================================
 * PAYMENT LIST RESPONSE
 * ==========================================================
 */

export const PaymentListResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: z.array(PaymentSchema),

    pagination: z.object({
      page: z.number(),

      limit: z.number(),

      total: z.number(),

      totalPages: z.number(),
    }),
  })
  .openapi("PaymentListResponse");

/**
 * ==========================================================
 * DELETE PAYMENT RESPONSE
 * ==========================================================
 */

export const DeletePaymentResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),
  })
  .openapi("DeletePaymentResponse");

/**
 * ==========================================================
 * TYPES
 * ==========================================================
 */

export type Payment = z.infer<
  typeof PaymentSchema
>;

export type CreatePaymentDto = z.infer<
  typeof CreatePaymentSchema
>;

export type UpdatePaymentDto = z.infer<
  typeof UpdatePaymentSchema
>;

export type PaymentQuery = z.infer<
  typeof PaymentQuerySchema
>;

export type PaymentParams = z.infer<
  typeof PaymentParamsSchema
>;