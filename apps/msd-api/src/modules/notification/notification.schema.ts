import { z } from "../../config/zod";

/**
 * ==========================================================
 * NOTIFICATION TYPE
 * ==========================================================
 *
 * Keep this as a string for now because the approved
 * notification types may change based on business requirements.
 */

export const NotificationTypeSchema = z
  .string()
  .trim()
  .min(1, "Notification type is required.")
  .max(50, "Notification type cannot exceed 50 characters.")
  .openapi({
    example: "BOOKING",
  });

/**
 * ==========================================================
 * BASE NOTIFICATION SCHEMA
 * ==========================================================
 */

export const NotificationSchema = z
  .object({
    id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440003",
    }),

    customer_id: z.string().uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440002",
    }),

    title: z
      .string()
      .trim()
      .min(1, "Notification title is required.")
      .max(150, "Notification title cannot exceed 150 characters.")
      .openapi({
        example: "Booking Confirmed",
      }),

    message: z
      .string()
      .trim()
      .min(1, "Notification message is required.")
      .max(1000, "Notification message cannot exceed 1000 characters.")
      .openapi({
        example: "Your spa booking has been confirmed successfully.",
      }),

    type: NotificationTypeSchema,

    is_read: z.boolean().openapi({
      example: false,
    }),

    created_at: z
      .string()
      .datetime()
      .openapi({
        example: "2026-08-07T10:30:00Z",
      }),
  })
  .openapi("Notification");

/**
 * ==========================================================
 * CREATE NOTIFICATION
 * POST /notifications
 * ==========================================================
 */

export const CreateNotificationSchema = z
  .object({
    customer_id: NotificationSchema.shape.customer_id,

    title: NotificationSchema.shape.title,

    message: NotificationSchema.shape.message,

    type: NotificationTypeSchema,

    is_read: NotificationSchema.shape.is_read.default(false),
  })
  .openapi("CreateNotification");

/**
 * ==========================================================
 * UPDATE NOTIFICATION
 * PUT /notifications/:id
 * ==========================================================
 */

export const UpdateNotificationSchema =
  CreateNotificationSchema.partial().openapi(
    "UpdateNotification"
  );

/**
 * ==========================================================
 * PARAMS
 * ==========================================================
 */

export const NotificationParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .openapi("NotificationParams");

/**
 * ==========================================================
 * QUERY
 * GET /notifications
 * ==========================================================
 */

export const NotificationQuerySchema = z
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

    type: NotificationTypeSchema.optional(),

    is_read: z.coerce
      .boolean()
      .optional(),

    sortBy: z
      .enum([
        "title",
        "type",
        "is_read",
        "created_at",
      ])
      .optional(),

    sortOrder: z
      .enum(["asc", "desc"])
      .default("desc"),
  })
  .openapi("NotificationQuery");

/**
 * ==========================================================
 * SINGLE NOTIFICATION RESPONSE
 * ==========================================================
 */

export const NotificationResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: NotificationSchema,
  })
  .openapi("NotificationResponse");

/**
 * ==========================================================
 * NOTIFICATION LIST RESPONSE
 * ==========================================================
 */

export const NotificationListResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),

    data: z.array(NotificationSchema),

    pagination: z.object({
      page: z.number(),

      limit: z.number(),

      total: z.number(),

      totalPages: z.number(),
    }),
  })
  .openapi("NotificationListResponse");

/**
 * ==========================================================
 * DELETE NOTIFICATION RESPONSE
 * ==========================================================
 */

export const DeleteNotificationResponseSchema = z
  .object({
    success: z.boolean(),

    message: z.string(),
  })
  .openapi("DeleteNotificationResponse");

/**
 * ==========================================================
 * TYPES
 * ==========================================================
 */

export type Notification = z.infer<
  typeof NotificationSchema
>;

export type CreateNotificationDto = z.infer<
  typeof CreateNotificationSchema
>;

export type UpdateNotificationDto = z.infer<
  typeof UpdateNotificationSchema
>;

export type NotificationQuery = z.infer<
  typeof NotificationQuerySchema
>;

export type NotificationParams = z.infer<
  typeof NotificationParamsSchema
>;