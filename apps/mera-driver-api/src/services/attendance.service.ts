import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

export async function listAttendance() {
  return prisma.attendanceRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 });
}

export async function getAttendanceById(id: string) {
  const record = await prisma.attendanceRecord.findUnique({ where: { id } });
  if (!record) throw new HttpError(404, 'NOT_FOUND', 'Attendance record not found');
  return record;
}

export async function createAttendance(input: Record<string, unknown>) {
  return prisma.attendanceRecord.create({ data: input as never });
}

export async function updateAttendance(id: string, input: Record<string, unknown>) {
  await getAttendanceById(id);
  return prisma.attendanceRecord.update({ where: { id }, data: input as never });
}

export async function deleteAttendance(id: string) {
  await getAttendanceById(id);
  await prisma.attendanceRecord.delete({ where: { id } });
}
