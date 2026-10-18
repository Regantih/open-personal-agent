// Browser-rung demo: ask -> T3 approval -> real Chromium opens -> Browser tab
// live view -> human takeover click -> close session.
// Prereq: app built (npm run build) and serve-demo.ts running on :5199.
// Usage: node record-demo5.js  ->  rec5/*.webm
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const EXE = 'C:\\Users\\hrega\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const BASE = 'http://127.0.0.1:5199';
const REC = path.join(__dirname, 'rec5');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(REC, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: REC, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const of = window.fetch.bind(window);
    window.__flog = [];
    window.fetch = async (...a) => {
      try {
        const r = await of(...a);
        if (String(a[0]).includes('browser')) window.__flog.push(`${r.status} ${a[0]}`);
        return r;
      } catch (e) { window.__flog.push(`ERR ${a[0]} ${e}`); throw e; }
    };
  });
  page.on('console', m => { const t = m.text(); if (/csp|violat|error|failed/i.test(t)) console.log('[console]', m.type(), t.slice(0, 200)); });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  page.on('requestfailed', r => console.log('[FAIL]', r.url(), '->', r.failure()?.errorText));

  // Beat 1: the ask.
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(2500);
  const input = page.locator('[data-testid="input-message"]');
  await input.click();
  await input.pressSequentially('open github.com/Regantih/open-personal-agent in your browser and tell me what you see', { delay: 28 });
  await sleep(1200);
  await page.locator('[data-testid="button-send"]').click();
  await sleep(2500);

  // Beat 2: the T3 approval card appears -> approve it.
  const approve = page.locator('[data-testid^="button-approve-"]').first();
  await approve.waitFor({ state: 'visible', timeout: 20000 });
  await sleep(2200); // let the card read on camera
  await approve.click();
  console.log('[rec] approved — real Chromium navigating');

  // Beat 3: hop to the Browser tab and watch the live view stream in.
  await sleep(4000);
  await page.locator('[data-testid="tab-browser"]').click();
  try {
    await page.locator('[data-testid="browser-view"] img').waitFor({ state: 'visible', timeout: 45000 });
  } catch (e) {
    const d = await page.evaluate(() => {
      const view = document.querySelector('[data-testid="browser-view"]');
      const img = view?.querySelector('img');
      return {
        img: img ? { h: img.getBoundingClientRect().height, src: String(img.src).slice(0, 45), nw: img.naturalWidth } : null,
        view: view ? view.innerText.slice(0, 80) : (document.querySelector('[data-testid="browser-empty"]') ? 'EMPTY' : 'NO VIEW'),
        flog: (window.__flog || []).slice(-8),
        diag: window.__frameDiag || null,
      };
    });
    console.log('[rec] DIAG', JSON.stringify(d, null, 1));
    await page.screenshot({ path: path.join(REC, 'diag.png') });
    throw e;
  }
  console.log('[rec] live frame streaming');
  await sleep(6000); // a few ~1fps frames on camera

  // Beat 4: human takeover — click into the live page (repo README area).
  const view = page.locator('[data-testid="browser-view"] img');
  const box = await view.boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await sleep(2500);
  // keyboard forward: scroll down a touch
  await page.locator('[data-testid="browser-view"]').focus();
  await page.keyboard.press('ArrowDown');
  await sleep(3000);

  // Beat 5: close the session from the UI.
  await page.locator('[data-testid="button-close-browser"]').click();
  await sleep(2000);
  await page.locator('[data-testid="browser-empty"]').waitFor({ state: 'visible', timeout: 10000 });
  console.log('[rec] session closed');
  await sleep(1500);

  await context.close();
  await browser.close();
  console.log(`[rec] done -> ${REC}`);
})().catch((e) => { console.error(e); process.exit(1); });
