import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { htmlToPlainText } from '../lib/rich-text';

extendZodWithOpenApi(z);

/**
 * A `<sky-rich-text-editor>`-backed field (Deal/Product/Therapist description/notes/policy/
 * terms/bio) — the length limit is checked against *meaningful* text (tags stripped), never the
 * raw HTML string, so formatting markup never eats into a content limit the UI never let the
 * editor expose as a character count. Sanitization itself happens at save time in each entity's
 * own service layer (`sanitizeRichText`) — this schema only validates length; it never trusts
 * the client's HTML as already-clean. Shared by `vendor.schema.ts` (Deal/Therapist) and
 * `product.schema.ts` rather than duplicated.
 */
export function richTextField(maxPlainTextLength: number) {
  return z
    .string()
    .optional()
    .refine((val) => !val || htmlToPlainText(val).length <= maxPlainTextLength, {
      message: `Must be ${maxPlainTextLength} characters or fewer (formatting markup not counted).`,
    });
}

export const ErrorObjectSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  })
  .openapi('ErrorObject');

export const UuidParamSchema = z.object({
  id: z.string().uuid(),
});

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
