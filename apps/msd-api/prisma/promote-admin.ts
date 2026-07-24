/**
 * Local dev utility: grant a role to an existing user by email or phone.
 * There is no self-service or signup-time way to become admin/marketing/sales
 * (by design — those are staff roles) — this script is the supported way to
 * create a test admin account locally.
 *
 * Usage:
 *   npx tsx apps/msd-api/prisma/promote-admin.ts --email=you@example.com [--role=ADMIN]
 *   npx tsx apps/msd-api/prisma/promote-admin.ts --phone=+919800000000 --role=MARKETING
 *
 * Also runnable via: npm run promote-admin -- --email=you@example.com
 */
import { PrismaClient, UserRole } from '../src/generated/prisma';
import * as dotenv from 'dotenv';

dotenv.config({ path: 'apps/msd-api/.env.local' });

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match?.slice(name.length + 3);
}

async function main() {
  const email = arg('email');
  const phone = arg('phone');
  const roleInput = (arg('role') ?? 'ADMIN').toUpperCase();

  if (!email && !phone) {
    console.error('Usage: promote-admin.ts --email=you@example.com [--role=ADMIN|MARKETING|SALES]');
    console.error('   or: promote-admin.ts --phone=+919800000000 [--role=...]');
    process.exit(1);
  }
  if (!(roleInput in UserRole)) {
    console.error(`Unknown role "${roleInput}". Valid roles: ${Object.values(UserRole).join(', ')}`);
    process.exit(1);
  }
  const role = UserRole[roleInput as keyof typeof UserRole];

  const user = await prisma.user.findFirst({ where: email ? { email } : { phone } });
  if (!user) {
    console.error(`No user found with ${email ? `email ${email}` : `phone ${phone}`}. Sign in once first (OTP creates the account), then re-run this.`);
    process.exit(1);
  }

  if (user.roles.includes(role)) {
    console.log(`${user.email ?? user.phone} already has role ${role}. Roles: [${user.roles.join(', ')}]`);
    return;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { roles: { set: [...user.roles, role] } },
  });
  console.log(`Granted ${role} to ${updated.email ?? updated.phone}. Roles: [${updated.roles.join(', ')}]`);
  console.log('Sign out and sign back in (or refresh the token) for the new role to take effect —');
  console.log('the JWT bakes roles in at sign-in and does not update until a new one is issued.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
