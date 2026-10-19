import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { storeFor, getUserKeyEnc, putUserKey, deleteUserKey, listUserKeyProviders, PLATFORM, type EncBlob } from "./db";

// Bring-your-own-key vault. User-provided model/provider keys are encrypted at
// rest with AES-256-GCM under a master key. The master key comes from
// MASTER_KEY (recommended) or is generated once and stored in the platform
// settings row — acceptable for the reference app, document a real KMS for
// production. Plaintext keys are never stored, returned, or logged.

let cachedMaster: Buffer | null = null;
export async function masterKey(): Promise<Buffer> {
  if (cachedMaster) return cachedMaster;
  if (process.env.MASTER_KEY) { cachedMaster = createHash("sha256").update(process.env.MASTER_KEY).digest(); return cachedMaster; }
  const existing = await storeFor(PLATFORM).getSetting<string | null>("master_key", null);
  if (existing) { cachedMaster = Buffer.from(existing, "hex").subarray(0, 32); return cachedMaster; }
  const gen = randomBytes(32).toString("hex");
  await storeFor(PLATFORM).setSetting("master_key", gen);
  cachedMaster = Buffer.from(gen, "hex").subarray(0, 32);
  return cachedMaster;
}

export async function encryptSecret(plaintext: string): Promise<EncBlob> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export async function decryptSecret(enc: EncBlob): Promise<string> {
  const decipher = createDecipheriv("aes-256-gcm", await masterKey(), Buffer.from(enc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(enc.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(enc.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

// ---------- user key management ----------
export async function saveUserKey(userId: string, provider: string, plaintext: string) {
  await putUserKey(userId, provider, await encryptSecret(plaintext));
}
export async function readUserKey(userId: string, provider: string): Promise<string | null> {
  const enc = await getUserKeyEnc(userId, provider);
  return enc ? decryptSecret(enc) : null;
}
export { deleteUserKey, listUserKeyProviders };

// Which model credentials a turn should use. A user's stored key wins; the
// platform env config is the fallback (subject to free-tier caps upstream).
export interface LlmAuth { provider: "anthropic" | "openai"; apiKey?: string; baseUrl?: string }
export async function resolveLlmAuth(userId: string): Promise<LlmAuth | null> {
  const envProvider = (process.env.OPA_LLM_PROVIDER || "anthropic").toLowerCase() === "openai" ? "openai" : "anthropic";
  const key = await readUserKey(userId, envProvider);
  if (key) return { provider: envProvider, apiKey: key, baseUrl: envProvider === "openai" ? process.env.OPA_OPENAI_BASE_URL : undefined };
  const anyProvider = (await listUserKeyProviders(userId))[0];
  if (anyProvider === "anthropic") return { provider: "anthropic", apiKey: (await readUserKey(userId, "anthropic"))! };
  if (anyProvider === "openai") return { provider: "openai", apiKey: (await readUserKey(userId, "openai"))!, baseUrl: process.env.OPA_OPENAI_BASE_URL };
  return null;
}

// Free tier: planner turns/day for users without their own key. The fast
// (batch) lane always runs on the platform model — it is cheap by design.
export const FREE_PLANNER_TURNS_PER_DAY = Number(process.env.OPA_FREE_PLANNER_TURNS || 25);
export async function freeTierRemaining(userId: string): Promise<number | null> {
  if (await resolveLlmAuth(userId)) return null; // BYOK: unlimited (their key, their bill)
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !process.env.OPA_OPENAI_API_KEY) return null; // no platform key at all
  const n = await storeFor(userId).userMessagesToday();
  return Math.max(0, FREE_PLANNER_TURNS_PER_DAY - n);
}

// Gate check for the realtime lane. The inbound message is already stored when
// this runs, so block only when today exceeds the allowance — the 25th message
// still gets a reply.
export async function freeTierExceeded(userId: string): Promise<boolean> {
  if (await resolveLlmAuth(userId)) return false;
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !process.env.OPA_OPENAI_API_KEY) return false;
  return (await storeFor(userId).userMessagesToday()) > FREE_PLANNER_TURNS_PER_DAY;
}
