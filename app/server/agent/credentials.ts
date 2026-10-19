import { getCredentialEnc, putCredential, deleteCredential, listCredentials, type CredentialMeta } from "./db";
import { encryptSecret, decryptSecret } from "./keys";
import * as browser from "./browser";

// Website credential vault. The user saves logins through the authenticated
// /api/credentials endpoint (never through chat — secrets must not pass
// through tool params, which are persisted on approval rows). Passwords are
// AES-256-GCM encrypted under the master key and leave the vault in exactly
// one way: decrypted in-memory and typed into the agent's own browser page
// by browserLogin. The model sees site + username only, never the secret.

const SITE_RE = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i;
export function normalizeSite(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!SITE_RE.test(s)) throw new Error(`Invalid site "${raw}" — expected a hostname like github.com`);
  return s;
}

export async function saveCredential(userId: string, rawSite: string, username: string, password: string): Promise<CredentialMeta> {
  const site = normalizeSite(rawSite);
  const u = username.trim();
  if (!u || u.length > 200) throw new Error("username required (max 200 chars)");
  if (!password || password.length > 500) throw new Error("password required (max 500 chars)");
  await putCredential(userId, site, u, await encryptSecret(password));
  return { site, username: u, createdAt: Date.now() };
}

export { listCredentials, deleteCredential };

/** Has a login saved for this site? Used by tool prepare() for early validation. */
export async function hasCredential(userId: string, site: string): Promise<boolean> {
  try { return !!(await getCredentialEnc(userId, normalizeSite(site))); } catch { return false; }
}

// Decrypt → fill into the live browser page. The plaintext exists only inside
// this call; fillLogin writes it to the page and it is never returned.
export async function browserLogin(userId: string, site: string, submit: boolean) {
  const norm = normalizeSite(site);
  const enc = await getCredentialEnc(userId, norm);
  if (!enc) throw new Error(`No saved login for ${norm} — the user can add one in Settings`);
  const password = await decryptSecret(enc);
  return browser.fillLogin(userId, { site: norm, username: enc.username, password, submit });
}
