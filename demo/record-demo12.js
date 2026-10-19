// Vault clip: Settings (Policy tab) -> Site logins -> save a site credential.
// The credential row shows site+username metadata only — the password is
// AES-256-GCM encrypted and never leaves the server.
// Prereq: serve-demo.ts on :5199.
// Usage: node record-demo12.js -> rec12/*.webm
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const EXE = 'C:\\Users\\hrega\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const BASE = 'http://127.0.0.1:5199';
const REC = path.join(__dirname, 'rec12');
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
  await page.locator('[data-testid="input-message"]').waitFor({ state: 'visible', timeout: 30000 });
  await sleep(1200);

  // Beat 1: Policy tab -> the Site logins (vault) card.
  await page.locator('[data-testid="tab-policy"]').click();
  await sleep(1200);
  await page.locator('text=Site logins').scrollIntoViewIfNeeded();
  await sleep(2000); // card + its one-line explainer reads on camera

  // Beat 2: type a login — the password field masks on camera.
  await page.locator('[data-testid="input-cred-site"]').click();
  await page.locator('[data-testid="input-cred-site"]').pressSequentially('opentable.com', { delay: 45 });
  await page.locator('[data-testid="input-cred-user"]').pressSequentially('regan@example.com', { delay: 35 });
  await page.locator('[data-testid="input-cred-pass"]').pressSequentially('demo-pass-123', { delay: 45 });
  await sleep(1200);
  await page.locator('[data-testid="button-save-cred"]').click();

  // Beat 3: it lands as metadata only — site + username, never the secret.
  await page.locator('[data-testid="row-credential-opentable.com"]').waitFor({ state: 'visible', timeout: 15000 });
  await sleep(3500);

  await context.close();
  await browser.close();
  console.log(`[rec] done -> ${REC}`);
})().catch((e) => { console.error(e); process.exit(1); });
