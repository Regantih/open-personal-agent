// Multi-use-case demo: personalize -> proactive/action buttons -> calendar ->
// hold -> subscription cancel -> inbox+phishing+draft -> flight booking ->
// all approvals by SMS -> data tour -> kill switch by SMS.
// Usage: node record-demo4.js  ->  rec4/*.webm
const { chromium } = require('playwright-core');
const { createHmac } = require('node:crypto');
const path = require('path');
const fs = require('fs');

const EXE = 'C:\\Users\\hrega\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const BASE = 'http://127.0.0.1:5199';
const REC = path.join(__dirname, 'rec4');
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
  const settle = async (ms = 3200) => {
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

  // Beat 0 - launch: real README, then the app
  await page.goto('https://github.com/Regantih/open-personal-agent/blob/main/app/README.md', { waitUntil: 'domcontentloaded' });
  const setup = page.locator('text=/npm (install|run dev)/').first();
  if (await setup.count()) await setup.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(4500);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="input-message"]');
  await sleep(2000);

  // Beat 1 - personalization: teach a preference, see it in Memory
  await send('Remember I prefer aisle seats on flights over 2 hours');
  await page.click('[data-testid="tab-memory"]');
  await sleep(2800);

  // Beat 2 - proactive lane + computed action buttons; tap the first one
  const beforeBg = await msgCount();
  await page.click('[data-testid="button-background"]');
  await waitNewMessages(beforeBg, 1);
  await settle(3000);
  // wait for the batch lane to refresh the suggestion chips
  const defaultLabels = ['Calendar this week', 'Check my inbox', 'Unused subscriptions', 'Aisle seat rule'];
  for (let i = 0; i < 20; i++) {
    const s = await (await fetch(BASE + '/api/state')).json().catch(() => null);
    if (s && s.suggestions?.length && s.suggestions[0].label !== defaultLabels[0]) break;
    await sleep(1000);
  }
  await settle(2000);
  const chip = page.locator('[data-testid="button-suggestion-0"]');
  if (await chip.count()) {
    console.log('action button tapped:', (await chip.textContent())?.trim());
    const before = await msgCount();
    await chip.click();
    await waitNewMessages(before, 2);
    await waitThinkingDone();
    await settle();
    await approveAllBySms();
  }

  // Beat 3 - calendar hold: a T1 action it can just do
  await send('Block my calendar this Friday 2 to 4 pm for deep work');

  // Beat 5 - subscription audit + cancel (approval via SMS)
  await send('Which subscriptions am I not using? Cancel the most expensive unused one');
  await approveAllBySms();

  // Beat 6 - inbox triage: phishing flag + draft reply (approval via SMS)
  await send('Check my inbox and handle anything important. Draft a reply to anyone waiting on me.');
  await approveAllBySms();

  // Beat 7 - flight search + refundable booking (approval via SMS)
  await send('Find me a flight from DFW to SFO on November 3 and book a refundable option');
  await page.click('[data-testid="tab-approvals"]');
  await sleep(2000);
  await approveAllBySms();

  // Beat 8 - data tour
  await page.click('[data-testid="tab-data"]');
  await sleep(3200);
  await page.click('[data-testid="tab-memory"]');
  await sleep(2800);

  // Beat 9 - kill switch by text
  const beforeKill = await msgCount();
  console.log('sms stop everything ->', await sendSms('stop everything'));
  await waitNewMessages(beforeKill, 1);
  await sleep(3200);
  await page.click('[data-testid="tab-activity"]');
  await sleep(2800);

  await context.close();
  await browser.close();
  console.log('RECORDED:', fs.readdirSync(REC));
})().catch((e) => { console.error(e); process.exit(1); });
