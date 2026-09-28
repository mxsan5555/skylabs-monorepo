require('dotenv').config({ path: 'apps/mera-driver-api/.env.local', quiet: true });
const { PrismaClient } = require('./apps/mera-driver-api/src/generated/prisma-client');
const prisma = new PrismaClient();

async function rolesFor(userId) {
  const rows = await prisma.userRole.findMany({ where: { userId }, select: { role: { select: { key: true } } } });
  return rows.map(r => r.role.key);
}

async function main() {
  for (const id of ['2dd31527-8fc9-4446-a53d-f5d7fc969178', '11a90b9a-92a1-4004-acd6-82794c14fa76']) {
    const u = await prisma.user.findUnique({ where: { id } });
    const roles = await rolesFor(id);
    console.log({ id, name: u.name, roles, hasPasswordHash: !!u.passwordHash, status: u.status });
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
