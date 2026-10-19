import { createHmac, randomBytes } from "node:crypto";
import { readUserKey, saveUserKey, deleteUserKey } from "../keys";
import { masterKey } from "../keys";
import { saveProviderConnection, getProviderConnection, deleteProviderConnection, AGENT_NAME } from "../db";

// Google provider: OAuth2 + Calendar + Gmail, plain fetch (no googleapis dep).
//
//   GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + PUBLIC_BASE_URL -> live
//
// The user's refresh token is stored encrypted in user_keys (provider
// "google:refresh") — same AES-256-GCM vault as BYOK model keys. Access tokens
// are short-lived and cached in memory only. The provider_connections row
// holds non-secret metadata (account email, granted scopes) for the UI.

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
];

const KEY_PROVIDER = "google:refresh";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const CAL_API = "https://www.googleapis.com/calendar/v3";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.PUBLIC_BASE_URL);
}

function redirectUri(): string {
  return `${process.env.PUBLIC_BASE_URL}/api/connect/google/callback`;
}

// state = userId.nonce.sig — binds the callback to a user without a session
// cookie surviving the Google round trip. Signed under the master key.
async function signState(userId: string, nonce: string): Promise<string> {
  return createHmac("sha256", await masterKey()).update(`google-oauth:${userId}:${nonce}`).digest("hex").slice(0, 40);
}

export async function googleAuthUrl(userId: string): Promise<string> {
  if (!googleConfigured()) throw new Error("Google OAuth is not configured (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PUBLIC_BASE_URL)");
  const nonce = randomBytes(8).toString("hex");
  const sig = await signState(userId, nonce);
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent"); // always issue a refresh token
  url.searchParams.set("state", `${userId}.${nonce}.${sig}`);
  return url.toString();
}

export async function verifyState(state: string): Promise<string> {
  const [userId, nonce, sig] = state.split(".");
  if (!userId || !nonce || !sig) throw new Error("Malformed OAuth state");
  if ((await signState(userId, nonce)) !== sig) throw new Error("Invalid OAuth state signature");
  return userId;
}

// Exchange the auth code, persist the refresh token + connection metadata.
export async function completeGoogleAuth(userId: string, code: string): Promise<{ accountLabel: string | null }> {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(), grant_type: "authorization_code",
    }).toString(),
  });
  const tok: any = await resp.json();
  if (!resp.ok) throw new Error(`Google token exchange failed: ${tok.error_description || tok.error || resp.status}`);
  if (tok.refresh_token) await saveUserKey(userId, KEY_PROVIDER, tok.refresh_token);
  else if (!(await readUserKey(userId, KEY_PROVIDER))) throw new Error("Google did not return a refresh token — reconnect with prompt=consent");
  const accessToken = String(tok.access_token);
  const label = await gmailAddress(accessToken).catch(() => null);
  await saveProviderConnection(userId, "google", label, String(tok.scope ?? GOOGLE_SCOPES.join(" ")).split(" ").filter(Boolean));
  tokenCache.delete(userId);
  return { accountLabel: label };
}

export async function disconnectGoogle(userId: string): Promise<void> {
  const refresh = await readUserKey(userId, KEY_PROVIDER);
  if (refresh) {
    // Best-effort revocation at Google; local cleanup proceeds regardless.
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" }).catch(() => {});
  }
  await deleteUserKey(userId, KEY_PROVIDER);
  await deleteProviderConnection(userId, "google");
  tokenCache.delete(userId);
}

export async function googleConnection(userId: string) {
  return getProviderConnection(userId, "google");
}

// ---------- token plumbing ----------
const tokenCache = new Map<string, { token: string; expires: number }>();

export async function accessToken(userId: string): Promise<string> {
  const c = tokenCache.get(userId);
  if (c && c.expires > Date.now() + 60_000) return c.token;
  const refresh = await readUserKey(userId, KEY_PROVIDER);
  if (!refresh) throw new Error("Google is not connected. Connect it under Settings → Connections.");
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refresh, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }).toString(),
  });
  const tok: any = await resp.json();
  if (!resp.ok) throw new Error(`Google token refresh failed (${tok.error ?? resp.status}). Reconnect under Settings → Connections.`);
  const token = String(tok.access_token);
  tokenCache.set(userId, { token, expires: Date.now() + (Number(tok.expires_in ?? 3500)) * 1000 });
  return token;
}

