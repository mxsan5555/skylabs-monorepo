import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { blogBlockSchema } from './blog-post.schema';

extendZodWithOpenApi(z);

/** All fields optional — About Us is a singleton row, always edited via PATCH (no separate
 *  create step; site-content.service.ts's updateAboutUs upserts). */
export const AboutUsUpdateSchema = z
  .object({
    heroTitle: z.string().max(200).optional(),
    heroSubtitle: z.string().max(300).optional(),
    missionStatement: z.string().max(2000).optional(),
    body: z.array(blogBlockSchema).optional(),
    /** Optional SEO overrides for the public About Us page — same convention as
     *  blog-post.schema.ts's own metaTitle/metaDescription. */
    metaTitle: z.string().max(200).optional(),
    metaDescription: z.string().max(300).optional(),
  })
  .openapi('AboutUsUpdate');

/** Same "all optional, singleton PATCH-only" shape as AboutUsUpdateSchema above. */
export const ContactUsUpdateSchema = z
  .object({
    address: z.string().max(500).optional(),
    phone: z.string().max(30).optional(),
    email: z.string().email().optional(),
    mapEmbedUrl: z.string().url().optional(),
    socialLinks: z.array(z.object({ platform: z.string().min(1).max(60), url: z.string().url() })).optional(),
    /** Optional SEO overrides for the public Contact Us page — same convention as
     *  blog-post.schema.ts's own metaTitle/metaDescription. */
    metaTitle: z.string().max(200).optional(),
    metaDescription: z.string().max(300).optional(),
  })
  .openapi('ContactUsUpdate');
