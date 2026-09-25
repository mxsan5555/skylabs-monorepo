import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

/** Singleton row (same "id is always 'singleton'" convention as AboutUsContent) — the "How It
 *  Works" page's hero copy only; the numbered steps are the separate HowItWorksStep CRUD below. */
export const HowItWorksContentUpdateSchema = z
  .object({
    heroTitle: z.string().max(200).optional(),
    heroSubtitle: z.string().max(300).optional(),
    metaTitle: z.string().max(200).optional(),
    metaDescription: z.string().max(300).optional(),
  })
  .openapi('HowItWorksContentUpdate');

const HowItWorksStepFieldsSchema = z.object({
  title: z.string().min(1).max(150),
  description: z.string().min(1).max(2000),
  /** A Material Symbols icon name (e.g. "search"), rendered client-side via `<md-icon>`. */
  icon: z.string().max(100).optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().optional(),
});

export const HowItWorksStepCreateSchema = HowItWorksStepFieldsSchema.openapi('HowItWorksStepCreate');
export const HowItWorksStepUpdateSchema = HowItWorksStepFieldsSchema.partial().openapi('HowItWorksStepUpdate');

/** `PATCH /how-it-works/steps/reorder` — an ordered array of every current step's id, same
 *  "must contain exactly this entity's current rows" validation shape as media.service.ts's
 *  `reorderImages` (see how-it-works.service.ts#reorderHowItWorksSteps). */
export const HowItWorksStepReorderSchema = z
  .object({ stepIds: z.array(z.string().uuid()).min(1) })
  .openapi('HowItWorksStepReorder');
