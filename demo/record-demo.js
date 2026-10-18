// Records a live screencast of the demo flow using Playwright's built-in
// page video capture (no desktop recording; viewport only).
// Usage: node record-demo.js  ->  rec/*.webm
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const EXE = 'C:\\Users\\hrega\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const BASE = 'http://127.0.0.1:5199';
const REC = path.join(__dirname, 'rec');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(REC, { recursive: true, force: true });
  fs.mkdirSync(REC, { recursive: true });

  await fetch(BASE + '/api/reset', { method: 'POST' }).catch(() => {});

  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: REC, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  const msgCount = () => page.locator('[data-testid^="row-message-"]').count();

  const waitNewMessages = async (before, n = 1) => {
    await page.waitForFunction(
      ([b, k]) => document.querySelectorAll('[data-testid^="row-message-"]').length >= b + k,
      [before, n],
      { timeout: 180000 },
    );
  };

  const waitThinkingDone = async () => {
    const thinking = page.locator('[data-testid="status-thinking"]');
    if (await thinking.count()) await thinking.waitFor({ state: 'detached', timeout: 180000 });
  };

  const settle = async () => {
    await page.locator('[data-testid^="row-message-"]').last().scrollIntoViewIfNeeded().catch(() => {});
    await sleep(3000);
  };

  const send = async (text) => {
    const before = await msgCount();
    await page.locator('[data-testid="input-message"]').click();
    await page.keyboard.type(text, { delay: 45 });
    await sleep(700);
    await page.locator('[data-testid="button-send"]').click();
    await waitNewMessages(before, 2);
    await waitThinkingDone();
    await settle();
  };

  const approvePending = async () => {
    await page.click('[data-testid="tab-approvals"]');
    await sleep(1200);
    const btn = page.locator('button[data-testid^="button-approve-"]:enabled').first();
    await btn.waitFor({ timeout: 30000 });
    await sleep(1500);
    const before = await msgCount();
    await btn.click();
    await waitNewMessages(before, 1).catch(() => {});
    await sleep(3500);
  };

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="input-message"]');
  await sleep(2500);

  await send('Check my inbox and handle anything important');
  await send('Yes, draft the reply to Priya');
  await approvePending();
  await send('Find me a flight from DFW to SFO on November 3 and book a refundable option');
  await approvePending();

  for (const tab of ['activity', 'memory', 'data', 'policy']) {
    await page.click(`[data-testid="tab-${tab}"]`);
    await sleep(3200);
  }

  await send('stop everything');
  await sleep(2500);

  await context.close();
  await browser.close();
  console.log('RECORDED:', fs.readdirSync(REC));
})().catch((e) => { console.error(e); process.exit(1); });
