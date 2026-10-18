import type { Express, Request } from "express";
import type { Server } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  storeFor, DEFAULT_SUGGESTIONS, multiUser, ensureLocalUser, LOCAL_USER, initDb,
  listUserIds, getUserByAgentToken, parseAgentToken, agentAddressFor, findUserByChannel,
  listBindings, listUserKeyProviders, getUser, listProviderConnections,
} from "./agent/db";
import { saveUserKey, deleteUserKey, freeTierRemaining, FREE_PLANNER_TURNS_PER_DAY } from "./agent/keys";
import { models, ctxFor, type Ctx } from "./agent/agent";
import { orchestrator, orchestratorName } from "./agent/orchestrator";
import { providerName } from "./agent/llm";
import { tracingEnabled } from "./agent/tracing";
import { emailSender, emailInboundConfigured, normalizeInbound, validInboundEmailAuth, isAgentAddressed, bareAddress } from "./agent/email";
import { policy, policyPath, limits } from "./agent/policy";
import { exportOMF, importOMF } from "./agent/omf";
import { requireUser } from "./auth";
import * as auth from "./auth";
import { securityHeaders, rateLimit } from "./security";
import { browserStatus, latestFrame, screenshot, forwardInput, closeBrowser } from "./agent/browser";
import { ttsConfigured, synthesize } from "./agent/voice";
import * as google from "./agent/providers/google";
import { flightsLive } from "./agent/flights";
import { sendMessageSchema, decideApprovalSchema, settingsUpdateSchema, type StateSnapshot } from "@shared/schema";

async function snapshot(ctx: Ctx): Promise<StateSnapshot> {
  const store = ctx.store;
  const u = await getUser(ctx.userId);
  const usage = await store.usageToday("realtime");
  const freeLeft = await freeTierRemaining(ctx.userId);
  const gconn = await google.googleConnection(ctx.userId);
  return {
    messages: await store.listMessages(),
    approvals: await store.listApprovals(),
    events: await store.listEvents(),
    facts: await store.listFacts(),
    calendar: await store.listCalendar(Date.now() - 86400000, Date.now() + 30 * 86400000),
    inbox: await store.listInbox(),
    bookings: await store.listBookings(),
    subscriptions: await store.listSubscriptions(),
    outbox: await store.listOutbox(),
    settings: {
      paused: await store.getSetting("paused", false),
      standingLimitUsd: await store.getSetting("standing_limit_usd", limits.defaultStandingLimitUsd),
      maxDailySpendUsd: limits.maxDailySpendUsd,
      optIns: await store.getSetting<string[]>("opt_ins", []),
      plannerModel: models.planner,
      fastModel: models.fast,
      llmConfigured: providerName() !== "anthropic" || !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_BASE_URL),
      llmProvider: providerName(),
      smsConfigured: !!process.env.TWILIO_AUTH_TOKEN,
      emailConfigured: emailInboundConfigured() || emailSender().name !== "simulated-outbox",
      tracing: tracingEnabled(),
      orchestrator: orchestratorName(),
      singleUser: !multiUser(),
      userEmail: u?.email ?? null,
      userPhone: u?.phone ?? null,
      agentEmail: u ? agentAddressFor(u) : null,
      boundChannels: await listBindings(ctx.userId),
      keyProviders: (await listUserKeyProviders(ctx.userId)).filter((p) => !p.includes(":")),
      connections: await listProviderConnections(ctx.userId),
      oauthProviders: google.googleConfigured() ? ["google"] : [],
      providerStatus: {
        calendar: gconn ? "google-calendar" : "local",
        inbox: gconn ? "gmail" : "local",
        flights: flightsLive() ? "duffel" : "sample",
        cards: process.env.LITHIC_API_KEY ? "lithic" : "simulated",
      },
      usageToday: { turns: usage.turns, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
      freeTierRemaining: freeLeft,
      freeTierLimit: freeLeft === null ? null : FREE_PLANNER_TURNS_PER_DAY,
    },
    suggestions: await store.getSetting("action_suggestions", DEFAULT_SUGGESTIONS),
    policy: { version: policy.version, defaultTier: policy.default_tier ?? "T3", actions: policy.actions.map((a) => ({ match: a.match, tier: a.tier })) },
  };
}

