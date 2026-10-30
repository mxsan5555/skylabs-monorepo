import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

import { PrismaClient } from '../src/generated/prisma-client';

const prisma = new PrismaClient();

/**
 * Read-only. Prints how many vendors are in each old status and what each becomes.
 * Run it BEFORE applying the member_lifecycle migration. It reads the table with raw SQL,
 * so it works against the old and the new schema.
 * Usage: npx tsx apps/msd-api/prisma/member-status-report.ts
 */
const MAPPING: Record<string, string> = {
  PROFILE_INCOMPLETE: 'ACTIVE',
  PENDING_VERIFICATION: 'ACTIVE',
  APPROVED: 'ACTIVE',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'SUSPENDED',
};

async function main() {
  const rows = await prisma.$queryRaw<Array<{ status: string; count: string }>>`
    SELECT "status"::text AS status, COUNT(*)::text AS count FROM "Vendor" GROUP BY 1 ORDER BY 1`;
  let hidden = 0;
  console.log('Old status            Rows   Becomes');
  for (const row of rows) {
    const target = MAPPING[row.status] ?? 'ACTIVE';
    console.log(`${row.status.padEnd(21)} ${row.count.padStart(4)}   ${target}`);
    if (row.status === 'REJECTED') hidden += Number(row.count);
  }
  console.log(
    `\nRows that become SUSPENDED and disappear from the website because they were REJECTED: ${hidden}`,
  );
  const docs = await prisma.$queryRaw<Array<{ count: string }>>`
    SELECT COUNT(*)::text AS count FROM "VendorDocument"`;
  console.log(`Existing KYC files that become SUBMITTED documents: ${docs[0]?.count ?? '0'}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
