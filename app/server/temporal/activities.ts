// Temporal activities: thin wrappers over the real agent functions.
// Loaded only when OPA_ORCHESTRATOR=temporal and the @temporalio SDK is installed.
// See server/agent/orchestrator.ts for setup instructions.
import { handleInbound, decideApproval, runBackground, ctxFor } from "../agent/agent";

export async function handleInboundActivity(userId: string, text: string, channel: string): Promise<string> {
  return handleInbound(ctxFor(userId), text, channel as "web" | "sms" | "email");
}

export async function decideApprovalActivity(
  userId: string,
  id: number,
  decision: "approve" | "deny",
  allowCategory: boolean,
  via: string,
): Promise<{ ok: boolean; message: string }> {
  return decideApproval(ctxFor(userId), id, decision, allowCategory, via);
}

export async function runBackgroundActivity(userId: string): Promise<string> {
  return runBackground(ctxFor(userId));
}
