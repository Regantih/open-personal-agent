import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Approval, Mandate } from "@shared/schema";

// Mandates follow the shape of Google's Agent Payments Protocol (AP2): an
// intent mandate captures what the user agreed to in natural language, and a
// payment mandate binds the exact amount, currency and merchant. The whole
// envelope is signed with HMAC-SHA256 (AP2 itself uses asymmetric signatures;
// a single-user server signs and verifies its own mandates, so HMAC suffices).
// Verification accepts both v0.1 and v0.2 envelopes — the signature covers the
// entire body either way.

function canonical(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
  return "{" + Object.keys(obj as object).sort().map((k) => JSON.stringify(k) + ":" + canonical((obj as any)[k])).join(",") + "}";
}
export const paramsHash = (p: unknown) => createHash("sha256").update(canonical(p)).digest("hex");

// The HMAC key is per user (store.mandateSecret()) so one user's mandates can
// never verify under another user's key.
export function signMandate(a: Approval, ttlMs: number, secret: string): Mandate {
  const now = Date.now();
  const body = {
    version: "opa-mandate-0.2" as const,
    approval_id: a.id,
    action: a.action,
    amount_usd: a.amountUsd,
    merchant: a.merchant,
    params_sha256: paramsHash(a.params),
    issued_at: now,
    expires_at: now + ttlMs,
    ap2: {
      intent_mandate: {
        natural_language_description: a.summary,
        user_cart_confirmation_required: true,
        merchants: a.merchant ? [a.merchant] : null,
        requires_refundability: a.refundable === true,
        intent_expiry: new Date(now + ttlMs).toISOString(),
      },
      payment_mandate:
        a.amountUsd != null
          ? {
              payment_details_total: {
                label: a.summary,
                amount: { currency: "USD", value: a.amountUsd },
                refund_period: a.refundable ? "merchant_policy" : "non_refundable",
              },
              payment_method: "single_use_card",
              merchant_agent: a.merchant,
              risk_data: { action: a.action, params_sha256: paramsHash(a.params) },
            }
          : null,
    },
  };
  const signature = createHmac("sha256", secret).update(canonical(body)).digest("hex");
  return { ...body, signature };
}

export function verifyMandate(m: Mandate, a: Approval, secret: string): { ok: boolean; reason?: string } {
  const { signature, ...body } = m;
  const expected = createHmac("sha256", secret).update(canonical(body)).digest("hex");
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
