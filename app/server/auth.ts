import type { NextFunction, Request, Response } from "express";
import {
  multiUser, ensureLocalUser, LOCAL_USER, createSession, sessionUser, deleteSession,
  createAuthToken, consumeAuthToken, findOrCreateUser, bindChannel, getUser,
} from "./agent/db";
import { emailSender } from "./agent/email";
import { smsSender } from "./agent/sms";
import { AGENT_NAME } from "./agent/db";

// Passwordless auth: email magic links and phone OTPs. Sessions are opaque
// tokens in an httpOnly cookie; only the SHA-256 of the token is stored.
// In single-user mode (default, OPA_MULTI_USER unset) there is no auth: every
// request resolves to the "local" user and the app behaves as before.

export const SESSION_COOKIE = "opa_session";

export function cookieToken(req: Request): string | null {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function requestUserId(req: Request): Promise<string> {
  if (!multiUser()) { await ensureLocalUser(); return LOCAL_USER; }
  const token = cookieToken(req);
  return token ? (await sessionUser(token)) ?? "" : "";
}

// Gate for /api routes that need a signed-in user.
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const uid = await requestUserId(req);
  if (!uid) return res.status(401).json({ message: "Sign in required" });
  (req as any).userId = uid;
  next();
}

function setSessionCookie(res: Response, raw: string) {
  const secure = (process.env.PUBLIC_BASE_URL || "").startsWith("https://") ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(raw)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}`);
}

function publicBase(req: Request): string {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
}

// ---------- route handlers (registered in routes.ts) ----------

// GET /api/auth/session: returns the signed-in identity.
export async function getSession(req: Request, res: Response) {
  if (!multiUser()) {
    const u = await ensureLocalUser();
    return res.json({ userId: u.id, singleUser: true, email: u.email, phone: u.phone });
  }
  const uid = await requestUserId(req);
  if (!uid) return res.json({ userId: null, singleUser: false });
  const u = await getUser(uid);
  res.json({ userId: uid, singleUser: false, email: u?.email ?? null, phone: u?.phone ?? null });
}

// POST /api/auth/magic-link { email }
export async function postMagicLink(req: Request, res: Response) {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Valid email required" });
  const { raw } = await createAuthToken("magic", email);
  const link = `${publicBase(req)}/api/auth/verify?token=${raw}`;
  const sent = await emailSender().send(email, `Your ${AGENT_NAME} sign-in link`, `Sign in: ${link}\n\nThis link works once and expires in 15 minutes.`);
  // With the simulated sender there is no real email — surface the link so the
  // flow still works in dev and demo environments.
  const simulated = emailSender().name === "simulated-outbox";
  res.json({ sent: sent.delivery, ...(simulated ? { devLink: link } : {}) });
}

// GET /api/auth/verify?token=... — consumes a magic link, creates the session.
export async function getVerify(req: Request, res: Response) {
  const token = String(req.query.token || "");
  const hit = token ? await consumeAuthToken("magic", "", token) : null;
  if (!hit) return res.status(400).send("That link is invalid or expired. Request a new one.");
  const email = hit.subject;
  const user = await findOrCreateUser({ email });
  await bindChannel(user.id, "email", email);
  setSessionCookie(res, await createSession(user.id));
  res.redirect("/");
}

// POST /api/auth/phone/request { phone } — SMS OTP.
export async function postPhoneRequest(req: Request, res: Response) {
  const phone = String(req.body?.phone || "").trim();
  if (!/^\+?\d[\d\s-]{6,}$/.test(phone)) return res.status(400).json({ message: "Valid phone required (E.164 preferred)" });
  const norm = phone.replace(/[^\d+]/g, "");
  const { raw } = await createAuthToken("otp", norm);
  const sent = await smsSender().send(norm, `Your ${AGENT_NAME} code is ${raw}. It expires in 15 minutes.`);
  const simulated = smsSender().name === "simulated-sms";
  res.json({ sent: sent.delivery, ...(simulated ? { devCode: raw } : {}) });
}

// POST /api/auth/phone/verify { phone, code } — sign in by phone.
export async function postPhoneVerify(req: Request, res: Response) {
  const phone = String(req.body?.phone || "").replace(/[^\d+]/g, "");
  const code = String(req.body?.code || "").trim();
  const hit = phone && code ? await consumeAuthToken("otp", phone, code) : null;
  if (!hit) return res.status(401).json({ message: "Invalid or expired code" });
  const user = await findOrCreateUser({ phone });
  await bindChannel(user.id, "sms", phone);
  setSessionCookie(res, await createSession(user.id));
  res.json({ ok: true, userId: user.id });
}

// POST /api/auth/logout
export async function postLogout(req: Request, res: Response) {
  const token = cookieToken(req);
  if (token) await deleteSession(token);
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
  res.json({ ok: true });
}

// ---------- channel binding for a signed-in user ----------
// POST /api/channels/bind/phone { phone } → sends OTP; verify with bind/verify.
// POST /api/channels/bind/email { email } → sends a link that binds on click.
// POST /api/channels/bind/verify { phone|email, code } → completes binding.
export async function postBindStart(req: Request, res: Response) {
  const uid = (req as any).userId as string;
  const channel = req.body?.channel === "email" ? "email" : "sms";
  const address = String(req.body?.address || "").trim();
  if (!address) return res.status(400).json({ message: "address required" });
  if (channel === "sms") {
    const norm = address.replace(/[^\d+]/g, "");
    const { raw } = await createAuthToken("bind_sms", norm, uid);
    const sent = await smsSender().send(norm, `Code ${raw} links this number to your ${AGENT_NAME} account.`);
    return res.json({ sent: sent.delivery, ...(smsSender().name === "simulated-sms" ? { devCode: raw } : {}) });
  }
  const email = address.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Valid email required" });
  const { raw } = await createAuthToken("bind_email", email, uid);
  const link = `${publicBase(req)}/api/channels/bind/verify?token=${raw}&email=${encodeURIComponent(email)}`;
  const sent = await emailSender().send(email, `Link this email to ${AGENT_NAME}`, `Confirm: ${link}\n\nExpires in 15 minutes.`);
  return res.json({ sent: sent.delivery, ...(emailSender().name === "simulated-outbox" ? { devLink: link } : {}) });
}

export async function postBindVerify(req: Request, res: Response) {
  const uid = (req as any).userId as string;
  const channel = req.body?.channel === "email" ? "email" : "sms";
  const address = String(req.body?.address || "").trim().toLowerCase();
  const code = String(req.body?.code || req.query.token || "").trim();
  const kind = channel === "sms" ? "bind_sms" : "bind_email";
  const subject = channel === "sms" ? address.replace(/[^\d+]/g, "") : address;
  const hit = code ? await consumeAuthToken(kind, channel === "sms" ? subject : "", code) : null;
  if (!hit || hit.payload !== uid) return res.status(401).json({ message: "Invalid or expired code/link" });
  await bindChannel(uid, channel, hit.subject);
  res.json({ ok: true, channel, address: hit.subject });
}

// GET variant so emailed bind links work from a mail client.
export async function getBindVerify(req: Request, res: Response) {
  const uid = await requestUserId(req);
  if (!uid) { res.status(401).send("Sign in first, then click the link again."); return; }
  const email = String(req.query.email || "").toLowerCase();
  const token = String(req.query.token || "");
  const hit = token ? await consumeAuthToken("bind_email", "", token) : null;
  if (!hit || hit.payload !== uid || hit.subject !== email) { res.status(400).send("That link is invalid or expired."); return; }
  await bindChannel(uid, "email", hit.subject);
  res.redirect("/");
}
