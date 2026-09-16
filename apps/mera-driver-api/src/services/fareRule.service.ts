import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

export async function listFareRules() {
  return prisma.fareRule.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 });
}

export async function getFareRuleById(id: string) {
  const row = await prisma.fareRule.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Fare rule not found');
  return row;
}

export async function createFareRule(input: Record<string, unknown>) {
  return prisma.fareRule.create({ data: input as never });
}

export async function updateFareRule(id: string, input: Record<string, unknown>) {
  await getFareRuleById(id);
  return prisma.fareRule.update({ where: { id }, data: input as never });
}

export async function deleteFareRule(id: string) {
  await getFareRuleById(id);
  await prisma.fareRule.delete({ where: { id } });
}
