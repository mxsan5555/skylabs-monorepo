import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import type { SocialMediaLinkCreateSchema, SocialMediaLinkUpdateSchema } from '../schemas/social-media.schema';

type SocialMediaLinkCreateInput = z.infer<typeof SocialMediaLinkCreateSchema>;
type SocialMediaLinkUpdateInput = z.infer<typeof SocialMediaLinkUpdateSchema>;

const SOCIAL_MEDIA_LINK_ORDER_BY = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

/** The full admin CRUD list — paginated, every row regardless of `isActive` (the admin caller is
 *  already permission-gated on 'cms.social-media:view' — see `listPublicSocialMediaLinks` below
 *  for the public, active-only equivalent). */
export async function listSocialMediaLinks(opts: { page: number; pageSize: number; search?: string }) {
  const where = {
    ...(opts.search ? { displayName: { contains: opts.search, mode: 'insensitive' as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.socialMediaLink.findMany({
      where,
      orderBy: SOCIAL_MEDIA_LINK_ORDER_BY,
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.socialMediaLink.count({ where }),
  ]);
  return { items, total };
}

export async function getSocialMediaLinkOrThrow(id: string) {
  const link = await prisma.socialMediaLink.findUnique({ where: { id } });
  if (!link) throw new ApiError('NOT_FOUND', 'Social media link not found');
  return link;
}

export async function createSocialMediaLink(input: SocialMediaLinkCreateInput) {
  return prisma.socialMediaLink.create({ data: input });
}

export async function updateSocialMediaLink(id: string, input: SocialMediaLinkUpdateInput) {
  await getSocialMediaLinkOrThrow(id);
  return prisma.socialMediaLink.update({ where: { id }, data: input });
}

export async function deleteSocialMediaLink(id: string) {
  await getSocialMediaLinkOrThrow(id);
  await prisma.socialMediaLink.delete({ where: { id } });
}

// ─── Public read (GET /catalog/social-links, no auth) — always `isActive: true`, never accepts
// a caller-supplied override (same "hard-coded visibility gate" convention as
// catalog.service.ts's VISIBLE_DEAL_WHERE). ───────────────────────────────────────────────────

export async function listPublicSocialMediaLinks() {
  return prisma.socialMediaLink.findMany({
    where: { isActive: true },
    orderBy: SOCIAL_MEDIA_LINK_ORDER_BY,
    select: { id: true, platform: true, displayName: true, url: true },
  });
}
