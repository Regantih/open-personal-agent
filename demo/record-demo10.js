// Anticipation -> voice call clip: seed a flight + a dinner reservation into
// the demo db, run the background check so action buttons appear, then tap
// "Call to confirm" -> T2 approval -> approve -> transcript in the Data tab.
// Prereq: serve-demo.ts on :5199 (demo5.db auto-created+seeded on boot).
// Usage: node record-demo10.js -> rec10/*.webm
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const EXE = 'C:\\Users\\hrega\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const BASE = 'http://127.0.0.1:5199';
const REC = path.join(__dirname, 'rec10');
const DB = path.join(__dirname, '..', 'app', 'demo5.db');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(REC, { recursive: true });

  // Seed events that trigger anticipation rules (flight <3d, reservation <2d).
  const Database = require(path.join(__dirname, '..', 'app', 'node_modules', 'better-sqlite3'));
  const db = new Database(DB);
  const now = Date.now();
  db.prepare('DELETE FROM calendar WHERE user_id=? AND (title LIKE ? OR title LIKE ?)').run('local', 'Flight AA102%', 'Dinner reservation%');
  db.prepare('INSERT INTO calendar (user_id,title,start,"end",kind,location) VALUES (?,?,?,?,?,?)')
    .run('local', 'Flight AA102 DFW -> SFO', now + 40 * 3600000, now + 44 * 3600000, 'event', 'DFW Airport');
  db.prepare('INSERT INTO calendar (user_id,title,start,"end",kind,location) VALUES (?,?,?,?,?,?)')
    .run('local', 'Dinner reservation at Monarch', now + 20 * 3600000, now + 22 * 3600000, 'event', 'Downtown');
  db.close();

  // Run the batch lane so the action buttons populate.
  const bg = await fetch(`${BASE}/api/background/run`, { method: 'POST' });
  if (!bg.ok) throw new Error(`background run failed: ${bg.status}`);

  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: REC, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="input-message"]').waitFor({ state: 'visible', timeout: 30000 });
  await sleep(1500);

  // Beat 1: the proactive chips are sitting under the composer — linger on them.
  const chip = page.locator('button', { hasText: 'Call to confirm' });
  await chip.waitFor({ state: 'visible', timeout: 20000 });
  await sleep(8000); // let the three buttons read on camera

  // Beat 2: one tap submits a normal turn -> a T2 approval card appears.
  await chip.click();
  const approve = page.locator('[data-testid^="button-approve-"]').first();
  await approve.waitFor({ state: 'visible', timeout: 30000 });
  await sleep(6000); // card reads: call.outbound.business, AI disclosure noted

  // Beat 3: approve -> the simulated call runs -> agent reports back.
  await approve.click();
  await page.locator('text=/Called Monarch|confirmed your table/i').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  await sleep(5500);

  // Beat 4: the transcript lives in the Data tab — audio is never recorded.
  await page.locator('[data-testid="tab-data"]').click();
  await sleep(1000);
  await page.locator('[data-testid^="row-call-"]').first().scrollIntoViewIfNeeded().catch(() => {});
  await sleep(7000);

  await context.close();
  await browser.close();
  console.log(`[rec] done -> ${REC}`);
})().catch((e) => { console.error(e); process.exit(1); });
