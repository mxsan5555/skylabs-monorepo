/**
 * DL-02 / S22: lists branches whose `state` or `city` is not in the India location list, so they
 * can be fixed before the columns become `NOT NULL`. Read-only: it never writes.
 *
 *   npm run msd-api:prisma:report-branch-locations
 *
 * Exit code 1 when any row needs fixing, so a release check can gate on it.
 */
import { INDIA_LOCATIONS, citiesForState, isIndiaLocation } from '@skylabs-monorepo/shared-utils';
import { PrismaClient } from '../src/generated/prisma-client';

const prisma = new PrismaClient();

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A list value that differs only in case or spacing, or the one state that holds this city. */
function suggest(state: string | null, city: string | null): string {
  const listState = state ? INDIA_LOCATIONS.find((s) => same(s.state, state))?.state : undefined;
  const listCity = listState && city ? citiesForState(listState).find((c) => same(c, city)) : undefined;
  if (listState && listCity) return `${listState} / ${listCity}`;
  if (city) {
    const holders = INDIA_LOCATIONS.filter((s) => s.cities.some((c) => same(c, city)));
    if (holders.length === 1) return `${holders[0].state} / ${holders[0].cities.find((c) => same(c, city))}`;
  }
  return 'pick by hand';
}

async function main() {
  const branches = await prisma.branch.findMany({
    select: { id: true, name: true, state: true, city: true, isActive: true, vendor: { select: { businessName: true } } },
    orderBy: [{ vendorId: 'asc' }, { name: 'asc' }],
  });
  const bad = branches.filter((b) => !b.state || !b.city || !isIndiaLocation(b.state, b.city));

  console.log(`Branches: ${branches.length}, not in the India list: ${bad.length}`);
  for (const b of bad) {
    console.log(
      [b.id, b.vendor?.businessName ?? '-', b.name, b.isActive ? 'active' : 'inactive', `${b.state ?? '(none)'} / ${b.city ?? '(none)'}`, `-> ${suggest(b.state, b.city)}`].join(' | '),
    );
  }
  process.exitCode = bad.length > 0 ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
