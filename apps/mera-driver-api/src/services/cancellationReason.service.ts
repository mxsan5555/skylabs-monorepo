import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

export async function listCancellationReasons() {
  return prisma.cancellationReason.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 });
}

export async function getCancellationReasonById(id: string) {
  const row = await prisma.cancellationReason.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Cancellation reason not found');
  return row;
}

export async function createCancellationReason(input: Record<string, unknown>) {
  return prisma.cancellationReason.create({ data: input as never });
}

export async function updateCancellationReason(id: string, input: Record<string, unknown>) {
  await getCancellationReasonById(id);
  return prisma.cancellationReason.update({ where: { id }, data: input as never });
}

export async function deleteCancellationReason(id: string) {
  await getCancellationReasonById(id);
  await prisma.cancellationReason.delete({ where: { id } });
}
