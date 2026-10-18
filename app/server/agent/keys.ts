import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { storeFor, getUserKeyEnc, putUserKey, deleteUserKey, listUserKeyProviders, PLATFORM, sqlite, type EncBlob } from "./db";

// Bring-your-own-key vault. User-provided model/provider keys are encrypted at
// rest with AES-256-GCM under a master key. The master key comes from
// MASTER_KEY (recommended) or is generated once and stored in the platform
// settings row — acceptable for the reference app, document a real KMS for
// production. Plaintext keys are never stored, returned, or logged.

function platformSetting(key: string): string | null {
  const r = sqlite.prepare("SELECT value FROM settings WHERE user_id = ? AND key = ?").get(PLATFORM, key) as any;
  return r ? JSON.parse(r.value) : null;
}
function setPlatformSetting(key: string, value: string) {
  sqlite.prepare("INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value")
    .run(PLATFORM, key, JSON.stringify(value));
}

export function masterKey(): Buffer {
  if (process.env.MASTER_KEY) return createHash("sha256").update(process.env.MASTER_KEY).digest();
  let k = platformSetting("master_key");
  if (!k) { k = randomBytes(32).toString("hex"); setPlatformSetting("master_key", k); }
  return Buffer.from(k, "hex").subarray(0, 32);
}

export function encryptSecret(plaintext: string): EncBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function decryptSecret(enc: EncBlob): string {
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(enc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(enc.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(enc.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

// ---------- user key management ----------
export function saveUserKey(userId: string, provider: string, plaintext: string) {
  putUserKey(userId, provider, encryptSecret(plaintext));
}
export function readUserKey(userId: string, provider: string): string | null {
  const enc = getUserKeyEnc(userId, provider);
  return enc ? decryptSecret(enc) : null;
}
export { deleteUserKey, listUserKeyProviders };

// Which model credentials a turn should use. A user's stored key wins; the
// platform env config is the fallback (subject to free-tier caps upstream).
export interface LlmAuth { provider: "anthropic" | "openai"; apiKey?: string; baseUrl?: string }
export function resolveLlmAuth(userId: string): LlmAuth | null {
  const envProvider = (process.env.OPA_LLM_PROVIDER || "anthropic").toLowerCase() === "openai" ? "openai" : "anthropic";
  const key = readUserKey(userId, envProvider);
  if (key) return { provider: envProvider, apiKey: key, baseUrl: envProvider === "openai" ? process.env.OPA_OPENAI_BASE_URL : undefined };
  const anyProvider = listUserKeyProviders(userId)[0];
  if (anyProvider === "anthropic") return { provider: "anthropic", apiKey: readUserKey(userId, "anthropic")! };
  if (anyProvider === "openai") return { provider: "openai", apiKey: readUserKey(userId, "openai")!, baseUrl: process.env.OPA_OPENAI_BASE_URL };
  return null;
}

// Free tier: planner turns/day for users without their own key. The fast
// (batch) lane always runs on the platform model — it is cheap by design.
export const FREE_PLANNER_TURNS_PER_DAY = Number(process.env.OPA_FREE_PLANNER_TURNS || 25);
export async function freeTierRemaining(userId: string): Promise<number | null> {
  if (resolveLlmAuth(userId)) return null; // BYOK: unlimited (their key, their bill)
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !process.env.OPA_OPENAI_API_KEY) return null; // no platform key at all
  const u = await storeFor(userId).usageToday("realtime");
  return Math.max(0, FREE_PLANNER_TURNS_PER_DAY - u.turns);
}
