// Temporal activities: thin wrappers over the real agent functions.
// Loaded only when OPA_ORCHESTRATOR=temporal and the @temporalio SDK is installed.
// See server/agent/orchestrator.ts for setup instructions.
import { handleInbound, decideApproval, runBackground } from "../agent/agent";

export async function handleInboundActivity(text: string, channel: string): Promise<string> {
  return handleInbound(text, channel as "web" | "sms" | "email");
}

export async function decideApprovalActivity(
  id: number,
  decision: "approve" | "deny",
  allowCategory: boolean,
  via: string,
): Promise<{ ok: boolean; message: string }> {
  return decideApproval(id, decision, allowCategory, via);
}

export async function runBackgroundActivity(): Promise<string> {
  return runBackground();
}
