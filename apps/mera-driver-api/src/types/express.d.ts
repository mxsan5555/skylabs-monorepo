import type { User as PrismaUser } from '../generated/prisma';

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User extends PrismaUser {}
  }
}

export {};
