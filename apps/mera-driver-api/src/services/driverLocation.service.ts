import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

export async function listDriverLocations() {
  return prisma.driverLocation.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 });
}

export async function getDriverLocationById(id: string) {
  const row = await prisma.driverLocation.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Driver location not found');
  return row;
}

export async function createDriverLocation(input: Record<string, unknown>) {
  return prisma.driverLocation.create({ data: input as never });
}

export async function updateDriverLocation(id: string, input: Record<string, unknown>) {
  await getDriverLocationById(id);
  return prisma.driverLocation.update({ where: { id }, data: input as never });
}

export async function deleteDriverLocation(id: string) {
  await getDriverLocationById(id);
  await prisma.driverLocation.delete({ where: { id } });
}
