// Full-length demo: personalize -> proactive check + action buttons ->
// delegate -> approve by SMS -> data tour -> kill switch by SMS.
// Usage: node record-demo3.js  ->  rec3/*.webm
const { chromium } = require('playwright-core');
const { createHmac } = require('node:crypto');
const path = require('path');
const fs = require('fs');

const EXE = 'C:\\Users\\hrega\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const BASE = 'http://127.0.0.1:5199';
const REC = path.join(__dirname, 'rec3');
const TWILIO_TOKEN = 'demo_twilio_tok';
const OWNER_PHONE = '+15551234567';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  return s.approvals.filter((a) => a.status === 'pending');
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
  const settle = async (ms = 3500) => {
    await page.locator('[data-testid^="row-message-"]').last().scrollIntoViewIfNeeded().catch(() => {});
    await sleep(ms);
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
  const approveAllBySms = async () => {
    const pending = await pendingCodes();
    for (const p of pending) {
      const before = await msgCount();
      console.log(`sms APPROVE ${p.code} (${p.action}) ->`, await sendSms(`APPROVE ${p.code}`));
      await waitNewMessages(before, 1);
      await waitThinkingDone();
      await sleep(2500);
    }
    return pending.length;
  };

  // Beat 0 - how it launches: the real README, then the running app
  await page.goto('https://github.com/Regantih/open-personal-agent/blob/main/app/README.md', { waitUntil: 'domcontentloaded' });
  const setup = page.locator('text=/npm (install|run dev)/').first();
  if (await setup.count()) await setup.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(5000);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="input-message"]');
  await sleep(2500);

  // Beat 1 - personalize: teach it a preference, then show it lives in memory
  await send('Remember I prefer aisle seats on flights over 2 hours');
  await page.click('[data-testid="tab-memory"]');
  await sleep(3000);

  // Beat 2 - proactive: batch lane surfaces what needs attention + refreshes action buttons
  const beforeBg = await msgCount();
  await page.click('[data-testid="button-background"]');
  await waitNewMessages(beforeBg, 1);
  await settle(5000);

  // Beat 3 - tap one of the computed action buttons (whatever it suggests first)
  const chip = page.locator('[data-testid="button-suggestion-0"]');
  if (await chip.count()) {
    const chipText = await chip.textContent();
    console.log('action button tapped:', chipText?.trim());
    const before = await msgCount();
    await chip.click();
    await waitNewMessages(before, 2);
    await waitThinkingDone();
    await settle();
    await approveAllBySms();
  }

  // Beat 4 - delegation: inbox triage (flags phishing, queues a draft)
  await send('Check my inbox and handle anything important');
  // then the travel ask -> refundable booking approval
  await send('Find me a flight from DFW to SFO on November 3 and book a refundable option');
  await page.click('[data-testid="tab-approvals"]');
  await sleep(2500);
  await approveAllBySms();

  // Beat 5 - how it sees your data
  await page.click('[data-testid="tab-data"]');
  await sleep(3500);
  await page.click('[data-testid="tab-memory"]');
  await sleep(3000);

  // Beat 6 - kill switch by text
  const beforeKill = await msgCount();
  console.log('sms stop everything ->', await sendSms('stop everything'));
  await waitNewMessages(beforeKill, 1);
  await sleep(3500);
  await page.click('[data-testid="tab-activity"]');
  await sleep(3000);

  await context.close();
  await browser.close();
  console.log('RECORDED:', fs.readdirSync(REC));
})().catch((e) => { console.error(e); process.exit(1); });
