import { Prisma, type PrismaClient } from '../src/generated/prisma-client';

type PrismaLike = Pick<PrismaClient, 'user' | 'userRole' | 'auditLog' | '$transaction'>;

export interface RoleMigrationSummary {
  /** Accounts that genuinely held more than one role and were converted automatically. */
  autoConverted: number;
  /** Accounts still holding more than one role after this run, each with `User.roleConflict`
   *  set — require an authorized admin to pick one explicit final role via the Role Conflicts
   *  review screen (`GET/PUT /rbac/role-conflicts`). */
  flaggedForReview: number;
}

/**
 * The single-role migration sweep — run once per `seed.ts` invocation (idempotent, safe to
 * re-run on every server start/reseed, same discipline as every other seed step in this file).
 *
 * Finds every account still holding more than one role (a leftover from before this app enforced
 * "exactly one role per account" — see `user.service.ts#replaceUserRole`'s own doc comment for
 * the enforcement side) and converts ONLY the one case that is genuinely unambiguous:
 *
 *   exactly `{customer, vendor}` AND the account actually owns a Vendor business row
 *   -> keep `vendor` ("Member"), drop the base `customer` grant every signup gets — the
 *      business ownership is the unambiguous real purpose of the account.
 *
 * Every other multi-role combination — `{customer, vendor}` with NO linked Vendor (the `vendor`
 * grant doesn't correspond to any real business, so there is no way to know if it was a finished
 * Member account whose Vendor row was since removed, an abandoned attempt, or a stray checkbox
 * click from the old multi-select UI), any mix of two or more STAFF roles, or any combination
 * touching more than two roles at once (e.g. `customer + vendor + marketing`) — is flagged via
 * `User.roleConflict = true` for a human to resolve, never guessed at here. This deliberately
 * does NOT: pick the "highest" role, pick the first role row, union permissions, or delete any
 * customer/member record or ownership link — see the requesting task's explicit prohibitions.
 *
 * Already-flagged accounts are skipped on re-run (no duplicate `AuditLog` rows); an account an
 * admin has since resolved (down to exactly one role, `roleConflict` cleared by
 * `resolveAccountRoleConflict`) is simply no longer multi-role and is skipped too.
 */
export async function auditAndMigrateMultiRoleAccounts(
  prisma: PrismaLike,
  systemActorUserId: string | undefined,
): Promise<RoleMigrationSummary> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    include: { roles: { include: { role: true } }, vendorProfile: { select: { id: true } } },
  });

  let autoConverted = 0;
  let flaggedForReview = 0;

  for (const user of users) {
    if (user.roles.length <= 1) continue; // already single-role (or role-less) — nothing to do

    const roleKeys = user.roles.map((ur) => ur.role.key);
    const isCustomerVendorPair = roleKeys.length === 2 && roleKeys.includes('customer') && roleKeys.includes('vendor');

    if (isCustomerVendorPair && user.vendorProfile) {
      const vendorRole = user.roles.find((ur) => ur.role.key === 'vendor')!.role;
      await prisma.$transaction(
        async (tx) => {
          await tx.userRole.deleteMany({ where: { userId: user.id } });
          await tx.userRole.create({ data: { userId: user.id, roleId: vendorRole.id } });
          await tx.user.update({ where: { id: user.id }, data: { roleConflict: false } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if (systemActorUserId) {
        await prisma.auditLog.create({
          data: {
            actorUserId: systemActorUserId,
            action: 'user.role.auto_resolved',
            targetType: 'User',
            targetId: user.id,
            before: { roleKeys },
            after: { roleKey: 'vendor', reason: 'unambiguous customer+vendor pair with real Vendor ownership' },
          },
        });
      }
      autoConverted++;
      continue;
    }

    if (!user.roleConflict) {
      await prisma.user.update({ where: { id: user.id }, data: { roleConflict: true } });
      if (systemActorUserId) {
        await prisma.auditLog.create({
          data: {
            actorUserId: systemActorUserId,
            action: 'user.role.conflict_detected',
            targetType: 'User',
            targetId: user.id,
            before: { roleKeys },
            after: null,
          },
        });
      }
    }
    flaggedForReview++;
  }

  return { autoConverted, flaggedForReview };
}
