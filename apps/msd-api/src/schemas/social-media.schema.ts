import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

/** Admin listing (`GET /social-media`) — `search` matches `displayName` (see
 *  social-media.service.ts#listSocialMediaLinks). Every row is returned regardless of
 *  `isActive` (the admin caller is already permission-gated on 'cms.social-media:view') — only
 *  the public read (`GET /catalog/social-links`) hard-codes active-only. */
export const SocialMediaLinkListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
});

const SocialMediaLinkFieldsSchema = z.object({
  /** Free text (facebook/instagram/youtube/linkedin/x/whatsapp/...) — the frontend maps known
   *  keys to icons with a generic fallback for anything else (see schema.prisma's own doc
   *  comment on SocialMediaLink.platform). */
  platform: z.string().min(1).max(60),
  displayName: z.string().min(1).max(150),
  url: z.string().url().max(500),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().optional(),
});

export const SocialMediaLinkCreateSchema = SocialMediaLinkFieldsSchema.openapi('SocialMediaLinkCreate');
export const SocialMediaLinkUpdateSchema = SocialMediaLinkFieldsSchema.partial().openapi('SocialMediaLinkUpdate');
