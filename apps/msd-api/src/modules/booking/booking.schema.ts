import { z } from "../../config/zod";

/**
 * ==========================================================
 * ENUMS
 * ==========================================================
 */

/**
 * Booking Status
 */
export const BookingStatusEnum = z
  .enum([
    "PENDING",
    "CONFIRMED",
    "CANCELLED",
    "COMPLETED",
  ])
  .openapi({
    example: "PENDING",
  });

/**
 * Payment Status
 */
export const PaymentStatusEnum = z
  .enum([
    "PENDING",
    "PAID",
    "FAILED",
    "REFUNDED",
  ])
  .openapi({
    example: "PENDING",
  });

/**
 * ==========================================================
 * BASE BOOKING SCHEMA
 * ==========================================================
 */

export const BookingSchema = z
  .object({
    id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440011",
    }),

    customer_id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440002",
    }),

    vendor_id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440008",
    }),

    service_id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440009",
    }),

    booking_date: z
      .string()
      .date()
      .openapi({
        example: "2026-08-15",
      }),

    booking_time: z
      .string()
      .regex(
        /^([01]\d|2[0-3]):([0-5]\d)$/,
        "Invalid booking time. Use HH:mm format."
      )
      .openapi({
        example: "14:30",
      }),

    amount: z
      .number()
      .nonnegative("Amount cannot be negative.")
      .openapi({
        example: 1999,
      }),

    discount: z
      .number()
      .nonnegative("Discount cannot be negative.")
      .openapi({
        example: 200,
      }),

    final_amount: z
      .number()
      .nonnegative("Final amount cannot be negative.")
      .openapi({
        example: 1799,
      }),

    booking_status: BookingStatusEnum,

    payment_status: PaymentStatusEnum,

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
  .openapi("Booking");

/**
 * ==========================================================
 * CREATE BOOKING
 * POST /bookings
 * ==========================================================
 */

export const CreateBookingSchema = z
  .object({
    customer_id: BookingSchema.shape.customer_id,

    vendor_id: BookingSchema.shape.vendor_id,

    service_id: BookingSchema.shape.service_id,

    booking_date: BookingSchema.shape.booking_date,

    booking_time: BookingSchema.shape.booking_time,

    amount: BookingSchema.shape.amount,

    discount: BookingSchema.shape.discount.default(0),

    final_amount: BookingSchema.shape.final_amount,

    booking_status: BookingStatusEnum.default(
      "PENDING"
    ),

    payment_status: PaymentStatusEnum.default(
      "PENDING"
    ),
  })
  .openapi("CreateBooking");

/**
 * ==========================================================
 * UPDATE BOOKING
 * PUT /bookings/:id
 * ==========================================================
 */

export const UpdateBookingSchema =
  CreateBookingSchema.partial().openapi(
    "UpdateBooking"
  );

/**
 * ==========================================================
 * PARAMS
 * ==========================================================
 */

export const BookingParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .openapi("BookingParams");

/**
 * ==========================================================
 * QUERY
 * GET /bookings
 * ==========================================================
 */

export const BookingQuerySchema = z
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

    vendor_id: z
      .string()
      .uuid()
      .optional(),

    service_id: z
      .string()
      .uuid()
      .optional(),

    booking_date: z
      .string()
      .date()
      .optional(),

    booking_status: BookingStatusEnum.optional(),

    payment_status: PaymentStatusEnum.optional(),

    sortBy: z
      .enum([
        "booking_date",
        "booking_time",
        "amount",
        "discount",
        "final_amount",
        "created_at",
        "updated_at",
      ])
      .optional(),

    sortOrder: z
      .enum(["asc", "desc"])
      .default("desc"),
  })
  .openapi("BookingQuery");

/**
 * ==========================================================
 * SINGLE BOOKING RESPONSE
 * ==========================================================
 */

export const BookingResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: BookingSchema,
  })
  .openapi("BookingResponse");

/**
 * ==========================================================
 * BOOKING LIST RESPONSE
 * ==========================================================
 */

export const BookingListResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: z.array(BookingSchema),

    pagination: z.object({
      page: z.number(),

      limit: z.number(),

      total: z.number(),

      totalPages: z.number(),
    }),
  })
  .openapi("BookingListResponse");

/**
 * ==========================================================
 * DELETE BOOKING RESPONSE
 * ==========================================================
 */

export const DeleteBookingResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),
  })
  .openapi("DeleteBookingResponse");

/**
 * ==========================================================
 * TYPES
 * ==========================================================
 */

export type Booking = z.infer<
  typeof BookingSchema
>;

export type CreateBookingDto = z.infer<
  typeof CreateBookingSchema
>;

export type UpdateBookingDto = z.infer<
  typeof UpdateBookingSchema
>;

export type BookingQuery = z.infer<
  typeof BookingQuerySchema
>;

export type BookingParams = z.infer<
  typeof BookingParamsSchema
>;