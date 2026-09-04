import { vi } from 'vitest';

/**
 * Hand-written Prisma mock — there is no reachable Postgres in the test/CI
 * environment for this app yet, so every route/service test mocks `../lib/prisma`
 * with this object instead of hitting a real DB. Each delegate only implements the
 * methods actually called by `src/services/*.ts`; add more as new services need them.
 *
 * Usage (must come from a *different* module than the test file — see the vitest
 * docs on `vi.mock` hoisting — so import `mockPrisma` and reset it, don't redeclare it
 * inline in the factory):
 *
 *   import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';
 *   vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
 *   beforeEach(() => resetPrismaMock());
 */
function delegate() {
  return {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  };
}

function createPrismaMock() {
  return {
    role: delegate(),
    rolePermission: delegate(),
    roleDashboardWidget: delegate(),
    dashboardWidget: delegate(),
    permission: delegate(),
    user: delegate(),
    userRole: delegate(),
    auditLog: delegate(),
    otpChallenge: delegate(),
    refreshSession: delegate(),
    loginHistory: delegate(),
    impersonationSession: delegate(),
    // Supports both `$transaction([...])` (array of already-created promises — just
    // await them as Prisma would) and `$transaction(async (tx) => ...)` (callback
    // form — invoke it with the mock itself standing in for `tx`).
    $transaction: vi.fn(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(mockPrisma);
      return arg;
    }),
  };
}

export const mockPrisma = createPrismaMock();

export type PrismaMock = typeof mockPrisma;

/**
 * Clears call history AND queued return values for every mocked delegate method
 * (so each test starts from a clean slate and must set up its own `mockResolvedValue`s).
 * `$transaction` is deliberately excluded — it carries a fixed implementation (see above),
 * not a per-test return value; only its call history is cleared.
 */
export function resetPrismaMock(): void {
  for (const [key, value] of Object.entries(mockPrisma)) {
    if (key === '$transaction') {
      (value as ReturnType<typeof vi.fn>).mockClear();
      continue;
    }
    if (value && typeof value === 'object') {
      for (const fn of Object.values(value)) {
        if (typeof fn === 'function' && 'mockReset' in fn) {
          (fn as ReturnType<typeof vi.fn>).mockReset();
        }
      }
    }
  }
}
