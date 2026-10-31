import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { revokeAllRefreshTokens } from './token.service';
import { Prisma, type UserStatus } from '../generated/prisma-client';
import { MEMBER_ROLE_KEYS } from '../lib/role-keys';

/**
 * Every staff User now holds EXACTLY one role (enforced by `setStaffUserRole`/`replaceUserRole`
 * below — see their own doc comments) — `customer` and `vendor` ("Member") are never valid staff
 * roles, so "internal staff" is simply "holds a role that is neither of those, and isn't flagged
 * SuperAdmin." A legacy account that still holds more than one role (pre-dating this single-role
 * model) is excluded here too via `roleConflict: false` until an authorized admin resolves it
 * through the Role Conflicts review screen (`listRoleConflicts`/`resolveAccountRoleConflict`) —
 * it would otherwise show up here with a stale/ambiguous role set.
 *
 * `roleKey` joins through `UserRole -> Role.key` (a user's roles are technically still a
 * many-to-many table — reused as-is rather than restructured — but application code now treats
 * "current role" as singular). Superadmin-flagged users are excluded from every call here by
 * default — a Superadmin manages their own profile via the separate `/rbac/users/me` self-service
 * surface, not as a row an admin can edit/delete/reassign in this general staff list. Checked via
 * `Role.isSuperAdmin`, never a role-key string compare.
 *
 * Vendor-owner accounts are ALSO excluded (`vendorProfile: null`, via the existing back-relation)
 * — a Vendor's owner User is managed exclusively through Vendor List/Management
 * (`vendors.routes.ts`), never through this general User Management screen, so it never appears
 * here at all (not hidden client-side — excluded at the query, so list/search/count/filters all
 * agree). The User row itself is untouched either way; this only narrows what this one listing
 * surfaces. Applied identically to `listUsers` and `countStaffUsers` below so the sidebar
 * count/badge (if any) never disagrees with what the list itself shows.
 *
 * The Member role key is mid-rename (`vendor` -> `member`, see `lib/role-keys.ts`'s
 * `MEMBER_ROLE_KEYS` doc comment) — this excludes BOTH so the exclusion holds regardless of
 * which key a given row still carries during the transition.
 */
const STAFF_ONLY_WHERE: Prisma.UserWhereInput = {
  deletedAt: null,
  roleConflict: false,
  roles: { some: { role: { key: { not: 'customer' } } } },
  AND: [
    { roles: { none: { role: { isSuperAdmin: true } } } },
    { roles: { none: { role: { key: { in: [...MEMBER_ROLE_KEYS] } } } } },
    { vendorProfile: null },
  ],
};

/** Roles that can never be assigned through staff-user management — Customer and Member
 *  (`member`, transitionally also `vendor`) each have their own dedicated account-creation flow
 *  and own role assignment, never this one. Shared by `createUser` and `setStaffUserRole` so both
 *  enforce the same rule. */
const INELIGIBLE_STAFF_ROLE_KEYS = ['customer', ...MEMBER_ROLE_KEYS];

async function assertEligibleStaffRole(roleId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new ApiError('NOT_FOUND', 'Role not found');
  if (!role.isActive) throw new ApiError('VALIDATION_ERROR', 'Role is not active');
  if (INELIGIBLE_STAFF_ROLE_KEYS.includes(role.key)) {
    throw new ApiError('VALIDATION_ERROR', 'Customer and Member roles cannot be assigned through staff user management');
  }
  return role;
}

export async function listUsers(
  page: number,
  pageSize: number,
  opts: { search?: string; roleKey?: string; viewerId?: string; viewerIsSuperAdmin?: boolean } = {},
) {
  const { search, roleKey, viewerId, viewerIsSuperAdmin } = opts;
  const where: Prisma.UserWhereInput = {
    ...STAFF_ONLY_WHERE,
    AND: [
      ...(STAFF_ONLY_WHERE.AND as Prisma.UserWhereInput[]),
      ...(roleKey ? [{ roles: { some: { role: { key: roleKey } } } } as Prisma.UserWhereInput] : []),
      ...(search
        ? [
            {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
                { phone: { contains: search, mode: 'insensitive' as const } },
              ],
            } as Prisma.UserWhereInput,
          ]
        : []),
    ],
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { roles: { include: { role: true } } },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: items.map((user) =>
      serializeUser(user, { includeLastLogin: Boolean(viewerIsSuperAdmin) || user.id === viewerId }),
    ),
    total,
  };
}

