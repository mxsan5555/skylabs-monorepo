import { prisma } from '../../lib/prisma-client';

async function recompute(where: { dealId: string } | { companyId: string }) {
  const agg = await prisma.review.aggregate({
    where: { ...where, status: 'PUBLISHED' },
    _avg: { rating: true },
    _count: { rating: true },
  });
  return { avg: agg._avg.rating ?? 0, count: agg._count.rating };
}

export async function recomputeDealRating(dealId: string) {
  const { avg, count } = await recompute({ dealId });
  await prisma.deal.update({ where: { id: dealId }, data: { ratingAvg: avg, ratingCount: count } });
}

export async function recomputeCompanyRating(companyId: string) {
  const { avg, count } = await recompute({ companyId });
  await prisma.company.update({ where: { id: companyId }, data: { ratingAvg: avg, ratingCount: count } });
}

export async function ratingBreakdown(where: { dealId: string } | { companyId: string }) {
  const rows = await prisma.review.groupBy({
    by: ['rating'],
    where: { ...where, status: 'PUBLISHED' },
    _count: { rating: true },
  });
  const breakdown: Record<'1' | '2' | '3' | '4' | '5', number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  for (const row of rows) breakdown[String(row.rating) as keyof typeof breakdown] = row._count.rating;
  return breakdown;
}
