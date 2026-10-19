// "Use it" clip: teach the agent a fact -> book a flight -> T3 approval card
// -> approve -> booking lands. Then Memory + Data tabs show the results.
// Prereq: serve-demo.ts on :5199 with the extended scenario.
// Usage: node record-demo7.js -> rec7/*.webm
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const EXE = 'C:\\Users\\hrega\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const BASE = 'http://127.0.0.1:5199';
const REC = path.join(__dirname, 'rec7');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(REC, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: REC, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  const input = page.locator('[data-testid="input-message"]');

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await input.waitFor({ state: 'visible', timeout: 30000 });
  await sleep(1500);

  // Beat 1: teach it a fact.
  await input.click();
  await input.pressSequentially('remember I prefer aisle seats on flights over two hours', { delay: 26 });
  await sleep(800);
  await page.locator('[data-testid="button-send"]').click();
  await page.locator('text=Remembered').waitFor({ state: 'visible', timeout: 20000 });
  await sleep(2000);

  // Beat 2: ask for a flight — search runs (T0), then a T3 booking approval appears.
  await input.click();
  await input.pressSequentially('book me a flight to SFO on November 6th', { delay: 26 });
  await sleep(800);
  await page.locator('[data-testid="button-send"]').click();
  const approve = page.locator('[data-testid^="button-approve-"]').first();
  await approve.waitFor({ state: 'visible', timeout: 30000 });
  await sleep(2600); // let the card read: T3, merchant, amount, code

  // Beat 3: approve on camera -> booking executes -> confirmation.
  await approve.click();
  await page.locator('text=/Booked|confirmed|booking/i').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  await sleep(3000);

  // Beat 4: Memory tab shows the new fact with provenance.
  await page.locator('[data-testid="tab-memory"]').click();
  await sleep(2800);

  // Beat 5: Data tab shows the booking + calendar entry.
  await page.locator('[data-testid="tab-data"]').click();
  await sleep(2800);

  await context.close();
  await browser.close();
  console.log(`[rec] done -> ${REC}`);
})().catch((e) => { console.error(e); process.exit(1); });
