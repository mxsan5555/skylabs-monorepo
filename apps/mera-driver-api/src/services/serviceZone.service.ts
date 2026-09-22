import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

export async function listServiceZones() {
  return prisma.serviceZone.findMany({ orderBy: { createdAt: 'asc' }, take: 1000 });
}

export async function getServiceZoneById(id: string) {
  const row = await prisma.serviceZone.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Service zone not found');
  return row;
}

export async function createServiceZone(input: Record<string, unknown>) {
  return prisma.serviceZone.create({ data: input as never });
}

export async function updateServiceZone(id: string, input: Record<string, unknown>) {
  await getServiceZoneById(id);
  return prisma.serviceZone.update({ where: { id }, data: input as never });
}

export async function deleteServiceZone(id: string) {
  await getServiceZoneById(id);
  await prisma.serviceZone.delete({ where: { id } });
}
