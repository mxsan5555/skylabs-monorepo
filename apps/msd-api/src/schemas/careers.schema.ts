import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

/** Singleton row (same "id is always 'singleton'" convention as AboutUsContent) — the "Careers"
 *  page's hero copy only; the actual open roles are the separate CareersJobListing CRUD below. */
export const CareersPageContentUpdateSchema = z
  .object({
    heroTitle: z.string().max(200).optional(),
    heroSubtitle: z.string().max(300).optional(),
    metaTitle: z.string().max(200).optional(),
    metaDescription: z.string().max(300).optional(),
  })
  .openapi('CareersPageContentUpdate');

/** `search` matches `jobTitle` (see careers.service.ts#listCareersJobListings); `status` narrows
 *  to DRAFT/PUBLISHED — unlike the public catalog read, an admin caller MAY filter by any status,
 *  since this endpoint is permission-gated on 'cms.careers:view'. */
export const CareersJobListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
});

const CareersJobListingFieldsSchema = z.object({
  jobTitle: z.string().min(1).max(200),
  department: z.string().min(1).max(150),
  location: z.string().min(1).max(200),
  /** Free string — Full-time/Part-time/Contract/Internship/Freelance is enforced client-side
   *  only (a dropdown), not a DB enum, so HR can add a new employment type without a schema
   *  change (see schema.prisma's own doc comment on CareersJobListing.employmentType). */
  employmentType: z.string().min(1).max(60),
  description: z.string().min(1).max(5000),
  responsibilities: z.string().min(1).max(5000),
  requirements: z.string().min(1).max(5000),
  applyUrl: z.string().url().max(500).optional(),
  applyInstructions: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const CareersJobListingCreateSchema = CareersJobListingFieldsSchema.openapi('CareersJobListingCreate');
export const CareersJobListingUpdateSchema = CareersJobListingFieldsSchema.partial().openapi('CareersJobListingUpdate');
export const CareersJobListingStatusUpdateSchema = z
  .object({ status: z.enum(['DRAFT', 'PUBLISHED']) })
  .openapi('CareersJobListingStatusUpdate');
