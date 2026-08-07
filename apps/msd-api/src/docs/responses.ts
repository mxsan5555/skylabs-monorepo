import { z } from "../config/zod";

/**
 * Generic Success Response
 */

export const SuccessResponseSchema = z.object({
  success: z.boolean(),

  message: z.string(),
});

/**
 * Generic Error Response
 */

export const ErrorResponseSchema = z.object({
  success: z.literal(false),

  message: z.string(),

  errors: z.array(z.any()).optional(),
});

/**
 * Pagination
 */

export const PaginationSchema = z.object({
  page: z.number(),

  limit: z.number(),

  total: z.number(),

  totalPages: z.number(),
});