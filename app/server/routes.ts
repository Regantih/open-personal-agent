import type { Express, Request } from "express";
import type { Server } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import * as db from "./agent/db";
import { handleInbound, decideApproval, runBackground, models } from "./agent/agent";
import { policy, policyPath, limits } from "./agent/policy";
import { exportOMF, importOMF } from "./agent/omf";
import { sendMessageSchema, decideApprovalSchema, settingsUpdateSchema, type StateSnapshot } from "@shared/schema";

function snapshot(): StateSnapshot {
  return {
    messages: db.listMessages(),
    approvals: db.listApprovals(),
    events: db.listEvents(),
    facts: db.listFacts(),
    calendar: db.listCalendar(Date.now() - 86400000, Date.now() + 30 * 86400000),
    inbox: db.listInbox(),
    bookings: db.listBookings(),
    subscriptions: db.listSubscriptions(),
    outbox: db.listOutbox(),
    settings: {
      paused: db.getSetting("paused", false),
      standingLimitUsd: db.getSetting("standing_limit_usd", limits.defaultStandingLimitUsd),
      maxDailySpendUsd: limits.maxDailySpendUsd,
      optIns: db.getSetting<string[]>("opt_ins", []),
      plannerModel: models.planner,
      fastModel: models.fast,
      llmConfigured: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_BASE_URL),
      smsConfigured: !!process.env.TWILIO_AUTH_TOKEN,
    },
    policy: { version: policy.version, defaultTier: policy.default_tier ?? "T3", actions: policy.actions.map((a) => ({ match: a.match, tier: a.tier })) },
  };
}

// Twilio request signature check: HMAC-SHA1 over the full URL plus sorted POST params.
function validTwilioSignature(req: Request): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;
  const url = (process.env.PUBLIC_BASE_URL || "") + req.originalUrl;
  const params = req.body as Record<string, string>;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", token).update(data).digest("base64");
  const got = String(req.headers["x-twilio-signature"] || "");
  return got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  db.seed();
  console.log(`[opa] policy loaded from ${policyPath}; planner=${models.planner} fast=${models.fast}`);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/state", (_req, res) => res.json(snapshot()));

  app.post("/api/messages", async (req, res) => {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Message text is required" });
    const reply = await handleInbound(parsed.data.text, "web");
    res.json({ reply });
  });

  app.post("/api/approvals/:id", async (req, res) => {
    const parsed = decideApprovalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid decision" });
    const r = await decideApproval(Number(req.params.id), parsed.data.decision, !!parsed.data.allowCategory, "web");
    res.status(r.ok ? 200 : 409).json(r);
  });

  app.post("/api/settings", (req, res) => {
    const parsed = settingsUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid settings" });
    const s = parsed.data;
    if (s.standingLimitUsd !== undefined) {
      if (s.standingLimitUsd > limits.maxDailySpendUsd) return res.status(400).json({ message: `Standing limit cannot exceed the daily cap of $${limits.maxDailySpendUsd}` });
      db.setSetting("standing_limit_usd", s.standingLimitUsd);
      db.logEvent("policy", `Standing limit for T3 set to $${s.standingLimitUsd}`, null);
    }
    if (s.paused !== undefined) {
      db.setSetting("paused", s.paused);
      if (s.paused) db.denyAllPending("Cancelled by kill switch");
      db.logEvent("kill_switch", s.paused ? "Paused from settings" : "Resumed from settings", null);
    }
    if (s.revokeOptIn) {
      db.setSetting("opt_ins", db.getSetting<string[]>("opt_ins", []).filter((x) => x !== s.revokeOptIn));
      db.logEvent("policy", `Revoked T2 opt-in for ${s.revokeOptIn}`, null);
    }
    res.json(snapshot().settings);
  });

  app.post("/api/background/run", async (_req, res) => {
    try { res.json({ text: await runBackground() }); }
    catch (e: any) { db.logEvent("error", `Background lane failed: ${e.message}`, null); res.status(502).json({ message: e.message }); }
  });

  app.get("/api/memory/export", (_req, res) => {
    try {
      const doc = exportOMF();
      db.logEvent("memory", `Exported ${doc.facts.length} facts as Open Memory Format v0.1`, null);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="memory-omf-${new Date().toLocaleDateString("en-CA")}.json"`);
      res.send(JSON.stringify(doc, null, 2));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.get("/api/memory/preview", (_req, res) => { try { res.json(exportOMF()); } catch (e: any) { res.status(500).json({ message: e.message }); } });
  app.post("/api/memory/import", (req, res) => {
    try { res.json(importOMF(req.body)); } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.post("/api/memory/:id/forget", (req, res) => {
    const ok = db.forgetFact(req.params.id);
    db.logEvent("memory", `User removed fact ${req.params.id}`, null);
    res.json({ ok });
  });
  app.delete("/api/memory", (_req, res) => {
    db.deleteAllFacts();
    db.logEvent("memory", "User deleted all memory", null);
    res.json({ ok: true });
  });

  app.post("/api/reset", (_req, res) => { db.seed(true); res.json({ ok: true }); });

  // SMS channel (Twilio-compatible webhook). Requires TWILIO_AUTH_TOKEN and PUBLIC_BASE_URL; OWNER_PHONE restricts who can use the agent.
  app.post("/api/channels/sms", async (req, res) => {
    if (!validTwilioSignature(req)) return res.status(403).send("invalid signature");
    const from = String(req.body.From || "");
    if (process.env.OWNER_PHONE && from !== process.env.OWNER_PHONE) return res.status(403).send("unknown sender");
    const text = String(req.body.Body || "").slice(0, 2000);
    const reply = await handleInbound(text, "sms");
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(reply.slice(0, 1500))}</Message></Response>`);
  });

  const interval = Number(process.env.OPA_BACKGROUND_INTERVAL_MIN || 0);
  if (interval > 0) setInterval(() => runBackground().catch((e) => db.logEvent("error", `Background lane failed: ${e.message}`, null)), interval * 60000);

  return httpServer;
}
