import '../config/env';

import { PrismaClient } from '../generated/prisma-client';

const globalForPrisma = globalThis as typeof globalThis & {
  __msdApiPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.__msdApiPrisma ??
  new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__msdApiPrisma = prisma;
}