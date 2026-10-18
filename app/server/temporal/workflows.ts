// Temporal workflow definitions. One durable workflow per user-visible task.
// Loaded only when OPA_ORCHESTRATOR=temporal (see server/agent/orchestrator.ts).
// Workflow code must stay deterministic and free of I/O — all real work lives
// in activities, which Temporal retries and records.
import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "./activities";

const { handleInboundActivity, decideApprovalActivity, runBackgroundActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2m",
  retry: { maximumAttempts: 3 },
});

export async function agentTurnWorkflow(text: string, channel: string): Promise<string> {
  return handleInboundActivity(text, channel);
}

export async function approvalDecisionWorkflow(
  id: number,
  decision: "approve" | "deny",
  allowCategory: boolean,
  via: string,
): Promise<{ ok: boolean; message: string }> {
  return decideApprovalActivity(id, decision, allowCategory, via);
}

export async function backgroundCheckWorkflow(): Promise<string> {
  return runBackgroundActivity();
}
