import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { Tier } from "@shared/schema";
import type { Store } from "./db";

// Loads the shared Risk Policy spec (../spec/risk-policy/policy.example.yaml) and evaluates actions against it.

interface PolicyFile {
  version: string;
  default_tier?: Tier;
  tiers: Record<Tier, { name: string; rule: string; confirmation?: { expires_after_seconds?: number } }>;
  actions: { match: string; tier: Tier; requirements?: string[] }[];
  untrusted_origin?: { sources: string[]; escalate_by: number };
  limits?: { default_standing_limit_usd?: number; max_daily_spend_usd?: number; max_outbound_calls_per_hour?: number };
  kill_switch?: { phrases: string[]; actions: string[] };
}

function resolvePolicyPath(): string {
  const candidates = [
    process.env.POLICY_PATH,
    path.resolve(process.cwd(), "../spec/risk-policy/policy.example.yaml"),
    path.resolve(process.cwd(), "spec/risk-policy/policy.example.yaml"),
    path.resolve(process.cwd(), "policy.yaml"),
  ].filter(Boolean) as string[];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("Risk policy file not found. Set POLICY_PATH.");
  return found;
}

export const policyPath = resolvePolicyPath();
export const policy: PolicyFile = YAML.parse(readFileSync(policyPath, "utf8"));

const TIERS: Tier[] = ["T0", "T1", "T2", "T3"];

export function matchTier(action: string): { tier: Tier; rule: string | null; requirements: string[] } {
  let best: { tier: Tier; score: number; match: string; requirements: string[] } | null = null;
  for (const a of policy.actions) {
    let score = -1;
    if (a.match === action) score = 10000;
    else if (a.match.endsWith("*") && action.startsWith(a.match.slice(0, -1))) score = a.match.length;
    if (score >= 0 && (!best || score > best.score)) best = { tier: a.tier, score, match: a.match, requirements: a.requirements || [] };
  }
  if (!best) return { tier: policy.default_tier || "T3", rule: null, requirements: [] };
  return { tier: best.tier, rule: best.match, requirements: best.requirements };
}

export function escalate(t: Tier, by: number): Tier {
  return TIERS[Math.min(TIERS.length - 1, TIERS.indexOf(t) + by)];
}

export const limits = {
  maxDailySpendUsd: policy.limits?.max_daily_spend_usd ?? 500,
  defaultStandingLimitUsd: policy.limits?.default_standing_limit_usd ?? 0,
};
export const confirmationTtlMs = (policy.tiers.T3?.confirmation?.expires_after_seconds ?? 600) * 1000;
export const killPhrases = (policy.kill_switch?.phrases ?? ["stop everything"]).map((p) => p.toLowerCase());

export type Decision =
  | { outcome: "allow"; tier: Tier; baseTier: Tier; escalated: boolean; reason: string; matched: string | null }
  | { outcome: "needs_approval"; tier: Tier; baseTier: Tier; escalated: boolean; reason: string; matched: string | null }
  | { outcome: "block"; tier: Tier; baseTier: Tier; escalated: boolean; reason: string; matched: string | null };

export async function evaluate(action: string, ctx: { tainted: boolean; amountUsd?: number | null; store: Store }): Promise<Decision> {
  const { tier: baseTier, rule: matched } = matchTier(action);
  const escalated = ctx.tainted && !!policy.untrusted_origin;
  const tier = escalated ? escalate(baseTier, policy.untrusted_origin!.escalate_by) : baseTier;
  const paused = await ctx.store.getSetting<boolean>("paused", false);
  const base = { tier, baseTier, escalated, matched };

  if (paused && tier !== "T0") return { outcome: "block", ...base, reason: "Agent is paused by the kill switch. Only read actions are allowed until the user resumes." };
  if (tier === "T0") return { outcome: "allow", ...base, reason: "T0 read within granted scope" };
  if (tier === "T1") return { outcome: "allow", ...base, reason: "T1 reversible write; reported in activity log" };
  if (tier === "T2") {
    const optIns = await ctx.store.getSetting<string[]>("opt_ins", []);
    if (!escalated && optIns.includes(action)) return { outcome: "allow", ...base, reason: `T2 allowed: user opted in to category "${action}"` };
    return { outcome: "needs_approval", ...base, reason: escalated ? "Escalated to T2 because untrusted content is in context" : `T2 requires category opt-in for "${action}"` };
  }
  // T3
  const standing = await ctx.store.getSetting<number>("standing_limit_usd", limits.defaultStandingLimitUsd);
  if (!escalated && ctx.amountUsd != null && ctx.amountUsd > 0 && ctx.amountUsd <= standing)
    return { outcome: "allow", ...base, reason: `T3 within standing limit of $${standing}` };
  return { outcome: "needs_approval", ...base, reason: escalated ? "Escalated because untrusted content (email or web) is in context; explicit confirmation required" : "T3 money or irreversible action requires explicit confirmation" };
}