/** The saved delivery address fields on User (item 2.2, D37). */
export interface SavedAddress {
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

/** `GET /rbac/users/me`: the caller's own row plus their saved address. Staff lists use
 *  `serializeUser`, which never carries the address. */
export function serializeMe(user: Parameters<typeof serializeUser>[0] & Partial<SavedAddress>) {
  return {
    ...serializeUser(user),
    address: user.address ?? null,
    city: user.city ?? null,
    state: user.state ?? null,
    pincode: user.pincode ?? null,
  };
}

/** Saves the caller's own delivery address (validated by `MyAddressSchema`). */
export async function saveMyAddress(userId: string, address: { address: string; state: string; city: string; pincode: string }) {
  const user = await prisma.user.update({ where: { id: userId }, data: address, include: { roles: { include: { role: true } } } });
  return serializeMe(user);
}

export function serializeUser(
  user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    status: string;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    roles: { role: { id: string; key: string; name: string } }[];
  },
  opts: { includeLastLogin?: boolean } = {},
) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    lastLoginAt: opts.includeLastLogin ? user.lastLoginAt : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles: user.roles.map((ur) => ur.role),
  };
}

export async function getUserOrThrow(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: { roles: { include: { role: true } } },
  });
  if (!user) throw new ApiError('NOT_FOUND', 'User not found');
  return user;
}

/**
 * The admin-on-behalf staff-management guard — 404s (never confirms existence) for a target
 * that `STAFF_ONLY_WHERE` would exclude from the list (customer-only, Vendor-owner, or
 * Superadmin), so `PATCH/DELETE /rbac/users/:id`, role assignment, session revocation, OTP
 * reset, and login-history/sessions detail can never become a back-door way to view or mutate
 * an account the Staff Users screen itself would never show. Deliberately a SEPARATE function
 * from `getUserOrThrow` above — that one is also the self-service `/rbac/users/me` lookup,
 * which every role (customer/vendor/superadmin included) must keep using to read/edit their OWN
 * row; only the admin-on-behalf `:id` routes call this one, never the service functions they
 * share with self-service (`updateUser`/`setUserStatus`/etc. stay generic on purpose).
 */
export async function assertStaffUserOrThrow(id: string) {
  const user = await prisma.user.findFirst({ where: { id, ...STAFF_ONLY_WHERE } });
  if (!user) throw new ApiError('NOT_FOUND', 'User not found');
}

export async function createUser(input: {
  name: string;
  email?: string;
  phone?: string;
  roleId: string;
}) {
  if (!input.email && !input.phone) {
    throw new ApiError('VALIDATION_ERROR', 'A user requires at least one of email or phone');
  }
  await assertEligibleStaffRole(input.roleId);

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        roles: { create: [{ roleId: input.roleId }] },
      },
      include: { roles: { include: { role: true } } },
    });
    return serializeUser(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError('CONFLICT', 'A user with this email or phone already exists.');
    }
    throw err;
  }
}

export async function updateUser(id: string, input: { name?: string; email?: string; phone?: string }) {
  await getUserOrThrow(id);
  const user = await prisma.user.update({
    where: { id },
    data: input,
    include: { roles: { include: { role: true } } },
  });
  return serializeUser(user);
}

