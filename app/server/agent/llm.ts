import Anthropic from "@anthropic-ai/sdk";

// Model router abstraction. The agent loop works in a canonical message format
// (Anthropic content blocks); each provider converts to and from its own API.
//
// Providers:
//   anthropic  - default. Anthropic Messages API via ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL.
//   openai     - any OpenAI-compatible /chat/completions endpoint: vLLM, Ollama,
//                Together, Groq, a local proxy. Set OPA_OPENAI_BASE_URL (for vLLM
//                typically http://localhost:8000/v1) and OPA_OPENAI_API_KEY if needed.
//   scripted   - eval/testing hook. See setScriptedModel() below; not for production.
//
// Select with OPA_LLM_PROVIDER. Model ids still come from OPA_PLANNER_MODEL / OPA_FAST_MODEL.

export interface ModelToolSchema { name: string; description: string; input_schema: unknown }
export interface ModelToolCall { id: string; name: string; input: any }
export interface ModelOutput {
  text: string;
  toolCalls: ModelToolCall[];
  stopReason: string | null;
  inputTokens?: number;
  outputTokens?: number;
  // Canonical assistant content (Anthropic-style blocks) to append to the running history.
  assistantBlocks: unknown[];
}
export interface CanonicalMessage { role: "user" | "assistant"; content: unknown }
export interface ModelRequest {
  model: string;
  system: string;
  tools: ModelToolSchema[];
  messages: CanonicalMessage[];
  maxTokens: number;
}
export interface ModelProvider {
  name: string;
  complete(req: ModelRequest): Promise<ModelOutput>;
}

// ---------- anthropic ----------
let anthropicClient: Anthropic | null = null;
const anthropicProvider: ModelProvider = {
  name: "anthropic",
  async complete(req) {
    if (!anthropicClient) anthropicClient = new Anthropic();
    const resp = await anthropicClient.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      tools: req.tools as Anthropic.Tool[],
      messages: req.messages as Anthropic.MessageParam[],
    });
    return {
      text: resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim(),
      toolCalls: resp.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, input: b.input })),
      stopReason: resp.stop_reason,
      inputTokens: resp.usage?.input_tokens,
      outputTokens: resp.usage?.output_tokens,
      assistantBlocks: resp.content,
    };
  },
};

// ---------- openai-compatible (vLLM, Ollama, Groq, Together, ...) ----------
interface OaiMessage { role: string; content?: string | null; tool_calls?: any[]; tool_call_id?: string }

function toOpenAIMessages(system: string, messages: CanonicalMessage[]): OaiMessage[] {
  const out: OaiMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const blocks = (m.content as any[]) ?? [];
    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n") || null;
      const tool_calls = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      out.push({ role: "assistant", content: text, ...(tool_calls.length ? { tool_calls } : {}) });
    } else {
      for (const b of blocks) {
        if (b.type === "tool_result") out.push({ role: "tool", tool_call_id: b.tool_use_id, content: typeof b.content === "string" ? b.content : JSON.stringify(b.content) });
        else if (b.type === "text") out.push({ role: "user", content: b.text });
      }
    }
  }
  return out;
}

const openaiProvider: ModelProvider = {
  name: "openai-compatible",
  async complete(req) {
    const base = (process.env.OPA_OPENAI_BASE_URL || "http://localhost:8000/v1").replace(/\/$/, "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.OPA_OPENAI_API_KEY) headers.Authorization = `Bearer ${process.env.OPA_OPENAI_API_KEY}`;
    const resp = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens,
        messages: toOpenAIMessages(req.system, req.messages),
        ...(req.tools.length ? { tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })) } : {}),
      }),
    });
    if (!resp.ok) throw new Error(`Model endpoint ${base} returned ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const data: any = await resp.json();
    const msg = data.choices?.[0]?.message ?? {};
    const toolCalls: ModelToolCall[] = (msg.tool_calls ?? []).map((c: any) => {
      let input: any = {};
      try { input = JSON.parse(c.function?.arguments || "{}"); } catch { input = { _raw: c.function?.arguments }; }
      return { id: c.id, name: c.function?.name, input };
    });
    const assistantBlocks: unknown[] = [
      ...(msg.content ? [{ type: "text", text: msg.content }] : []),
      ...toolCalls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.input })),
    ];
    return {
      text: (msg.content ?? "").trim(),
      toolCalls,
      stopReason: data.choices?.[0]?.finish_reason ?? null,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
      assistantBlocks,
    };
  },
};

// ---------- scripted provider (eval harness hook) ----------
let scripted: ModelProvider | null = null;
let scriptedCall = 0;
export function setScriptedModel(handler: ((req: ModelRequest) => ModelOutput | Promise<ModelOutput>) | null) {
  scripted = handler
    ? { name: "scripted", complete: async (req) => handler(req) }
    : null;
}

export function providerName(): string {
  if (scripted) return "scripted";
  return (process.env.OPA_LLM_PROVIDER || "anthropic").toLowerCase() === "openai" ? "openai-compatible" : "anthropic";
}

export async function complete(req: ModelRequest): Promise<ModelOutput> {
  if (scripted) return scripted.complete(req);
  const p = (process.env.OPA_LLM_PROVIDER || "anthropic").toLowerCase();
  if (p === "openai" || p === "vllm" || p === "openai-compatible") return openaiProvider.complete(req);
  return anthropicProvider.complete(req);
}

// Helper for the scripted provider: build a ModelOutput the agent loop understands.
export function scriptOutput(step: { say: string } | { tool: string; input?: Record<string, unknown>; tools?: { tool: string; input?: Record<string, unknown> }[] }): ModelOutput {
  if ("say" in step) return { text: step.say, toolCalls: [], stopReason: "end_turn", assistantBlocks: [{ type: "text", text: step.say }] };
  const calls = step.tools ?? [{ tool: step.tool!, input: step.input ?? {} }];
  const toolCalls = calls.map((c) => ({ id: `call_${++scriptedCall}`, name: c.tool, input: c.input ?? {} }));
  return {
    text: "",
    toolCalls,
    stopReason: "tool_use",
    assistantBlocks: toolCalls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.input })),
  };
}
