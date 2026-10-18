import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Approval, Mandate } from "@shared/schema";
import { mandateSecret } from "./db";

// AP2-inspired mandates: an approval is bound to an exact action, amount, merchant and parameter hash, signed server-side.
// This is not an AP2 implementation; it demonstrates the same idea (verifiable user intent) with an HMAC.

function canonical(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
  return "{" + Object.keys(obj as object).sort().map((k) => JSON.stringify(k) + ":" + canonical((obj as any)[k])).join(",") + "}";
}
export const paramsHash = (p: unknown) => createHash("sha256").update(canonical(p)).digest("hex");

export function signMandate(a: Approval, ttlMs: number): Mandate {
  const body = {
    version: "opa-mandate-0.1" as const,
    approval_id: a.id,
    action: a.action,
    amount_usd: a.amountUsd,
    merchant: a.merchant,
    params_sha256: paramsHash(a.params),
    issued_at: Date.now(),
    expires_at: Date.now() + ttlMs,
  };
  const signature = createHmac("sha256", mandateSecret()).update(canonical(body)).digest("hex");
  return { ...body, signature };
}

export function verifyMandate(m: Mandate, a: Approval): { ok: boolean; reason?: string } {
  const { signature, ...body } = m;
  const expected = createHmac("sha256", mandateSecret()).update(canonical(body)).digest("hex");
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return { ok: false, reason: "signature mismatch" };
  if (Date.now() > m.expires_at) return { ok: false, reason: "mandate expired" };
  if (m.approval_id !== a.id || m.action !== a.action) return { ok: false, reason: "mandate bound to a different action" };
  if (m.amount_usd !== a.amountUsd || m.merchant !== a.merchant) return { ok: false, reason: "amount or merchant changed after approval" };
  if (m.params_sha256 !== paramsHash(a.params)) return { ok: false, reason: "parameters changed after approval" };
  return { ok: true };
}

// Simulated single-use virtual card scoped to one merchant and amount. The model only ever sees the reference and last four digits.
export function issueSingleUseCard(merchant: string, amountUsd: number) {
  const last4 = String(Math.floor(1000 + Math.random() * 9000));
  return { ref: "vault://card/" + randomBytes(6).toString("hex"), last4, merchant, capUsd: amountUsd };
}