export async function softDeleteUser(id: string) {
  await getUserOrThrow(id);
  await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function setUserStatus(id: string, status: UserStatus) {
  await getUserOrThrow(id);
  const user = await prisma.user.update({ where: { id }, data: { status }, include: { roles: { include: { role: true } } } });
  return serializeUser(user);
}

/**
 * Atomically REPLACES a user's entire role set with exactly this one role — delete-then-create
 * in a single `Serializable`-isolation transaction, never additive. This is the one low-level
 * primitive every role-assignment path now goes through (staff role changes, Member-owner
 * creation/linking, and legacy-conflict resolution), so "every account holds exactly one current
 * role" holds no matter which caller triggered the change.
 *
 * `Serializable` isolation (rather than the DB default `ReadCommitted`) is what actually satisfies
 * "prevent concurrent requests from creating multiple current assignments": two overlapping
 * delete-then-create transactions for the SAME user, each targeting a different roleId, would
 * otherwise both succeed under `ReadCommitted` (each deletes zero-or-the-other's row, then
 * inserts its own — no unique constraint stops two different roleIds coexisting on the composite
 * `(userId, roleId)` key) and leave the user with two rows. Under `Serializable`, Postgres detects
 * the read/write conflict and aborts the loser with a serialization-failure error instead.
 *
 * Also clears `roleConflict` — setting a single, explicit role (whether via the ordinary staff
 * flow, Member creation, or the Role Conflicts review screen) is itself the resolution of any
 * prior ambiguity for this account.
 */
export async function replaceUserRole(userId: string, roleId: string): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.create({ data: { userId, roleId } });
      await tx.user.update({ where: { id: userId }, data: { roleConflict: false } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** Staff-management role change — validates the target role is an eligible internal role (never
 *  Customer/Member, never inactive) before replacing, per the single-role model. */
export async function setStaffUserRole(userId: string, roleId: string) {
  await assertEligibleStaffRole(roleId);
  await replaceUserRole(userId, roleId);
  return serializeUser(await getUserOrThrow(userId));
}

/**
 * Every User currently flagged for manual review (see `prisma/role-migration.ts`'s audit sweep)
 * — holds more than one role and couldn't be converted automatically. Returns each account's
 * current role list (and Vendor-ownership status, since that's the key fact a reviewer needs to
 * tell "this is really a Member" from "this is a stray grant") so an authorized admin can pick
 * one explicit final role via `resolveAccountRoleConflict` below.
 */
export async function listRoleConflicts() {
  const users = await prisma.user.findMany({
    where: { roleConflict: true, deletedAt: null },
    include: { roles: { include: { role: true } }, vendorProfile: { select: { id: true, businessName: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    status: u.status,
    roles: u.roles.map((ur) => ur.role),
    vendorProfile: u.vendorProfile ? { id: u.vendorProfile.id, businessName: u.vendorProfile.businessName } : null,
  }));
}

/**
 * Resolves one flagged account by setting its explicit final role — unlike `setStaffUserRole`,
 * NOT restricted to internal staff roles, since the correct resolution for a flagged account may
 * genuinely be Customer or Member (the review screen shows the reviewer every option so they make
 * that call explicitly; this function never guesses on its own — see `role-migration.ts`'s own
 * doc comment for why no automatic "pick one" logic exists here).
 */
export async function resolveAccountRoleConflict(userId: string, roleId: string) {
  const user = await getUserOrThrow(userId);
  if (!user.roleConflict) {
    throw new ApiError('VALIDATION_ERROR', 'This account is not flagged for role-conflict review');
  }
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new ApiError('NOT_FOUND', 'Role not found');
  if (!role.isActive) throw new ApiError('VALIDATION_ERROR', 'Role is not active');
  await replaceUserRole(userId, roleId);
  return serializeUser(await getUserOrThrow(userId));
}

export async function revokeAllSessionsForUser(userId: string) {
  await getUserOrThrow(userId);
  await revokeAllRefreshTokens(userId);
}

/** Invalidates any pending (unconsumed) OTP challenges tied to the user's identifiers. */
export async function resetOtpForUser(userId: string) {
  const user = await getUserOrThrow(userId);
  const identifiers = [user.email, user.phone].filter((v): v is string => Boolean(v));
  if (identifiers.length === 0) return;
  await prisma.otpChallenge.updateMany({
    where: { identifier: { in: identifiers }, verifiedAt: null },
    data: { verifiedAt: new Date() },
  });
}

export async function getLoginHistory(userId: string, page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.loginHistory.count({ where: { userId } }),
  ]);
  return { items, total };
}

export async function getSessions(userId: string) {
  return prisma.refreshSession.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      userId: true,
      deviceInfo: true,
      ip: true,
      userAgent: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
}
