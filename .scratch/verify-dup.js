// Focused verification of the createVendor double-submit-guard fix:
// A) two DIFFERENT new owners created back-to-back (same admin, <10s apart) must produce TWO
//    distinct vendors (this was the real bug — the guard used to collide and silently return
//    vendor #1 for vendor #2's request).
// B) a genuinely duplicate owner email (already belongs to an existing user, not just-created by
//    this admin) must be rejected with 409/CONFLICT, never silently reused.
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('D:/skylabs-mono/apps/msd-api/src/generated/prisma-client');

const JWT_SECRET = 'dev-only-secret-do-not-use-in-prod-0123456789abcdef0123456789abcdef';
const API = 'http://localhost:3333/api/v1';

async function post(token, body) {
  const res = await fetch(`${API}/vendors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

(async () => {
  const prisma = new PrismaClient();
  const superAdmin = await prisma.user.findFirst({
    where: { OR: [{ phone: '+919810099998' }, { email: 'superadmin@seed.msd.local' }] },
    include: { roles: { include: { role: true } } },
  });
  const roleKeys = superAdmin.roles.map((r) => r.role.key);
  const token = jwt.sign({ sub: superAdmin.id, roles: roleKeys, app: 'msd' }, JWT_SECRET, { expiresIn: '30m' });

  const stamp = Date.now();

  // ── A) two different owners, back-to-back, same admin, well within the 10s window ──────────
  const ownerA = { ownerFirstName: 'QA', ownerLastName: 'DupFixA', ownerEmail: `dupfix.a.${stamp}@example.com`, ownerMobile: '9' + String(stamp).slice(-9) };
  const ownerB = { ownerFirstName: 'QA', ownerLastName: 'DupFixB', ownerEmail: `dupfix.b.${stamp}@example.com`, ownerMobile: '9' + String(stamp + 1).slice(-9) };
  const resA = await post(token, ownerA);
  const resB = await post(token, ownerB);
  console.log('A:', resA.status, resA.body.data?.id, resA.body.data?.ownerEmail);
  console.log('B:', resB.status, resB.body.data?.id, resB.body.data?.ownerEmail);
  const distinctVendorsCreated = resA.status === 201 && resB.status === 201 && resA.body.data.id !== resB.body.data.id && resB.body.data.ownerEmail === ownerB.ownerEmail;
  console.log(distinctVendorsCreated ? 'PASS' : 'FAIL', '— two different owners submitted seconds apart create two distinct vendors (not silently merged)');

  // ── B) reuse an email that already belongs to an existing, unrelated user (SuperAdmin's own) ─
  const resDupeExisting = await post(token, { ownerFirstName: 'QA', ownerLastName: 'ShouldFail', ownerEmail: 'superadmin@seed.msd.local', ownerMobile: '9' + String(stamp + 2).slice(-9) });
  console.log('Dupe-existing-user:', JSON.stringify(resDupeExisting));
  const rejectsExistingUserEmail = resDupeExisting.status === 409 || resDupeExisting.body?.error?.code === 'CONFLICT';
  console.log(rejectsExistingUserEmail ? 'PASS' : 'FAIL', '— reusing an existing unrelated user\'s email is rejected with 409/CONFLICT');

  // ── C) reuse of vendor A's own owner email again (true immediate re-duplicate) ───────────────
  const resDupeA = await post(token, { ownerFirstName: 'QA', ownerLastName: 'DupFixA2', ownerEmail: ownerA.ownerEmail, ownerMobile: '9' + String(stamp + 3).slice(-9) });
  console.log('Dupe-of-A (same admin, same email, within window):', resDupeA.status, resDupeA.body.data?.id ?? resDupeA.body.error);
  // Acceptable either way: this narrow edge case (same admin retries with the SAME email they
  // just used seconds ago) may still hit the idempotent double-submit guard (returns vendor A's
  // id) OR may now correctly 409 — both are safe (no silent wrong-vendor mixup); what matters is
  // it's never a *third*, different vendor silently created/returned.
  console.log('  (informational only — narrow same-admin/same-email/same-window edge case)');

  console.log('\n=== QA vendor ids to clean up ===');
  console.log(JSON.stringify({ vendorA: resA.body.data?.id, vendorB: resB.body.data?.id, ownerAEmail: ownerA.ownerEmail, ownerBEmail: ownerB.ownerEmail }, null, 2));

  await prisma.$disconnect();
  process.exit(distinctVendorsCreated && rejectsExistingUserEmail ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
