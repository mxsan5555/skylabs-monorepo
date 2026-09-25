import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import type { WebsitePageUpdateSchema } from '../schemas/website-page.schema';

type WebsitePageUpdateInput = z.infer<typeof WebsitePageUpdateSchema>;

const WEBSITE_PAGE_ORDER_BY = [{ title: 'asc' as const }];

/** No create/delete — the 4 rows (privacy/terms/accessibility/cookies) are fixed, seeded once by
 *  the `add_cms_content_types` migration (see website-pages.routes.ts's own doc comment). */
export async function listWebsitePages(opts: { page: number; pageSize: number; search?: string }) {
  const where = {
    ...(opts.search ? { title: { contains: opts.search, mode: 'insensitive' as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.websitePage.findMany({
      where,
      orderBy: WEBSITE_PAGE_ORDER_BY,
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.websitePage.count({ where }),
  ]);
  return { items, total };
}

export async function getWebsitePageOrThrow(id: string) {
  const page = await prisma.websitePage.findUnique({ where: { id } });
  if (!page) throw new ApiError('NOT_FOUND', 'Website page not found');
  return page;
}

export async function updateWebsitePage(id: string, input: WebsitePageUpdateInput) {
  await getWebsitePageOrThrow(id);
  return prisma.websitePage.update({
    where: { id },
    data: {
      ...input,
      ...(input.content ? { content: input.content as Prisma.InputJsonValue } : {}),
    },
  });
}

// ─── Public read (GET /catalog/pages/:slug, no auth) — always `status: 'PUBLISHED'`, never
// accepts a caller-supplied override (same "hard-coded visibility gate" convention as
// catalog.service.ts's VISIBLE_DEAL_WHERE). ───────────────────────────────────────────────────

export async function getPublicWebsitePageBySlugOrThrow(slug: string) {
  const page = await prisma.websitePage.findFirst({ where: { slug, status: 'PUBLISHED' } });
  if (!page) throw new ApiError('NOT_FOUND', 'Page not found');
  return page;
}
