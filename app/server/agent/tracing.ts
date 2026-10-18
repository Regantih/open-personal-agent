import { randomUUID } from "node:crypto";

// Optional Langfuse tracing. Set LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY (and
// LANGFUSE_BASE_URL for self-hosted) and every agent turn, model call, tool run,
// and approval decision is mirrored to Langfuse via the public ingestion API.
// No SDK dependency: just a batched POST to /api/public/ingestion.
// When unconfigured this is a zero-cost no-op.

const baseUrl = () => (process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com").replace(/\/$/, "");
export const tracingEnabled = () => !!(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);

let warned = false;
async function ingest(events: Record<string, unknown>[]) {
  if (!tracingEnabled()) return;
  try {
    const auth = Buffer.from(`${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`).toString("base64");
    const resp = await fetch(`${baseUrl()}/api/public/ingestion`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({ batch: events.map((e) => ({ id: randomUUID(), timestamp: new Date().toISOString(), ...e })) }),
    });
    if (!resp.ok && !warned) { warned = true; console.warn(`[tracing] langfuse ingestion returned ${resp.status}`); }
  } catch (e: any) {
    if (!warned) { warned = true; console.warn(`[tracing] langfuse unreachable: ${e.message}`); }
  }
}

export interface Trace {
  id: string;
  generation(name: string, body: Record<string, unknown>): void;
  span(name: string, body: Record<string, unknown>): void;
  end(body: Record<string, unknown>): void;
}

export function startTrace(name: string, metadata: Record<string, unknown> = {}): Trace | null {
  if (!tracingEnabled()) return null;
  const id = randomUUID();
  void ingest([{ type: "trace-create", body: { id, name, metadata } }]);
  return {
    id,
    generation(gName, body) {
      void ingest([{ type: "generation-create", body: { id: randomUUID(), traceId: id, name: gName, ...body } }]);
    },
    span(sName, body) {
      void ingest([{ type: "span-create", body: { id: randomUUID(), traceId: id, name: sName, ...body } }]);
    },
    end(body) {
      void ingest([{ type: "trace-create", body: { id, name, ...body } }]);
    },
  };
}
