// Reproduces the "Something went wrong" crash on /account/vendors/new as a real SuperAdmin,
// against the actually-running dev servers (msd on :4200, msd-api on :3333) and real Postgres.
const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('D:/skylabs-mono/apps/msd-api/src/generated/prisma-client');

const JWT_SECRET = 'dev-only-secret-do-not-use-in-prod-0123456789abcdef0123456789abcdef';

(async () => {
  const prisma = new PrismaClient();
  const superAdmin = await prisma.user.findFirst({
    where: { OR: [{ phone: '+919810099998' }, { email: 'superadmin@seed.msd.local' }] },
    include: { roles: { include: { role: true } } },
  });
  if (!superAdmin) {
    console.error('No SuperAdmin user found in DB — run the seed script first.');
    process.exit(1);
  }
  const roleKeys = superAdmin.roles.map((r) => r.role.key);
  console.log('SuperAdmin user:', superAdmin.id, superAdmin.name, roleKeys);

  const token = jwt.sign({ sub: superAdmin.id, roles: roleKeys, app: 'msd' }, JWT_SECRET, { expiresIn: '15m' });

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const consoleMsgs = [];
  page.on('console', (msg) => {
    consoleMsgs.push(`[console:${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    consoleMsgs.push(`[pageerror] ${err.message}\n${err.stack}`);
  });

  const netFailures = [];
  page.on('response', async (res) => {
    if (res.status() >= 400) {
      let body = '';
      try { body = await res.text(); } catch {}
      netFailures.push(`${res.status()} ${res.request().method()} ${res.url()}\n  body: ${body.slice(0, 1000)}`);
    }
  });
  page.on('requestfailed', (req) => {
    netFailures.push(`REQUEST FAILED ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });

  await page.addInitScript((t) => window.localStorage.setItem('msd_auth_token', t), token);
  await page.goto('http://localhost:4200/account/vendors', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  console.log('=== after /account/vendors load, clicking Add vendor ===');
  await page.getByRole('button', { name: 'Add vendor' }).click();
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'D:/skylabs-mono/.scratch/repro-1.png', fullPage: true });

  console.log('=== filling Vendor User step ===');
  const stamp = Date.now();
  await page.getByLabel('First name').fill('QA');
  await page.getByLabel('Last name').fill('Tester');
  await page.getByLabel('Email').fill(`qa.vendor.${stamp}@example.com`);
  const mobileDigits = '9' + String(stamp).slice(-9);
  await page.getByLabel('Mobile').fill(mobileDigits);
  await page.waitForTimeout(1500); // debounced availability check
  await page.screenshot({ path: 'D:/skylabs-mono/.scratch/repro-2-filled.png', fullPage: true });

  console.log('=== clicking Create Vendor ===');
  await page.getByRole('button', { name: 'Create Vendor' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'D:/skylabs-mono/.scratch/repro-3-after-create.png', fullPage: true });

  const bodyText2 = await page.evaluate(() => document.body.innerText);
  console.log('=== PAGE BODY TEXT AFTER CREATE ===');
  console.log(bodyText2);

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('=== PAGE BODY TEXT ===');
  console.log(bodyText);

  console.log('=== CONSOLE / PAGE ERRORS ===');
  console.log(consoleMsgs.join('\n'));

  console.log('=== NETWORK FAILURES (>=400 or failed) ===');
  console.log(netFailures.join('\n'));

  await browser.close();
  await prisma.$disconnect();
})().catch((err) => {
  console.error('SCRIPT ERROR', err);
  process.exit(1);
});
