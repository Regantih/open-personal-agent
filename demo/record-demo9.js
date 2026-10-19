// Quickstart clip: scroll the repo README on GitHub (setup section) — the real
// docs a newcomer follows. Usage: node record-demo9.js -> rec9/*.webm
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const EXE = 'C:\\Users\\hrega\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const REC = path.join(__dirname, 'rec9');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(REC, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: REC, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  await page.goto('https://github.com/Regantih/open-personal-agent/blob/main/app/README.md', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3000);
  const end = Date.now() + 17000;
  while (Date.now() < end) {
    await page.mouse.wheel(0, 220);
    await sleep(420);
  }

  await context.close();
  await browser.close();
  console.log(`[rec] done -> ${REC}`);
})().catch((e) => { console.error(e); process.exit(1); });
