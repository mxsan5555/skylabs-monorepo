import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';

const SHOT_DIR = 'C:/Users/vinay/AppData/Local/Temp/claude/D--skylabs-mono/cc9d7824-5575-4f9e-a2cb-442243d9669c/scratchpad/verify-deal-fixes';
mkdirSync(SHOT_DIR, { recursive: true });

const API_LOG = process.argv[2];
if (!API_LOG) {
  console.error('Usage: node verify-deal-fixes.mjs <path-to-api-log>');
  process.exit(1);
}

function latestOtpFor(identifier) {
  const log = readFileSync(API_LOG, 'utf8');
  const lines = log.split('\n').filter((l) => l.includes('Sending OTP:') && l.includes(identifier));
  if (lines.length === 0) throw new Error(`No OTP found for ${identifier}`);
  const last = lines[lines.length - 1];
  const m = last.match(/Sending OTP:\s*(\d{6})/);
  if (!m) throw new Error(`Could not parse OTP from line: ${last}`);
  return m[1];
}

async function signIn(page, identifier, label) {
  await page.goto('http://localhost:4200/sign-in');
  await page.waitForSelector('input', { timeout: 15000 });
  await page.locator('input').first().fill(identifier);
  await page.getByRole('button', { name: /send otp|continue|next/i }).first().click();
  await page.waitForURL(/\/otp/, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const otp = latestOtpFor(identifier);
  console.log(`[${label}] OTP for ${identifier}: ${otp}`);
  await page.locator('input').first().fill(otp);
  await page.getByRole('button', { name: /verify|submit|continue/i }).first().click();
  await page.waitForURL((url) => !url.pathname.includes('/otp'), { timeout: 20000 });
  console.log(`[${label}] signed in, landed on: ${page.url()}`);
}

async function openAddDealFilled(page, titlePrefix) {
  await page.goto('http://localhost:4200/account/vendor-deals');
  await page.waitForTimeout(1200);
  const addBtn = page.getByRole('button', { name: /add deal/i }).first();
  await addBtn.click();
  await page.waitForTimeout(700);

  const uniqueSuffix = Date.now();
  const titleField = page.getByLabel(/^title$/i).first();
  await titleField.fill(`${titlePrefix} ${uniqueSuffix}`);
  const slugField = page.getByLabel(/^slug$/i).first();
  await slugField.fill(`${titlePrefix.toLowerCase().replace(/\s+/g, '-')}-${uniqueSuffix}`);

  const selects = page.locator('md-outlined-select');
  const serviceSelect = selects.nth(2); // [0]=Branch [1]=Offering type [2]=Service/Product
  await serviceSelect.click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);

  const packagesTabBox = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.admin-tabs-wrap');
    const lastWrap = wraps[wraps.length - 1];
    const tabs = Array.from(lastWrap.querySelectorAll('md-primary-tab'));
    const packagesTab = tabs.find((t) => t.textContent?.trim() === 'Packages');
    const rect = packagesTab?.getBoundingClientRect();
    return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
  });
  if (packagesTabBox) {
    await page.mouse.click(packagesTabBox.x, packagesTabBox.y);
    await page.waitForTimeout(400);
  }
  const addPackageBtn = page.getByRole('button', { name: /add package/i }).first();
  if (await addPackageBtn.count() > 0) {
    await addPackageBtn.click();
    await page.waitForTimeout(300);
  }
  const durationField = page.getByLabel(/duration/i).first();
  if (await durationField.count() > 0) await durationField.fill('30');
  const priceField = page.getByLabel(/selling price/i).first();
  if (await priceField.count() > 0) await priceField.fill('999');

  return uniqueSuffix;
}

const browser = await chromium.launch({ headless: true });

try {
  // ============================================================
  // TEST A: single click -> exactly 1 request, toast appears, dialog stays open for media step
  // ============================================================
  console.log('\n=== TEST A: single click submit ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await ctx.newPage();
    const dealPosts = [];
    page.on('response', async (res) => {
      if (/\/deals$/.test(res.url().split('?')[0]) && res.request().method() === 'POST') {
        dealPosts.push({ status: res.status(), url: res.url() });
      }
    });

    await signIn(page, '9810000001', 'vendor-owner-A');
    await openAddDealFilled(page, 'SingleClick Deal');

    const saveBtn = page.getByRole('button', { name: /^save$/i }).first();
    await saveBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOT_DIR}/A-after-single-click.png`, fullPage: true });

    const bodyText = await page.textContent('body');
    const toastShown = /added successfully/i.test(bodyText);
    console.log(`[A] toast "...added successfully" visible: ${toastShown}`);
    console.log(`[A] number of POST .../deals requests: ${dealPosts.length}`, JSON.stringify(dealPosts));

    await ctx.close();
  }

  // ============================================================
  // TEST B: rapid 5 clicks -> still exactly 1 request
  // ============================================================
  console.log('\n=== TEST B: rapid 5-click submit ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await ctx.newPage();
    const dealPosts = [];
    page.on('response', async (res) => {
      if (/\/deals$/.test(res.url().split('?')[0]) && res.request().method() === 'POST') {
        dealPosts.push({ status: res.status(), url: res.url() });
      }
    });

    await signIn(page, '9810000001', 'vendor-owner-B');
    await openAddDealFilled(page, 'RapidClick Deal');

    const saveBtn = page.getByRole('button', { name: /^save$/i }).first();
    // Fire 5 near-simultaneous clicks without awaiting between them.
    await Promise.all([saveBtn.click(), saveBtn.click(), saveBtn.click(), saveBtn.click(), saveBtn.click()]);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SHOT_DIR}/B-after-5-clicks.png`, fullPage: true });

    console.log(`[B] number of POST .../deals requests after 5 rapid clicks: ${dealPosts.length}`, JSON.stringify(dealPosts));

    await ctx.close();
  }

  // ============================================================
  // TEST C: Enter key inside a text field does not trigger an extra submit
  // ============================================================
  console.log('\n=== TEST C: Enter key in text field ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await ctx.newPage();
    const dealPosts = [];
    page.on('response', async (res) => {
      if (/\/deals$/.test(res.url().split('?')[0]) && res.request().method() === 'POST') {
        dealPosts.push({ status: res.status(), url: res.url() });
      }
    });

    await signIn(page, '9810000001', 'vendor-owner-C');
    await openAddDealFilled(page, 'EnterKey Deal');

    const titleField = page.getByLabel(/^title$/i).first();
    await titleField.click();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    console.log(`[C] POST .../deals requests fired just from pressing Enter in Title field: ${dealPosts.length}`);

    const saveBtn = page.getByRole('button', { name: /^save$/i }).first();
    await saveBtn.click();
    await page.waitForTimeout(1500);
    console.log(`[C] total POST .../deals requests after Enter + one real Save click: ${dealPosts.length}`, JSON.stringify(dealPosts));

    await ctx.close();
  }

  console.log('\nDONE');
} finally {
  await browser.close();
}
