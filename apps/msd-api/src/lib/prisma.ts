import '../config/env';
import { PrismaClient } from '../generated/prisma-client';

// Singleton client (per skylabs-api.md). Custom import path because this schema's
// generator writes to apps/msd-api/src/generated/prisma-client instead of the default
// node_modules/@prisma/client — see the comment atop prisma/schema.prisma for why.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
