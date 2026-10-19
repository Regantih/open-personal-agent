// Tour clip: composer voice controls -> Policy tab (risk model + Connections)
// -> Memory tab (provenance + OMF export). Prereq: serve-demo.ts on :5199.
// Usage: node record-demo6.js -> rec6/*.webm
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const EXE = 'C:\\Users\\hrega\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const BASE = 'http://127.0.0.1:5199';
const REC = path.join(__dirname, 'rec6');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(REC, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: REC, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(2500);

  // Beat 1: the composer — mic + speaker controls read on camera.
  await page.locator('[data-testid="input-message"]').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('[data-testid="button-mic"]').hover();
  await sleep(2200);
  // Speaker only renders when the server has ELEVENLABS_API_KEY.
  if (await page.locator('[data-testid="button-speaker"]').count()) {
    await page.locator('[data-testid="button-speaker"]').hover();
    await sleep(2200);
  }

  // Beat 2: Memory tab — owned memory, provenance, export.
  await page.locator('[data-testid="tab-memory"]').click();
  await sleep(3000);
  await page.locator('[data-testid="button-export-memory"]').hover();
  await sleep(1800);

  // Beat 3: Policy tab — risk model + Connections panel (scroll to it).
  await page.locator('[data-testid="tab-policy"]').click();
  await sleep(2500);
  await page.locator('[data-testid="row-connection-google"]').scrollIntoViewIfNeeded();
  await sleep(2800);

  await context.close();
  await browser.close();
  console.log(`[rec] done -> ${REC}`);
})().catch((e) => { console.error(e); process.exit(1); });