// Twilio request signature check: HMAC-SHA1 over the full URL plus sorted POST params.
export function validTwilioSignature(req: Request): boolean {
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
  await initDb();
  app.use(securityHeaders);
  const authLimiter = rateLimit({ windowMs: 10 * 60_000, max: 20, name: "auth" });
  const msgLimiter = rateLimit({ windowMs: 60_000, max: 30, name: "msg" });
  app.use("/api/auth", authLimiter);
  app.use(["/api/messages", "/api/channels/sms", "/api/channels/email"], msgLimiter);
  const orch = await orchestrator();
  if (!multiUser()) {
    await ensureLocalUser();
    await storeFor(LOCAL_USER).seed();
  }
  console.log(`[opa] policy loaded from ${policyPath}; planner=${models.planner} fast=${models.fast} provider=${providerName()} orchestrator=${orch.name} mode=${multiUser() ? "multi-user" : "single-user"}`);

  // Scheduled proactive lane: OPA_PROACTIVE_INTERVAL_MINUTES>0 runs the batch
  // check (proactive summary + action buttons) for every user.
  const proactiveMins = Number(process.env.OPA_PROACTIVE_INTERVAL_MINUTES || 0);
  if (proactiveMins > 0) {
    setInterval(() => {
      void (async () => {
        for (const uid of await listUserIds()) {
          const store = storeFor(uid);
          store.getSetting<boolean>("paused", false).then((paused) => {
            if (paused) return;
            orch.runBackground(uid).catch((e: any) => store.logEvent("error", `Scheduled background check failed: ${e.message}`, null));
          });
        }
      })();
    }, proactiveMins * 60_000).unref();
    console.log(`[opa] proactive lane every ${proactiveMins}m`);
  }

  // ---------- auth ----------
  app.get("/api/auth/session", auth.getSession);
  app.post("/api/auth/magic-link", auth.postMagicLink);
  app.get("/api/auth/verify", auth.getVerify);
  app.post("/api/auth/phone/request", auth.postPhoneRequest);
  app.post("/api/auth/phone/verify", auth.postPhoneVerify);
  app.post("/api/auth/logout", auth.postLogout);
  app.get("/api/channels/bind/verify", auth.getBindVerify); // emailed link, no JSON body

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // ---------- webhooks (own auth; resolve the user from the channel) ----------
  // These must be registered BEFORE the /api auth gate: their callers are
  // Twilio/Mailgun, not browsers, so they authenticate by provider signature.

  // SMS channel (Twilio-compatible webhook). Requires TWILIO_AUTH_TOKEN and
  // PUBLIC_BASE_URL. Multi-user: the From number must be bound to an account.
  // Single-user: OWNER_PHONE gates who may text the agent.
  app.post("/api/channels/sms", async (req, res) => {
    if (!validTwilioSignature(req)) return res.status(403).send("invalid signature");
    const from = String(req.body.From || "").replace(/[^\d+]/g, "");
    let userId = "";
    if (multiUser()) {
      userId = (await findUserByChannel("sms", from))?.id ?? "";
      if (!userId) {
        return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>This number isn't linked to an account. Add it under Settings &gt; Channels in the app first.</Message></Response>`);
      }
    } else {
      if (process.env.OWNER_PHONE && from !== process.env.OWNER_PHONE.replace(/[^\d+]/g, "")) return res.status(403).send("unknown sender");
      userId = LOCAL_USER;
    }
    const text = String(req.body.Body || "").slice(0, 2000);
    const reply = await orch.runTurn(userId, text, "sms");
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(reply.slice(0, 1500))}</Message></Response>`);
  });

  // Email channel. In multi-user mode the per-user agent address
  // (agent+<token>@<domain>) routes mail: a bound sender issues commands, anyone
  // else lands in that user's inbox as untrusted content. Single-user mode
  // keeps OWNER_EMAIL/AGENT_EMAIL semantics.
  app.post("/api/channels/email", async (req, res) => {
    if (!validInboundEmailAuth(req)) return res.status(403).send("invalid or missing credentials");
    const mail = normalizeInbound(req.body ?? {});
    if (!mail.from) return res.status(400).send("missing sender");

    let userId = "";
    let isCommand = false;
    if (multiUser()) {
      const token = parseAgentToken(mail.to);
      const target = token ? await getUserByAgentToken(token) : undefined;
      if (!target) return res.status(200).json({ delivered: "dropped", reason: "no user for agent address" });
      userId = target.id;
      isCommand = (await findUserByChannel("email", bareAddress(mail.from)))?.id === userId;
    } else {
      userId = LOCAL_USER;
      isCommand = isAgentAddressed(mail);
    }

    const store = storeFor(userId);
    await store.logEvent("message_in", `EMAIL from ${mail.from}: ${mail.subject}`.slice(0, 160), { channel: "email", from: mail.from });
    if (!isCommand) {
      await store.addInboundEmail(mail.from, mail.subject, mail.text);
      return res.json({ delivered: "inbox" });
    }
    const text = `${mail.subject === "(no subject)" ? "" : `Subject: ${mail.subject}\n\n`}${mail.text}`.slice(0, 2000) || mail.subject;
    try {
      const reply = await orch.runTurn(userId, text, "email");
      const sender = emailSender();
      const sent = await sender.send(bareAddress(mail.from), `Re: ${mail.subject}`, reply);
      await store.logEvent("message_out", `EMAIL to ${mail.from}: ${reply.slice(0, 140)}`, { channel: "email", delivery: sent.delivery });
      res.json({ delivered: "replied", via: sender.name, reply });
    } catch (e: any) {
      await store.logEvent("error", `Email channel failed: ${e.message}`, null);
      res.status(502).json({ message: e.message });
    }
  });

  // ---------- provider connections (OAuth) ----------
  // Start + disconnect need a session; the callback authenticates via the
  // signed state param (the browser's cookie may not survive the round trip).
  app.get("/api/connect/google", requireUser, async (req, res) => {
    try {
      res.redirect(await google.googleAuthUrl((req as any).userId));
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.get("/api/connect/google/callback", async (req, res) => {
    try {
      const userId = await google.verifyState(String(req.query.state ?? ""));
      const { accountLabel } = await google.completeGoogleAuth(userId, String(req.query.code ?? ""));
      await storeFor(userId).logEvent("provider", `Connected Google account${accountLabel ? ` (${accountLabel})` : ""}`, null);
      res.redirect("/?connected=google");
    } catch (e: any) {
      res.redirect(`/?connect_error=${encodeURIComponent(e.message.slice(0, 200))}`);
    }
  });
  app.post("/api/connect/google/disconnect", requireUser, async (req, res) => {
    await google.disconnectGoogle((req as any).userId);
    await storeFor((req as any).userId).logEvent("provider", "Disconnected Google account", null);
    res.json({ disconnected: true });
  });

  // Everything below requires a signed-in user (or resolves to 'local' in
  // single-user mode).
  app.use("/api", requireUser);

  const ctx = (req: Request): Ctx => ctxFor((req as any).userId);

  app.get("/api/state", async (req, res) => res.json(await snapshot(ctx(req))));

  app.post("/api/messages", async (req, res) => {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Message text is required" });
    const reply = await orch.runTurn((req as any).userId, parsed.data.text, "web");
    res.json({ reply });
  });

  app.post("/api/approvals/:id", async (req, res) => {
    const parsed = decideApprovalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid decision" });
    const r = await orch.runApproval((req as any).userId, Number(req.params.id), parsed.data.decision, !!parsed.data.allowCategory, "web");
    res.status(r.ok ? 200 : 409).json(r);
  });

  app.post("/api/settings", async (req, res) => {
    const parsed = settingsUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid settings" });
    const store = ctx(req).store;
    const s = parsed.data;
    if (s.standingLimitUsd !== undefined) {
      if (s.standingLimitUsd > limits.maxDailySpendUsd) return res.status(400).json({ message: `Standing limit cannot exceed the daily cap of $${limits.maxDailySpendUsd}` });
      await store.setSetting("standing_limit_usd", s.standingLimitUsd);
      await store.logEvent("policy", `Standing limit for T3 set to $${s.standingLimitUsd}`, null);
    }
    if (s.paused !== undefined) {
      await store.setSetting("paused", s.paused);
      if (s.paused) await store.denyAllPending("Cancelled by kill switch");
      await store.logEvent("kill_switch", s.paused ? "Paused from settings" : "Resumed from settings", null);
    }
    if (s.revokeOptIn) {
      await store.setSetting("opt_ins", (await store.getSetting<string[]>("opt_ins", [])).filter((x) => x !== s.revokeOptIn));
      await store.logEvent("policy", `Revoked T2 opt-in for ${s.revokeOptIn}`, null);
    }
    res.json((await snapshot(ctx(req))).settings);
  });

  app.post("/api/background/run", async (req, res) => {
    const store = ctx(req).store;
    try { res.json({ text: await orch.runBackground((req as any).userId) }); }
    catch (e: any) { await store.logEvent("error", `Background lane failed: ${e.message}`, null); res.status(502).json({ message: e.message }); }
  });

  // ---------- BYOK keys ----------
  app.get("/api/keys", async (req, res) => res.json({ providers: await listUserKeyProviders((req as any).userId) }));
  app.post("/api/keys", async (req, res) => {
    const provider = String(req.body?.provider || "").toLowerCase();
    const key = String(req.body?.key || "").trim();
    if (!["anthropic", "openai"].includes(provider)) return res.status(400).json({ message: "provider must be anthropic or openai" });
    if (key.length < 8) return res.status(400).json({ message: "key required" });
    await saveUserKey((req as any).userId, provider, key);
    await ctx(req).store.logEvent("policy", `Stored ${provider} model key (encrypted at rest)`, null);
    res.json({ ok: true, provider });
  });
  app.delete("/api/keys/:provider", async (req, res) => {
    const ok = await deleteUserKey((req as any).userId, String(req.params.provider));
    res.json({ ok });
  });

  // ---------- channel bindings ----------
  app.get("/api/channels", async (req, res) => {
    const uid = (req as any).userId as string;
    const u = await getUser(uid);
    res.json({ bindings: await listBindings(uid), agentEmail: u ? agentAddressFor(u) : null });
  });
  app.post("/api/channels/bind", requireUser, auth.postBindStart);
  app.post("/api/channels/bind/verify", auth.postBindVerify);

  app.get("/api/memory/export", async (req, res) => {
    const store = ctx(req).store;
    try {
      const doc = await exportOMF(store, (req as any).userId);
      await store.logEvent("memory", `Exported ${doc.facts.length} facts as Open Memory Format v0.1`, null);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="memory-omf-${new Date().toLocaleDateString("en-CA")}.json"`);
      res.send(JSON.stringify(doc, null, 2));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.get("/api/memory/preview", async (req, res) => { try { res.json(await exportOMF(ctx(req).store, (req as any).userId)); } catch (e: any) { res.status(500).json({ message: e.message }); } });
  app.post("/api/memory/import", async (req, res) => {
    try { res.json(await importOMF(ctx(req).store, req.body)); } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.post("/api/memory/:id/forget", async (req, res) => {
    const ok = await ctx(req).store.forgetFact(req.params.id);
    await ctx(req).store.logEvent("memory", `User removed fact ${req.params.id}`, null);
    res.json({ ok });
  });
  app.delete("/api/memory", async (req, res) => {
    await ctx(req).store.deleteAllFacts();
    await ctx(req).store.logEvent("memory", "User deleted all memory", null);
    res.json({ ok: true });
  });

  app.post("/api/reset", async (req, res) => { await ctx(req).store.seed(true); res.json({ ok: true }); });

  // ---------- browser rung (live view + takeover) ----------
  app.get("/api/browser/status", (req, res) => res.json(browserStatus((req as any).userId)));
  app.get("/api/browser/frame", async (req, res) => {
    const st = browserStatus((req as any).userId);
    if (!st.open) return res.status(404).json({ message: "no browser session" });
    const f = latestFrame((req as any).userId)
      // No screencast (remote CDP without it) -> fall back to a CDP screenshot.
      // With a screencast, a pending first frame is a 204 — never a screenshot,
      // which would queue CDP work and starve the page's other requests.
      ?? (st.screencast ? null : await screenshot((req as any).userId));
    if (!f) return res.status(204).end();
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(f);
  });
  app.post("/api/browser/input", async (req, res) => {
    try {
      await forwardInput((req as any).userId, req.body ?? {});
      res.json({ ok: true });
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.post("/api/browser/close", async (req, res) => res.json({ closed: await closeBrowser((req as any).userId) }));

  // ---------- voice lane ----------
  app.get("/api/voice/status", (_req, res) => res.json({ tts: ttsConfigured() }));
  app.post("/api/voice/tts", async (req, res) => {
    try {
      const audio = await synthesize(String(req.body?.text || ""));
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      res.send(audio);
    } catch (e: any) { res.status(503).json({ message: e.message }); }
  });

  const interval = Number(process.env.OPA_BACKGROUND_INTERVAL_MIN || 0);
  if (interval > 0) setInterval(() => {
    void (async () => {
      for (const uid of await listUserIds()) orch.runBackground(uid).catch((e) => storeFor(uid).logEvent("error", `Background lane failed: ${e.message}`, null));
    })();
  }, interval * 60000).unref();

  return httpServer;
}
