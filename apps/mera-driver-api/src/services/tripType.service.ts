import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

export async function listTripTypes() {
  return prisma.tripType.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 });
}

export async function getTripTypeById(id: string) {
  const row = await prisma.tripType.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Trip type not found');
  return row;
}

export async function createTripType(input: Record<string, unknown>) {
  return prisma.tripType.create({ data: input as never });
}

export async function updateTripType(id: string, input: Record<string, unknown>) {
  await getTripTypeById(id);
  return prisma.tripType.update({ where: { id }, data: input as never });
}

export async function deleteTripType(id: string) {
  await getTripTypeById(id);
  await prisma.tripType.delete({ where: { id } });
}
