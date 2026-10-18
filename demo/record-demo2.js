// Delegation-focused demo: proactive brief -> one-prompt delegation ->
// approvals executed by TEXT (signed Twilio webhook) -> kill switch by text.
// Usage: node record-demo2.js  ->  rec2/*.webm
const { chromium } = require('playwright-core');
const { createHmac } = require('node:crypto');
const path = require('path');
const fs = require('fs');

const EXE = 'C:\\Users\\hrega\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const BASE = 'http://127.0.0.1:5199';
const REC = path.join(__dirname, 'rec2');
const TWILIO_TOKEN = 'demo_twilio_tok';
const OWNER_PHONE = '+15551234567';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Signs a POST body exactly like Twilio does, so the real webhook accepts it.
const sendSms = async (body) => {
  const params = { From: OWNER_PHONE, To: '+15557654321', Body: body };
  const sigBase = BASE + '/api/channels/sms' + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const sig = createHmac('sha1', TWILIO_TOKEN).update(sigBase).digest('base64');
  const r = await fetch(BASE + '/api/channels/sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig },
    body: new URLSearchParams(params).toString(),
  });
  return r.status;
};

const pendingCodes = async () => {
  const s = await (await fetch(BASE + '/api/state')).json();
  return s.approvals.filter((a) => a.status === 'pending').map((a) => ({ id: a.id, code: a.code, summary: a.summary }));
};

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
      [before, n], { timeout: 180000 });
  };
  const waitThinkingDone = async () => {
    const t = page.locator('[data-testid="status-thinking"]');
    if (await t.count()) await t.waitFor({ state: 'detached', timeout: 180000 });
  };
  const settle = async () => {
    await page.locator('[data-testid^="row-message-"]').last().scrollIntoViewIfNeeded().catch(() => {});
    await sleep(3500);
  };
  const send = async (text) => {
    const before = await msgCount();
    await page.locator('[data-testid="input-message"]').click();
    await page.keyboard.type(text, { delay: 40 });
    await sleep(700);
    await page.locator('[data-testid="button-send"]').click();
    await waitNewMessages(before, 2);
    await waitThinkingDone();
    await settle();
  };

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="input-message"]');
  await sleep(2500);

  // Beat 1 - proactive: it surfaces what needs attention unprompted
  const beforeBg = await msgCount();
  await page.click('[data-testid="button-background"]');
  await waitNewMessages(beforeBg, 1);
  await settle();

  // Beat 2 - one-prompt delegation: flights + inbox triage at once
  await send('I am at SF Tech Week Nov 3-6. Check my inbox for anything that needs handling, book me a refundable flight from DFW to SFO on Nov 3, and remember the trip.');

  // Show the pending approvals queue
  await page.click('[data-testid="tab-approvals"]');
  await sleep(2500);

  // Beat 3 - approve by text: real signed Twilio webhook, no app needed
  const pending = await pendingCodes();
  for (const p of pending) {
    const before = await msgCount();
    const status = await sendSms(`APPROVE ${p.code}`);
    console.log(`sms APPROVE ${p.code} -> ${status}`);
    await waitNewMessages(before, 1);
    await waitThinkingDone();
    await sleep(2500);
  }
  await settle();

  // Beat 4 - kill switch by text: full stop from anywhere
  const beforeKill = await msgCount();
  console.log('sms stop everything ->', await sendSms('stop everything'));
  await waitNewMessages(beforeKill, 1);
  await sleep(3500);

  // Brief look at the audit trail
  await page.click('[data-testid="tab-activity"]');
  await sleep(3000);
  await page.click('[data-testid="tab-approvals"]');
  await sleep(2500);

  await context.close();
  await browser.close();
  console.log('RECORDED:', fs.readdirSync(REC));
})().catch((e) => { console.error(e); process.exit(1); });
