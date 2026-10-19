// Panels clip: "build me a panel to track my money" -> T1 panel_create ->
// the Panels tab renders widgets bound to real store data.
// Prereq: serve-demo.ts on :5199 with the panel scenario beat.
// Usage: node record-demo11.js -> rec11/*.webm
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const EXE = 'C:\\Users\\hrega\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const BASE = 'http://127.0.0.1:5199';
const REC = path.join(__dirname, 'rec11');
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

  // Beat 1: ask for a dashboard in plain language.
  await input.click();
  await input.pressSequentially('build me a panel to track my money', { delay: 30 });
  await sleep(900);
  await page.locator('[data-testid="button-send"]').click();
  await page.locator('text=/Panels tab|Money watch/i').first().waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
  await sleep(2500);

  // Beat 2: the Panels tab renders the new dashboard on real store data.
  await page.locator('[data-testid="tab-panels"]').click();
  await page.locator('[data-testid^="panel-pnl_"]').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await sleep(5000); // let the widgets read: subscriptions, bookings, usage

  await context.close();
  await browser.close();
  console.log(`[rec] done -> ${REC}`);
})().catch((e) => { console.error(e); process.exit(1); });
