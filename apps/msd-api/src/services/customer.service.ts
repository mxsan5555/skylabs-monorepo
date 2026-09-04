import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import type { UserStatus } from '../generated/prisma-client';

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
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: CUSTOMER_SELECT,
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total };
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
  return customer;
}
