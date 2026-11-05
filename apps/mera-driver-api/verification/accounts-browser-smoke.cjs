// Read-only local browser smoke for Accounts Overview and its responsive shell.
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { chromium } = require('playwright');
require('dotenv').config({ path: 'apps/mera-driver-api/.env.local', quiet: true });
const { PrismaClient } = require('../src/generated/prisma-client');
const prisma = new PrismaClient();
let browser;
async function run() {
  const admin = await prisma.user.findFirst({ where: { deletedAt: null, roles: { some: { role: { isSuperAdmin: true } } } }, include: { roles: { include: { role: true } } } });
  assert.ok(admin, 'local Super Admin fixture exists');
  const token = jwt.sign({ sub: admin.id, roles: admin.roles.map(x => x.role.key), app: 'mera-driver' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(t => localStorage.setItem('mera_driver_auth_token', t), token);
  const page = await context.newPage();
  const failed = [];
  page.on('response', r => { if (r.url().includes('/workflow/accounts')) console.log(`API ${r.status()} ${new URL(r.url()).pathname}`); });
  page.on('pageerror', e => failed.push(e.message));
  await page.goto('http://localhost:4400/account/accounts/overview', { waitUntil: 'networkidle', timeout: 30000 });
  await page.getByRole('heading', { name: 'Accounts Overview', exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('Platform Collections', { exact: true }).waitFor({ timeout: 15000 });
  assert.match(await page.locator('body').innerText(), /Needs attention/);
  for (const [label, path, heading] of [
    ['Platform Collections', 'booking-payments', 'Booking Payments'],
    ['Registration Fees Received', 'registration-fees', 'Registration Fees'],
    ['Earned Commission', 'commissions', 'Commissions'],
    ['Driver Payout Due', 'driver-payouts', 'Driver Payouts'],
  ]) {
    await page.getByRole('button', { name: new RegExp(label) }).click();
    await page.waitForURL(`**/account/accounts/${path}**`);
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    await page.goto('http://localhost:4400/account/accounts/overview', { waitUntil: 'networkidle' });
    await page.getByText('Platform Collections', { exact: true }).waitFor();
  }
  for (const [path, heading] of [['refunds-adjustments', 'Refunds & Adjustments'], ['reports', 'Reports']]) {
    await page.goto(`http://localhost:4400/account/accounts/${path}`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Hide sidebar', exact: true }).click().catch(() => {});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overview fits mobile width');
  assert.deepEqual(failed, [], 'no browser runtime errors');
  console.log('PASS Accounts Overview loads from local API and fits mobile width');
}
run().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); await prisma.$disconnect(); });
