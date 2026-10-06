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
  const booking = await getBookingById(id);
  if (booking.farePaise != null && Object.keys(input).some(key => ['status','paymentStatus','driverName','estimatedFare','finalFare','otp','startedAt','completedAt','acceptedAt','scheduledAt','customerId'].includes(key)))
    throw new HttpError(422, 'WORKFLOW_REQUIRED', 'Use dispatch, trip transitions or Accounts for this priced booking');
  return prisma.booking.update({ where: { id }, data: input as never });
}

export async function deleteBooking(id: string) {
  await getBookingById(id);
  await prisma.booking.delete({ where: { id } });
}
