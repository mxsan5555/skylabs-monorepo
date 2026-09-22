import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';
import { blogBlockSchema } from './blog-post.schema';

extendZodWithOpenApi(z);

/** `GET /website-pages` — the 4 fixed legal pages (Privacy Policy/Terms of Service/
 *  Accessibility/Cookie Policy). No `status` filter — unlike Blog Posts there are only ever 4
 *  rows, so the admin screen always lists all of them. */
export const WebsitePageListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
});

/** No create/delete schema — these 4 rows are fixed (seeded once by the `add_cms_content_types`
 *  migration) and only ever edited in place via `PATCH /website-pages/{id}` (see
 *  website-pages.routes.ts's own doc comment). `slug` is deliberately not editable — it's the
 *  page's stable public URL key. */
export const WebsitePageUpdateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    content: z.array(blogBlockSchema).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    metaTitle: z.string().max(200).optional(),
    metaDescription: z.string().max(300).optional(),
  })
  .openapi('WebsitePageUpdate');
