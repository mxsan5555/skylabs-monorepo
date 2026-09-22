import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import type { FaqCreateSchema, FaqUpdateSchema } from '../schemas/faq.schema';

type FaqCreateInput = z.infer<typeof FaqCreateSchema>;
type FaqUpdateInput = z.infer<typeof FaqUpdateSchema>;

const FAQ_ORDER_BY = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

/** The full admin CRUD list — paginated, every row regardless of `isActive` (the admin caller is
 *  already permission-gated on 'cms.faq:view' — see `listPublicFaqs` below for the public,
 *  active-only equivalent). */
export async function listFaqs(opts: { page: number; pageSize: number; search?: string }) {
  const where = {
    ...(opts.search ? { question: { contains: opts.search, mode: 'insensitive' as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.faq.findMany({
      where,
      orderBy: FAQ_ORDER_BY,
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.faq.count({ where }),
  ]);
  return { items, total };
}

export async function getFaqOrThrow(id: string) {
  const faq = await prisma.faq.findUnique({ where: { id } });
  if (!faq) throw new ApiError('NOT_FOUND', 'FAQ not found');
  return faq;
}

export async function createFaq(input: FaqCreateInput) {
  return prisma.faq.create({ data: input });
}

export async function updateFaq(id: string, input: FaqUpdateInput) {
  await getFaqOrThrow(id);
  return prisma.faq.update({ where: { id }, data: input });
}

export async function setFaqStatus(id: string, isActive: boolean) {
  await getFaqOrThrow(id);
  return prisma.faq.update({ where: { id }, data: { isActive } });
}

export async function deleteFaq(id: string) {
  await getFaqOrThrow(id);
  await prisma.faq.delete({ where: { id } });
}

/** Public, unauthenticated read (`GET /catalog/faqs`) — always `isActive: true`, never accepts a
 *  caller-supplied override (same "hard-coded visibility gate" convention as
 *  `catalog.service.ts`'s `VISIBLE_DEAL_WHERE`). No pagination — the home page's FAQ accordion
 *  renders the whole active list in one shot, matching the static `content.json` list it
 *  replaces. Only `question`/`answer` are exposed — no `isActive`/`sortOrder`/timestamps, which
 *  are admin-only bookkeeping the public page never needs. */
export async function listPublicFaqs() {
  return prisma.faq.findMany({
    where: { isActive: true },
    orderBy: FAQ_ORDER_BY,
    select: { id: true, question: true, answer: true },
  });
}
