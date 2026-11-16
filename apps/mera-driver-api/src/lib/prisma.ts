import { PrismaClient } from '../generated/prisma-client';

// Keep a single Prisma client per Node process. Re-importing the module (or a hot-reload
// test script) can otherwise create multiple pools and exhaust the Postgres connection limit.
const globalForPrisma = globalThis as typeof globalThis & {
  __meraDriverApiPrisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.__meraDriverApiPrisma ?? new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

globalForPrisma.__meraDriverApiPrisma = prisma;
