import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

const LINKED_USER_SELECT = { id: true, name: true, email: true, phone: true } as const;

/** The Driver onboarding form has 4 top-level steps (Personal, Education & Health,
 *  Documents, Payment) — one persistence checkpoint per tab, not per sub-section. */
const TOTAL_ONBOARDING_STEPS = 4;

/**
 * Derives the next `onboardingStatus`/`currentStep`/`completedSteps`/`completionPercentage`
 * after the caller finishes `stepCompleted`. Purely a function of "what step just got
 * completed" + "what was already completed" — never trusts anything else from the client,
 * and is the only place these four columns are ever written.
 */
function computeOnboardingUpdate(existingCompletedSteps: number[] | undefined, stepCompleted: number) {
  const completedSteps = Array.from(new Set([...(existingCompletedSteps ?? []), stepCompleted])).sort((a, b) => a - b);
  const isDone = completedSteps.length >= TOTAL_ONBOARDING_STEPS;
  return {
    completedSteps,
    currentStep: isDone ? TOTAL_ONBOARDING_STEPS : Math.min(stepCompleted + 1, TOTAL_ONBOARDING_STEPS),
    completionPercentage: Math.round((completedSteps.length / TOTAL_ONBOARDING_STEPS) * 100),
    onboardingStatus: isDone ? 'completed' : 'in_progress',
  };
}

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

/**
 * `stepCompleted` (1-4) is stripped off before hitting Prisma — it's not a Driver column,
 * it's the signal that drives `computeOnboardingUpdate`. Omitting it (the admin's plain
 * full-form save, or the driver's own `PATCH /drivers/me`) leaves onboarding progress
 * untouched, so this never regresses a driver's progress when someone edits them outside
 * the step wizard.
 */
export async function createDriver(input: Record<string, unknown>) {
  const { stepCompleted, ...data } = input as Record<string, unknown> & { stepCompleted?: number };
  const onboarding = computeOnboardingUpdate([], stepCompleted ?? TOTAL_ONBOARDING_STEPS);
  const driver = await prisma.driver.create({ data: { ...data, ...onboarding } as never });
  return getDriverById(driver.id);
}

export async function updateDriver(id: string, input: Record<string, unknown>) {
  const existing = await getDriverById(id);
  const { stepCompleted, ...data } = input as Record<string, unknown> & { stepCompleted?: number };
  const onboarding = stepCompleted != null ? computeOnboardingUpdate(existing.completedSteps, stepCompleted) : {};
  await prisma.driver.update({ where: { id }, data: { ...data, ...onboarding } as never });
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
