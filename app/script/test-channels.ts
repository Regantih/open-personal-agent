// Live end-to-end check of the SMS and email channel webhooks against a real
// HTTP server — no external services needed. Verifies:
//   * the Twilio signature check accepts a correctly signed request and the
//     webhook answers with TwiML
//   * a forged SMS signature is rejected
//   * an owner email to the agent address gets an agent reply by email
//   * third-party inbound mail lands in the inbox instead
//
//   npm run test:channels

process.env.OPA_DB_PATH = ":memory:";
process.env.TWILIO_AUTH_TOKEN = "tok_test_123";
process.env.OWNER_PHONE = "+15551234567";
process.env.EMAIL_CHANNEL_SECRET = "email_secret_123";
process.env.OWNER_EMAIL = "me@example.com";
process.env.AGENT_EMAIL = "agent@opa.example.com";
process.env.ANTHROPIC_API_KEY = "test-no-key";

import { createHmac } from "node:crypto";
import { createServer } from "node:http";

async function main() {
  const express = (await import("express")).default;
  const { registerRoutes } = await import("../server/routes");
  const { setScriptedModel, scriptOutput } = await import("../server/agent/llm");
  const db = await import("../server/agent/db");

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
  const port = (httpServer.address() as any).port;
  const base = `http://127.0.0.1:${port}`;
  process.env.PUBLIC_BASE_URL = base;

  let pass = 0, fail = 0;
  const check = (name: string, ok: boolean, extra = "") => {
    if (ok) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
  };

  // --- SMS: correctly signed Twilio request ---
  const smsParams = { From: "+15551234567", Body: "stop everything", To: "+15557654321" };
  const sigBase = `${base}/api/channels/sms` + Object.keys(smsParams).sort().map((k) => k + (smsParams as any)[k]).join("");
  const sig = createHmac("sha1", process.env.TWILIO_AUTH_TOKEN!).update(sigBase).digest("base64");
  const smsResp = await fetch(`${base}/api/channels/sms`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": sig },
    body: new URLSearchParams(smsParams).toString(),
  });
  const twiml = await smsResp.text();
  check("sms: valid signature accepted", smsResp.status === 200 && twiml.includes("<Response>") && /Stopped/i.test(twiml), `status=${smsResp.status} body=${twiml.slice(0, 120)}`);

  // --- SMS: forged signature rejected ---
  const bad = await fetch(`${base}/api/channels/sms`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": "forged" },
    body: new URLSearchParams(smsParams).toString(),
  });
  check("sms: forged signature rejected with 403", bad.status === 403, `status=${bad.status}`);

  // --- Email: owner command to the agent address gets a reply ---
  setScriptedModel(async (req) => {
    if (req.messages.length && JSON.stringify(req.messages.at(-1)).includes("tool_result")) {
      return scriptOutput({ say: "You have board prep at 9 tomorrow." });
    }
    return scriptOutput({ tool: "get_calendar", input: { days_ahead: 2 } });
  });
  const mailResp = await fetch(`${base}/api/channels/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-opa-email-secret": "email_secret_123" },
    body: JSON.stringify({ from: "Me <me@example.com>", to: "agent@opa.example.com", subject: "Tomorrow?", text: "what is on my calendar tomorrow" }),
  });
  const mailJson: any = await mailResp.json();
  check("email: owner command answered", mailResp.status === 200 && mailJson.delivered === "replied" && /board prep/i.test(mailJson.reply ?? ""), `status=${mailResp.status} body=${JSON.stringify(mailJson).slice(0, 200)}`);

  // --- Email: third-party mail goes to the inbox, not the agent ---
  const inboxBefore = db.listInbox().length;
  const third = await fetch(`${base}/api/channels/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-opa-email-secret": "email_secret_123" },
    body: JSON.stringify({ from: "newsletter@outside.example", to: "me@example.com", subject: "Weekly digest", text: "hi" }),
  });
  const thirdJson: any = await third.json();
  check("email: third-party mail delivered to inbox", third.status === 200 && thirdJson.delivered === "inbox" && db.listInbox().length === inboxBefore + 1, `status=${third.status}`);

  // --- Email: no secret rejected ---
  const noAuth = await fetch(`${base}/api/channels/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: "me@example.com", to: "agent@opa.example.com", subject: "x", text: "x" }),
  });
  check("email: missing secret rejected with 403", noAuth.status === 403, `status=${noAuth.status}`);

  httpServer.close();
  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
