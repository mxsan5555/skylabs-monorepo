import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma, type UserStatus, type OrderStatus } from '../generated/prisma-client';
import { setUserStatus } from './user.service';

/**
 * SuperAdmin/staff-facing customer directory (`customers:view`). "Customer" = any `User` row
 * holding the `customer` role (the base role every signed-up user gets — see CLAUDE.md's RBAC
 * section) — not a separate table, so a dual customer+vendor user still shows up here as a
 * customer, matching how the rest of the app treats roles as additive, not exclusive.
 *
 * Explicit `select` allow-list only (never bare `include`) — `User` has no password/OTP field to
 * begin with (auth is OTP-only), but this still follows the same "never trust a wildcard select"
 * convention as `catalog.service.ts`'s PUBLIC_*_SELECT constants.
 */
const CUSTOMER_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  status: true,
  createdAt: true,
  _count: { select: { orders: true } },
} as const;

const CUSTOMER_ROLE_FILTER = { roles: { some: { role: { key: 'customer' } } } } as const;

/** An Order only ever reaches CONFIRMED/COMPLETED via a verified payment (see
 *  payment.service.ts's `verifyPayment`/batch equivalents — PENDING_PAYMENT → CONFIRMED has no
 *  other path), so "this order's total counts toward money actually received" is exactly
 *  `status IN (CONFIRMED, COMPLETED)` — never inferred from a Payment row directly, since a
 *  retried/failed payment attempt row must never count. */
const PAID_ORDER_STATUSES: OrderStatus[] = ['CONFIRMED', 'COMPLETED'];

/**
 * Batched per-customer order aggregates (Total Orders already comes from `_count.orders` on
 * `CUSTOMER_SELECT`) — three grouped `groupBy` queries across the whole `ids` batch, same
 * "batch, never N+1" discipline as `vendor.service.ts#attachLiveCounts`. "Net Paid" / "Awaiting
 * Payment" are real money figures derived from `Order.total` + `Order.status`, never a
 * fabricated/placeholder value. There is no refund concept anywhere in this schema (no `Refund`
 * model, no `REFUNDED` status on `Order`/`Payment`) — so a "Completed Refunds" figure is
 * deliberately never shown here rather than invented.
 */
async function loadOrderStats(ids: string[]) {
  if (ids.length === 0) return new Map<string, { netPaid: number; awaitingPayment: number; lastOrderAt: Date | null }>();

  const [paid, awaiting, last] = await Promise.all([
    prisma.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, status: { in: PAID_ORDER_STATUSES } },
      _sum: { total: true },
    }),
    prisma.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, status: 'PENDING_PAYMENT' },
      _sum: { total: true },
    }),
    prisma.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids } },
      _max: { createdAt: true },
    }),
  ]);

  const stats = new Map<string, { netPaid: number; awaitingPayment: number; lastOrderAt: Date | null }>();
  for (const id of ids) stats.set(id, { netPaid: 0, awaitingPayment: 0, lastOrderAt: null });
  for (const row of paid) stats.get(row.customerId)!.netPaid = Number(row._sum.total ?? 0);
  for (const row of awaiting) stats.get(row.customerId)!.awaitingPayment = Number(row._sum.total ?? 0);
  for (const row of last) stats.get(row.customerId)!.lastOrderAt = row._max.createdAt ?? null;
  return stats;
}

function attachOrderStats<T extends { id: string }>(customer: T, stats: Map<string, { netPaid: number; awaitingPayment: number; lastOrderAt: Date | null }>) {
  const s = stats.get(customer.id) ?? { netPaid: 0, awaitingPayment: 0, lastOrderAt: null };
  return { ...customer, netPaid: s.netPaid, awaitingPayment: s.awaitingPayment, lastOrderAt: s.lastOrderAt };
}

export async function listCustomers(opts: {
  page: number;
  pageSize: number;
  search?: string;
  status?: UserStatus;
}) {
  const where = {
    ...CUSTOMER_ROLE_FILTER,
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.search
      ? {
          OR: [
            { name: { contains: opts.search, mode: 'insensitive' as const } },
            { phone: { contains: opts.search, mode: 'insensitive' as const } },
            { email: { contains: opts.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: CUSTOMER_SELECT,
    }),
    prisma.user.count({ where }),
  ]);
  const stats = await loadOrderStats(rows.map((r) => r.id));
  const items = rows.map((r) => attachOrderStats(r, stats));
  return { items, total };
}

/**
 * Super Admin adding a customer directly (matrix: Customers = VC — the one explicit "create"
 * carve-out for an otherwise view-only resource). Resolves the existing `customer` role server-
 * side and assigns it as this brand-new account's single role — never a password/OTP shortcut, so
 * the created row looks exactly like a real signup until the customer actually completes their
 * own OTP login. Concurrent-duplicate protection is the existing `User.email`/`User.phone` unique
 * constraints + the global P2002->409 backstop, same discipline as `userService.createUser`.
 */
export async function createCustomer(input: { name: string; email?: string; phone?: string }) {
  if (!input.email && !input.phone) {
    throw new ApiError('VALIDATION_ERROR', 'A customer requires at least one of email or phone');
  }
  const customerRole = await prisma.role.findUnique({ where: { key: 'customer' } });
  if (!customerRole) throw new ApiError('NOT_FOUND', 'Customer role not found'); // defensive — seed.ts always creates it

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        roles: { create: [{ roleId: customerRole.id }] },
      },
      select: CUSTOMER_SELECT,
    });
    return attachOrderStats(user, new Map());
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError('CONFLICT', 'A user with this email or phone already exists.');
    }
    throw err;
  }
}

/** 404s for a user who exists but doesn't hold the `customer` role — never confirms existence
 *  of a non-customer user via this endpoint, same "don't leak existence" convention as every
 *  other ownership-scoped lookup in this codebase. */
export async function getCustomerOrThrow(id: string) {
  const customer = await prisma.user.findFirst({
    where: { id, ...CUSTOMER_ROLE_FILTER },
    select: CUSTOMER_SELECT,
  });
  if (!customer) throw new ApiError('NOT_FOUND', 'Customer not found');
  const stats = await loadOrderStats([customer.id]);
  return attachOrderStats(customer, stats);
}

/**
 * Customer Management's status change (Active/Inactive/Suspended — `blocked` in the DB, see
 * `CustomerStatusUpdateSchema`'s own doc comment on why the enum value isn't renamed). Route-
 * level permission is the new, separate `customers:status_change` — never the RBAC Users
 * screen's own `rbac.users:status_change` — but the actual persistence reuses
 * `user.service.ts#setUserStatus` verbatim rather than a second `prisma.user.update`, so there
 * is exactly one place `User.status` is ever written.
 *
 * `getCustomerOrThrow` is the scoping guard: it 404s (never confirms existence) for a User that
 * exists but doesn't hold the `customer` role, so this endpoint can structurally never reach a
 * pure staff/admin/vendor-only account — not just "the frontend only shows customers here".
 */
export async function setCustomerStatus(id: string, status: UserStatus) {
  const before = await getCustomerOrThrow(id);
  await setUserStatus(id, status);
  const after = await getCustomerOrThrow(id);
  return { customer: after, previousStatus: before.status };
}
