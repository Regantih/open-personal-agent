// Orchestration seam. Every unit of agent work (a user turn, an approval
// decision, the background check) goes through an Orchestrator. Two backends:
//
//   inline   - default. Runs the function in-process, as before.
//   temporal - durable execution via a Temporal server. Set OPA_ORCHESTRATOR=temporal
//              and TEMPORAL_ADDRESS (default localhost:7233), install the SDK:
//                npm i @temporalio/client @temporalio/worker @temporalio/workflow @temporalio/activity
//              The worker runs in-process (see server/temporal/worker.ts); workflows
//              wrap each task type so retries, timeouts and history are durable.
//              The SDK is loaded dynamically so a normal install never pays for it.
//
// Task granularity is deliberately coarse — one durable workflow per user-visible
// task — matching how a production deployment would bound retry units.

import { fileURLToPath } from "node:url";
import * as db from "./db";
import { handleInbound, decideApproval, runBackground } from "./agent";

export interface TaskRun {
  kind: "turn" | "approval" | "background";
  args: unknown[];
}

export interface Orchestrator {
  name: string;
  init(): Promise<void>;
  runTurn(text: string, channel: string): Promise<string>;
  runApproval(id: number, decision: "approve" | "deny", allowCategory: boolean, via: string): Promise<{ ok: boolean; message: string }>;
  runBackground(): Promise<string>;
}

const inline: Orchestrator = {
  name: "inline",
  async init() {},
  runTurn: (text, channel) => handleInbound(text, channel as any),
  runApproval: (id, decision, allowCategory, via) => decideApproval(id, decision, allowCategory, via),
  runBackground: () => runBackground(),
};

const temporal: Orchestrator = {
  name: "temporal",
  async init() {
    // Dynamic specifiers keep tsc/esbuild from requiring the optional SDK.
    const clientPkg = "@temporalio/client";
    const workerPkg = "@temporalio/worker";
    const { Connection, Client } = (await import(/* @vite-ignore */ clientPkg)) as any;
    const { Worker, NativeConnection } = (await import(/* @vite-ignore */ workerPkg)) as any;

    const address = process.env.TEMPORAL_ADDRESS || "localhost:7233";
    const namespace = process.env.TEMPORAL_NAMESPACE || "default";
    const taskQueue = process.env.TEMPORAL_TASK_QUEUE || "opa-agent";

    const connection = await Connection.connect({ address });
    this.client = new Client({ connection, namespace });

    // Run the worker in the same process; point workers at a separate deploy for production.
    // Computed specifier: the file only exists/typechecks when the SDK is installed.
    const activitiesModule = "../temporal/activities";
    const worker = await Worker.create({
      connection: await NativeConnection.connect({ address }),
      workflowsPath: fileURLToPath(new URL("../temporal/workflows.ts", import.meta.url)),
      activities: await import(/* @vite-ignore */ activitiesModule),
      taskQueue,
      namespace,
    });
    void worker.run().catch((e: any) => db.logEvent("error", `Temporal worker exited: ${e.message}`, null));
    this.taskQueue = taskQueue;
    db.logEvent("policy", `Orchestrator: temporal (server ${address}, namespace ${namespace}, queue ${taskQueue})`, null);
  },
  client: null,
  taskQueue: "opa-agent",
  async startWorkflow(this: any, name: string, args: unknown[]) {
    const handle = await this.client.workflow.start(name, {
      taskQueue: this.taskQueue,
      workflowId: `opa-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      args,
      // Idempotent retries with backoff are Temporal defaults; cap the task at 5 minutes.
      workflowExecutionTimeout: "5m",
    });
    return handle.result();
  },
  runTurn(this: any, text: string, channel: string) {
    return this.startWorkflow("agentTurnWorkflow", [text, channel]);
  },
  runApproval(this: any, id: number, decision: string, allowCategory: boolean, via: string) {
    return this.startWorkflow("approvalDecisionWorkflow", [id, decision, allowCategory, via]);
  },
  runBackground(this: any) {
    return this.startWorkflow("backgroundCheckWorkflow", []);
  },
} as Orchestrator & Record<string, any>;

let picked: Orchestrator | null = null;
export async function orchestrator(): Promise<Orchestrator> {
  if (!picked) {
    picked = (process.env.OPA_ORCHESTRATOR || "inline").toLowerCase() === "temporal" ? temporal : inline;
    try {
      await picked.init();
    } catch (e: any) {
      db.logEvent("error", `Temporal init failed (${e.message}); falling back to inline orchestrator`, null);
      picked = inline;
    }
  }
  return picked;
}
export function orchestratorName(): string {
  return (process.env.OPA_ORCHESTRATOR || "inline").toLowerCase() === "temporal" ? "temporal" : "inline";
}
