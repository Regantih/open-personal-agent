// Code tour clip: scroll the repo's README + the three files a builder extends:
// the risk policy (tiers), tools.ts (new tools), providers/ (new accounts).
// Usage: node record-demo8.js -> rec8/*.webm
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const EXE = 'C:\\Users\\hrega\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const REC = path.join(__dirname, 'rec8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  ['https://github.com/Regantih/open-personal-agent', 9000],
  ['https://github.com/Regantih/open-personal-agent/blob/main/spec/risk-policy/policy.example.yaml', 8000],
  ['https://github.com/Regantih/open-personal-agent/blob/main/app/server/agent/tools.ts', 8000],
  ['https://github.com/Regantih/open-personal-agent/blob/main/app/server/agent/providers/google.ts', 7000],
];

(async () => {
  fs.mkdirSync(REC, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: REC, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  for (const [url, dwell] of PAGES) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await sleep(2500);
    // slow scroll through the page
    const end = Date.now() + dwell;
    while (Date.now() < end) {
      await page.mouse.wheel(0, 240);
      await sleep(450);
    }
  }

  await context.close();
  await browser.close();
  console.log(`[rec] done -> ${REC}`);
})().catch((e) => { console.error(e); process.exit(1); });
