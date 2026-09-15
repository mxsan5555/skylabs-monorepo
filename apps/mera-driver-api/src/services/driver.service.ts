import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

const LINKED_USER_SELECT = { id: true, name: true, email: true, phone: true } as const;

export async function listDrivers() {
  return prisma.driver.findMany({
    orderBy: { createdAt: 'desc' },
    take: 1000,
    include: { documents: true, user: { select: LINKED_USER_SELECT } },
  });
}

export async function getDriverById(id: string) {
  const driver = await prisma.driver.findUnique({
    where: { id },
    include: { documents: true, user: { select: LINKED_USER_SELECT } },
  });
  if (!driver) throw new HttpError(404, 'NOT_FOUND', 'Driver not found');
  return driver;
}

export async function createDriver(input: Record<string, unknown>) {
  const driver = await prisma.driver.create({ data: input as never });
  return getDriverById(driver.id);
}

export async function updateDriver(id: string, input: Record<string, unknown>) {
  await getDriverById(id);
  await prisma.driver.update({ where: { id }, data: input as never });
  return getDriverById(id);
}

export async function deleteDriver(id: string) {
  await getDriverById(id);
  await prisma.driver.delete({ where: { id } });
}

export interface AddDriverDocumentInput {
  driverId: string;
  category: string;
  type: string;
  regNo?: string;
  fileName?: string;
  filePath?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export async function addDriverDocument(input: AddDriverDocumentInput) {
  await getDriverById(input.driverId);
  return prisma.driverDocument.create({ data: input });
}

export async function listDriverDocuments(driverId: string) {
  await getDriverById(driverId);
  return prisma.driverDocument.findMany({ where: { driverId }, orderBy: { createdAt: 'desc' } });
}

export async function deleteDriverDocument(driverId: string, docId: string) {
  const doc = await prisma.driverDocument.findFirst({ where: { id: docId, driverId } });
  if (!doc) throw new HttpError(404, 'NOT_FOUND', 'Document not found');
  await prisma.driverDocument.delete({ where: { id: docId } });
  return doc;
}

/**
 * Links a Driver record to a User account, granting that user access to the self-service
 * driver portal (ownership-based — see `resolveOwnDriver`). Auto-assigns the `driver` role
 * if the user doesn't already hold it, so an admin does one action instead of two.
 * `Driver.userId` is `@unique` at the DB level — a second link attempt on an
 * already-linked user fails that constraint, translated to a clean 409 by the shared
 * error handler (same P2002 -> CONFLICT translation added in the Master Data phase).
 */
export async function linkDriverToUser(driverId: string, userId: string) {
  await getDriverById(driverId);

  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');

  const driverRole = await prisma.role.findUnique({ where: { key: 'driver' } });
  if (driverRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: driverRole.id } },
      create: { userId, roleId: driverRole.id },
      update: {},
    });
  }

  await prisma.driver.update({ where: { id: driverId }, data: { userId } });
  return getDriverById(driverId);
}

/** Unlinks a Driver from its User (does not remove the `driver` role — a deliberate
 *  separate decision left to Role Management if an admin also wants that revoked). */
export async function unlinkDriverFromUser(driverId: string) {
  await getDriverById(driverId);
  await prisma.driver.update({ where: { id: driverId }, data: { userId: null } });
  return getDriverById(driverId);
}
