import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const HomeTagSectionTagSchema = z.enum(['NEW', 'DEAL', 'HOT_DEAL', 'EXPIRE_SOON']);

/** A query string can't carry a literal `null`, so the Global/Default section is requested as
 *  the sentinel `state=__global__` — same convention as `home-hero.schema.ts`. */
export const HomeTagSectionsQuerySchema = z.object({
  state: z.string().max(100).optional(),
});

/** Upserts the one (state, tag) row the Enabled switch controls. */
export const HomeTagSectionEnableSchema = z
  .object({
    state: z.string().trim().min(1).max(100).nullable(),
    tag: HomeTagSectionTagSchema,
    isEnabled: z.boolean(),
  })
  .strict()
  .openapi('HomeTagSectionEnable');

/** Choose the deal; order is assigned server-side (appended last), reordered separately. */
export const HomeTagSectionItemCreateSchema = z
  .object({ dealId: z.string().uuid() })
  .strict()
  .openapi('HomeTagSectionItemCreate');

/** Save a section's whole item order at once; every item id exactly once. */
export const HomeTagSectionItemReorderSchema = z
  .object({ itemIds: z.array(z.string().uuid()).min(1).max(100) })
  .strict()
  .openapi('HomeTagSectionItemReorder');

export const PublicHomeTagSectionsQuerySchema = z.object({
  state: z.string().max(100).optional(),
});
