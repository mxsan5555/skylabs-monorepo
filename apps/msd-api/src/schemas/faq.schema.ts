import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

/** Admin listing (`GET /faqs`) — `search` matches `question` (see faq.service.ts#listFaqs). Every
 *  row is returned regardless of `isActive` (the admin caller is already permission-gated on
 *  'cms.faq:view') — only the public read (`GET /catalog/faqs`) ever hard-codes active-only. */
export const FaqListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
});

const FaqFieldsSchema = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(5000),
  /** Manual display-order — same "plain editable integer, ascending" convention as
   *  Category.sortOrder (see category.schema.ts), not a drag-and-drop reorder endpoint. */
  sortOrder: z.number().int().min(0).default(0),
});

export const FaqCreateSchema = FaqFieldsSchema.openapi('FaqCreate');
export const FaqUpdateSchema = FaqFieldsSchema.partial().openapi('FaqUpdate');
export const FaqStatusUpdateSchema = z.object({ isActive: z.boolean() }).openapi('FaqStatusUpdate');
