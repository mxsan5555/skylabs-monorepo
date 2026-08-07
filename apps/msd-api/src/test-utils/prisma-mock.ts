import { vi } from 'vitest';

/**
 * A fully-mocked shape of `lib/prisma`'s `PrismaClient` singleton, covering every model +
 * method the RBAC/auth services call. Tests `vi.mock('../../lib/prisma', ...)` with this
 * factory so routes/services run for real against a fake DB boundary, instead of either
 * hitting a real Postgres or stubbing out whole service functions.
 *
 * Every leaf is a bare `vi.fn()` with no default resolution — each test arranges the exact
 * calls it needs via `mockResolvedValue`/`mockResolvedValueOnce`. Call `resetPrismaMock()`
 * between tests (see afterEach in each spec) to clear call history and implementations.
 */
export function createPrismaMock() {
  const mock = {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    permission: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    rolePermission: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    userRole: {
      findMany: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    dashboardWidget: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    roleDashboardWidget: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    otpChallenge: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    refreshSession: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    loginHistory: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    impersonationSession: {
      create: vi.fn(),
    },
    // Default behavior mirrors real Prisma: array-form runs the (already-invoked, since JS
    // evaluates arguments eagerly) promises concurrently; callback-form invokes the callback
    // with the same mock standing in for `tx`. Override with mockResolvedValueOnce/etc. per test.
    $transaction: vi.fn((arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: unknown) => unknown)(mock);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  return mock;
}

export type PrismaMock = ReturnType<typeof createPrismaMock>;
