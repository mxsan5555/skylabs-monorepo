import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

export async function listBookings() {
  return prisma.booking.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 });
}

export async function getBookingById(id: string) {
  const row = await prisma.booking.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Booking not found');
  return row;
}

export async function createBooking(input: Record<string, unknown>) {
  return prisma.booking.create({ data: input as never });
}

export async function updateBooking(id: string, input: Record<string, unknown>) {
  await getBookingById(id);
  return prisma.booking.update({ where: { id }, data: input as never });
}

export async function deleteBooking(id: string) {
  await getBookingById(id);
  await prisma.booking.delete({ where: { id } });
}
