import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma';

// Short-lived, single-use code traded for the real JWT after a Google OAuth
// callback, so the JWT itself never sits in a redirect URL (history/Referer risk).
const EXCHANGE_CODE_TTL_SECONDS = 60;

export async function createExchangeCode(prisma: PrismaClient, userId: string): Promise<string> {
  const code = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + EXCHANGE_CODE_TTL_SECONDS * 1000);
  await prisma.exchangeCode.create({ data: { id: code, userId, expiresAt } });
  return code;
}

export async function consumeExchangeCode(prisma: PrismaClient, code: string): Promise<string | null> {
  const record = await prisma.exchangeCode.findUnique({ where: { id: code } });
  if (!record || record.consumedAt || record.expiresAt < new Date()) return null;
  await prisma.exchangeCode.update({ where: { id: code }, data: { consumedAt: new Date() } });
  return record.userId;
}
