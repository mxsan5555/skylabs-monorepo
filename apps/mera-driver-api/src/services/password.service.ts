import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

const BCRYPT_ROUNDS = 10;

/** Finds an active, non-deleted user with a password set, by email or phone identifier. */
export async function findUserWithPasswordByIdentifier(identifier: string) {
  const isEmail = identifier.includes('@');
  const user = await prisma.user.findFirst({
    where: { [isEmail ? 'email' : 'phone']: identifier, deletedAt: null },
  });
  return user;
}

/** Verifies a plaintext password against a user's stored hash. `false` for any user with no password set. */
export async function verifyPassword(user: { passwordHash: string | null }, password: string): Promise<boolean> {
  if (!user.passwordHash) return false;
  return bcrypt.compare(password, user.passwordHash);
}

/** Hashes and sets/replaces a user's password (initial set, admin-driven change, or reset). */
export async function setPassword(userId: string, password: string): Promise<void> {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

/** Used by `POST /auth/password/set` — verifies the caller's current password before changing it. */
export async function changeOwnPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');

  // A user who has never set a password (OTP/Google-only) can set one for the first time
  // without proving a "current" password that has never existed.
  if (user.passwordHash) {
    const matches = await verifyPassword(user, currentPassword);
    if (!matches) throw new HttpError(422, 'VALIDATION_ERROR', 'Current password is incorrect');
  }

  await setPassword(userId, newPassword);
}
