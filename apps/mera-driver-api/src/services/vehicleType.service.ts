import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

export async function listVehicleTypes() {
  return prisma.vehicleType.findMany({ orderBy: { createdAt: 'asc' }, take: 1000 });
}

export async function getVehicleTypeById(id: string) {
  const row = await prisma.vehicleType.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Vehicle type not found');
  return row;
}

export async function createVehicleType(input: Record<string, unknown>) {
  return prisma.vehicleType.create({ data: input as never });
}

export async function updateVehicleType(id: string, input: Record<string, unknown>) {
  await getVehicleTypeById(id);
  return prisma.vehicleType.update({ where: { id }, data: input as never });
}

export async function deleteVehicleType(id: string) {
  await getVehicleTypeById(id);
  await prisma.vehicleType.delete({ where: { id } });
}
