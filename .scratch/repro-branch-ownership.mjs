import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';

const SHOT_DIR = 'C:/Users/vinay/AppData/Local/Temp/claude/D--skylabs-mono/cc9d7824-5575-4f9e-a2cb-442243d9669c/scratchpad/repro-branch';
mkdirSync(SHOT_DIR, { recursive: true });

function latestOtpFor(identifier, apiLog) {
  const log = readFileSync(apiLog, 'utf8');
  const lines = log.split('\n').filter((l) => l.includes('Sending OTP:') && l.includes(identifier));
  if (lines.length === 0) throw new Error(`No OTP found for ${identifier}`);
  const last = lines[lines.length - 1];
  const m = last.match(/Sending OTP:\s*(\d{6})/);
  if (!m) throw new Error(`Could not parse OTP from line: ${last}`);
  return m[1];
}

const API_LOG_CANDIDATES = process.argv.slice(2);
if (API_LOG_CANDIDATES.length === 0) {
  console.error('Usage: node repro-branch-ownership.mjs <path-to-api-log>');
  process.exit(1);
}
const API_LOG = API_LOG_CANDIDATES[0];

async function signIn(page, identifier, label) {
  await page.goto('http://localhost:4200/sign-in');
  await page.waitForSelector('input', { timeout: 15000 });
  await page.locator('input').first().fill(identifier);
  await page.getByRole('button', { name: /send otp|continue|next/i }).first().click();
  await page.waitForURL(/\/otp/, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const otp = latestOtpFor(identifier, API_LOG);
  console.log(`[${label}] OTP for ${identifier}: ${otp}`);
  await page.locator('input').first().fill(otp);
  await page.getByRole('button', { name: /verify|submit|continue/i }).first().click();
  await page.waitForURL((url) => !url.pathname.includes('/otp'), { timeout: 20000 });
  console.log(`[${label}] signed in, landed on: ${page.url()}`);
}

const browser = await chromium.launch({ headless: true });

try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  const netLog = [];
  page.on('response', async (res) => {
    if (res.url().includes('/deals') && res.request().method() === 'POST') {
      let body = '';
      try { body = await res.text(); } catch {}
      netLog.push({ url: res.url(), status: res.status(), body: body.slice(0, 300) });
    }
  });
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console.error]', msg.text()); });

  await signIn(page, '9810000001', 'vendor-owner');

  await page.goto('http://localhost:4200/account/vendor-deals');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT_DIR}/01-vendor-deals.png`, fullPage: true });

  const addBtn = page.getByRole('button', { name: /add deal/i }).first();
  await addBtn.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOT_DIR}/02-dialog-open.png`, fullPage: true });

  // Dialog field order in the "General" tab: [0]=Branch, [1]=Offering type, [2]=Service/Product.
  const selects = page.locator('md-outlined-select');
  const selectCount = await selects.count();
  console.log(`[repro] md-outlined-select count in dialog: ${selectCount}`);

  const branchSelectInfo = await page.evaluate(() => {
    const sel = document.querySelectorAll('md-outlined-select')[0];
    return sel ? { value: sel.value, label: sel.getAttribute('label') } : null;
  });
  console.log('[repro] branch select (index 0) initial state:', JSON.stringify(branchSelectInfo));

  // Switch the branch selector explicitly — open it, arrow down to the next option, commit.
  const branchSelect = selects.nth(0);
  await branchSelect.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT_DIR}/03-branch-dropdown-open.png`, fullPage: true });
  const branchOptionCount = await page.locator('md-select-option').count();
  console.log(`[repro] branch dropdown has ${branchOptionCount} options`);
  if (branchOptionCount > 1) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
  } else {
    await page.keyboard.press('Escape');
  }
  const branchSelectAfter = await page.evaluate(() => {
    const sel = document.querySelectorAll('md-outlined-select')[0];
    return sel ? sel.value : null;
  });
  console.log('[repro] branch select value after switching:', branchSelectAfter);
  await page.screenshot({ path: `${SHOT_DIR}/04-branch-selected.png`, fullPage: true });

  // Fill title/slug.
  const uniqueSuffix = Date.now();
  const titleField = page.getByLabel(/^title$/i).first();
  await titleField.fill(`Repro Deal ${uniqueSuffix}`);
  const slugField = page.getByLabel(/^slug$/i).first();
  await slugField.fill(`repro-deal-${uniqueSuffix}`);

  // Offering type defaults to "Service" already — select index [2] is the Service/Product picker.
  const serviceSelect = selects.nth(2);
  await serviceSelect.click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOT_DIR}/05-form-filled.png`, fullPage: true });

  // Service offering requires at least one package — switch to the Packages tab (raw
  // pixel-coordinate click, the only reliable way to hit this Lit/Material tab component in
  // headless automation — see this session's earlier notes) and fill the pre-existing default row.
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
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${SHOT_DIR}/05b-packages-tab.png`, fullPage: true });

  const addPackageBtn = page.getByRole('button', { name: /add package/i }).first();
  if (await addPackageBtn.count() > 0) {
    await addPackageBtn.click();
    await page.waitForTimeout(300);
  }
  const durationField = page.getByLabel(/duration/i).first();
  if (await durationField.count() > 0) await durationField.fill('30');
  const priceField = page.getByLabel(/selling price/i).first();
  if (await priceField.count() > 0) await priceField.fill('999');
  await page.screenshot({ path: `${SHOT_DIR}/05c-package-filled.png`, fullPage: true });

  const saveBtn = page.getByRole('button', { name: /^save$/i }).first();
  await saveBtn.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOT_DIR}/06-after-save.png`, fullPage: true });

  const bodyText = await page.textContent('body');
  const hasOwnershipError = /does not belong to your vendor/i.test(bodyText);
  console.log(`[repro] ownership error shown: ${hasOwnershipError}`);
  console.log('[repro] network log for POST .../deals:', JSON.stringify(netLog, null, 2));

  await ctx.close();
  console.log('DONE');
} finally {
  await browser.close();
}
