import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

export async function listVehicles() {
  return prisma.vehicle.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 });
}

export async function getVehicleById(id: string) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle) throw new HttpError(404, 'NOT_FOUND', 'Vehicle not found');
  return vehicle;
}

export async function createVehicle(input: Record<string, unknown>) {
  return prisma.vehicle.create({ data: input as never });
}

export async function updateVehicle(id: string, input: Record<string, unknown>) {
  await getVehicleById(id);
  return prisma.vehicle.update({ where: { id }, data: input as never });
}

export async function deleteVehicle(id: string) {
  await getVehicleById(id);
  await prisma.vehicle.delete({ where: { id } });
}
