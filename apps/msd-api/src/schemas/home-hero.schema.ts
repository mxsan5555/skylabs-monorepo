import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

/** `state: null` (omitted) means the Global/Default slider slot — see `HomeHeroSlide`'s schema
 *  doc comment and `home-hero.service.ts`'s publish-eligibility gate. */
export const HomeHeroSlideListQuerySchema = PaginationQuerySchema.extend({
  state: z.string().max(100).optional(),
});

const HomeHeroSlideFieldsSchema = z.object({
  dealId: z.string().uuid(),
  state: z.string().max(100).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

export const HomeHeroSlideCreateSchema = HomeHeroSlideFieldsSchema.openapi('HomeHeroSlideCreate');
export const HomeHeroSlideUpdateSchema = HomeHeroSlideFieldsSchema.partial().openapi('HomeHeroSlideUpdate');
export const HomeHeroSlideStatusUpdateSchema = z.object({ isActive: z.boolean() }).openapi('HomeHeroSlideStatusUpdate');

export const PublicHomeHeroQuerySchema = z.object({
  state: z.string().max(100).optional(),
});