async function gfetch(userId: string, url: string, init: RequestInit = {}): Promise<any> {
  const token = await accessToken(userId);
  const resp = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (!resp.ok) {
    const body = (await resp.text()).slice(0, 300);
    throw new Error(`Google API ${resp.status}: ${body}`);
  }
  return resp.json();
}

async function gmailAddress(token: string): Promise<string | null> {
  const resp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return null;
  const d: any = await resp.json();
  return d.email ?? null;
}

// ---------- Calendar ----------
export interface GCalEvent { id: string; title: string; start: number; end: number; location: string | null }

const gTime = (t: any): number => Date.parse(t?.dateTime ?? (t?.date ? t.date + "T00:00:00" : ""));

export async function gcalList(userId: string, timeMin: number, timeMax: number): Promise<GCalEvent[]> {
  const url = `${CAL_API}/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=50&timeMin=${new Date(timeMin).toISOString()}&timeMax=${new Date(timeMax).toISOString()}`;
  const data = await gfetch(userId, url);
  return (data.items ?? []).map((e: any) => ({
    id: `gcal:${e.id}`, title: e.summary ?? "(busy)", start: gTime(e.start), end: gTime(e.end) || gTime(e.start) + 3600000, location: e.location ?? null,
  })).filter((e: GCalEvent) => !isNaN(e.start));
}

export async function gcalInsert(userId: string, ev: { title: string; start: number; end: number; location?: string | null; description?: string }): Promise<string> {
  const data = await gfetch(userId, `${CAL_API}/calendars/primary/events`, {
    method: "POST",
    body: JSON.stringify({
      summary: ev.title, location: ev.location ?? undefined, description: ev.description ?? `Created by ${AGENT_NAME}`,
      start: { dateTime: new Date(ev.start).toISOString() }, end: { dateTime: new Date(ev.end).toISOString() },
      transparency: "transparent", // a hold doesn't block the calendar
    }),
  });
  return `gcal:${data.id}`;
}

// ---------- Gmail ----------
export interface GmailMessage { id: string; from: string; subject: string; body: string; receivedAt: number }

const headerVal = (headers: any[], name: string) => headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

function decodeBody(payload: any): string {
  const walk = (p: any): string => {
    if (!p) return "";
    if (p.mimeType === "text/plain" && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
    return (p.parts ?? []).map(walk).join("");
  };
  const text = walk(payload) || (payload?.body?.data ? Buffer.from(payload.body.data, "base64url").toString("utf8") : "");
  return text.slice(0, 8000);
}

export async function gmailList(userId: string, max = 15): Promise<GmailMessage[]> {
  const list = await gfetch(userId, `${GMAIL_API}/messages?maxResults=${max}&labelIds=INBOX`);
  const ids: string[] = (list.messages ?? []).map((m: any) => m.id);
  const out: GmailMessage[] = [];
  for (const id of ids.slice(0, max)) {
    const m = await gfetch(userId, `${GMAIL_API}/messages/${id}?format=full`);
    out.push({
      id: `gmail:${id}`,
      from: headerVal(m.payload?.headers, "From"),
      subject: headerVal(m.payload?.headers, "Subject") || "(no subject)",
      body: decodeBody(m.payload) || m.snippet || "",
      receivedAt: Number(m.internalDate ?? Date.now()),
    });
  }
  return out;
}

const rfc822 = (to: string, subject: string, body: string) =>
  `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`;

export async function gmailCreateDraft(userId: string, to: string, subject: string, body: string): Promise<string> {
  const raw = Buffer.from(rfc822(to, subject, body), "utf8").toString("base64url");
  const data = await gfetch(userId, `${GMAIL_API}/drafts`, { method: "POST", body: JSON.stringify({ message: { raw } }) });
  return `gmail-draft:${data.id}`;
}

export async function gmailSendDraft(userId: string, providerRef: string): Promise<string> {
  const draftId = providerRef.replace(/^gmail-draft:/, "");
  const data = await gfetch(userId, `${GMAIL_API}/drafts/send`, { method: "POST", body: JSON.stringify({ id: draftId }) });
  return `gmail message id ${data.id}`;
}
