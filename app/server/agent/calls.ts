import { updateCall, updateCallByRef, getCallByRef } from "./db";
import WebSocket from "ws";

// Voice call lane — the agent can place real outbound calls (the "agent-owned
// phone number" pillar: the same Twilio number that handles SMS places calls).
//
// Provider seam (same shape as flights.ts / email.ts):
//   simulated (default) — records the call and completes it with a scripted
//     transcript. The full pipeline (policy -> approval -> tool -> call row
//     -> outcome) runs with zero credentials; nothing dials out.
//   twilio — TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER +
//     PUBLIC_BASE_URL. Places a real call; Twilio fetches TwiML from
//     POST /api/channels/voice, status callbacks hit /api/channels/voice/status.
//     The spoken conversation runs over a Twilio Media Stream bridged to a
//     realtime voice model (OPA_REALTIME_API_KEY/OPENAI_API_KEY). Without a
//     realtime key the TwiML delivers a one-way disclosed announcement.
//
// Compliance (policy requirements: ai_disclosure, recording_consent_check):
// every call opens with a spoken AI disclosure, and we keep a transcript —
// never an audio recording.

export interface CallTranscriptLine { speaker: "agent" | "callee"; text: string; at: number }

export interface CallProvider {
  name: string;
  /** Place the call. Returns the provider's call reference (or null). */
  start(userId: string, callId: number, to: string, purpose: string): Promise<{ providerRef: string | null }>;
  /** Hang up a live call (provider implementations that can). */
  end?(providerRef: string): Promise<void>;
}

const E164 = /^\+[1-9]\d{7,14}$/;
export function normalizePhone(raw: string): string {
  const s = String(raw ?? "").replace(/[\s()-]/g, "");
  if (!E164.test(s)) throw new Error(`Invalid phone number "${raw}" — use E.164 (+14155550123)`);
  return s;
}

/** The line every call opens with. Required by the risk policy. */
export function aiDisclosure(userLabel: string): string {
  return `Hi — this is an automated assistant calling on behalf of ${userLabel}. I'm an AI, not a person.`;
}

// ---------- simulated ----------
// Default: completes instantly (deterministic for evals). With
// OPA_SIMULATED_CALL_REALTIME=1 the call runs a paced lifecycle —
// ringing -> in_progress -> transcript lines appearing one by one ->
// completed — so demos and dev show the real-time flow the Twilio path has.
function simulatedRealtime(): boolean {
  return process.env.OPA_SIMULATED_CALL_REALTIME === "1";
}
const simulatedProvider: CallProvider = {
  name: "simulated",
  async start(userId, callId, to, purpose) {
    const lines: CallTranscriptLine[] = [
      { speaker: "agent", text: aiDisclosure("the account owner"), at: Date.now() },
      { speaker: "agent", text: `I'm calling about: ${purpose}`, at: Date.now() },
      { speaker: "callee", text: "(simulated line — set TWILIO_* env vars for a real call)", at: Date.now() },
    ];
    if (!simulatedRealtime()) {
      await updateCall(callId, { status: "completed", providerRef: `sim_${callId}`, transcript: lines, outcome: "simulated — no audio dialled", endedAt: Date.now() });
      return { providerRef: `sim_${callId}` };
    }
    const transcript: CallTranscriptLine[] = [];
    const step = (ms: number, fn: () => Promise<void>) => setTimeout(() => { void fn(); }, ms).unref?.();
    void updateCall(callId, { status: "queued", providerRef: `sim_${callId}` });
    step(1500, () => updateCall(callId, { status: "ringing" }));
    step(3500, () => updateCall(callId, { status: "in_progress" }));
    lines.forEach((l, i) => step(4500 + i * 3000, async () => {
      transcript.push({ ...l, at: Date.now() });
      await updateCall(callId, { transcript: [...transcript] });
    }));
    step(4500 + lines.length * 3000, () => updateCall(callId, { status: "completed", outcome: "simulated — no audio dialled", endedAt: Date.now() }));
    return { providerRef: `sim_${callId}` };
  },
};

// ---------- Twilio ----------
const TWILIO_API = "https://api.twilio.com/2010-04-01";
export function twilioConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER && process.env.PUBLIC_BASE_URL);
}
async function twilioReq(path: string, body: Record<string, string>) {
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const resp = await fetch(`${TWILIO_API}/Accounts/${process.env.TWILIO_ACCOUNT_SID}${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Twilio ${resp.status}: ${data.message ?? "request failed"}`);
  return data;
}

const twilioProvider: CallProvider = {
  name: "twilio",
  async start(_userId, callId, to, _purpose) {
    const base = process.env.PUBLIC_BASE_URL!.replace(/\/$/, "");
    const data = await twilioReq("/Calls.json", {
      To: to,
      From: process.env.TWILIO_FROM_NUMBER!,
      Url: `${base}/api/channels/voice?callId=${callId}`,
      StatusCallback: `${base}/api/channels/voice/status`,
      StatusCallbackEvent: "initiated ringing answered completed",
      StatusCallbackMethod: "POST",
    });
    await updateCall(callId, { status: "queued", providerRef: data.sid });
    return { providerRef: data.sid };
  },
  async end(providerRef) {
    await twilioReq(`/Calls/${providerRef}.json`, { Status: "completed" });
  },
};

export function callProvider(): CallProvider {
  return twilioConfigured() ? twilioProvider : simulatedProvider;
}

// ---------- Twilio webhook helpers ----------
// TwiML served when the callee answers. The AI disclosure is spoken first,
// before any conversation — the policy's ai_disclosure requirement.
export function twimlForCall(opts: { callId: number; purpose: string; userLabel: string; baseUrl: string; realtime: boolean }): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const disclosure = esc(aiDisclosure(opts.userLabel));
  if (!opts.realtime) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${disclosure}</Say><Say>${esc(`A quick message: ${opts.purpose}. The user will follow up directly if needed. Goodbye.`)}</Say><Hangup/></Response>`;
  }
  const ws = opts.baseUrl.replace(/^http/, "ws").replace(/\/$/, "") + "/api/channels/voice/stream";
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${disclosure}</Say><Connect><Stream url="${ws}"><Parameter name="callId" value="${opts.callId}"/></Stream></Connect></Response>`;
}

/** Status callback → call row update. */
export async function applyCallStatus(providerRef: string, status: string) {
  const map: Record<string, string> = { initiated: "queued", ringing: "ringing", "in-progress": "in_progress", answered: "in_progress", completed: "completed", busy: "failed", "no-answer": "failed", failed: "failed", canceled: "cancelled" };
  const mapped = map[status] ?? status;
  const patch: Record<string, unknown> = { status: mapped };
  if (mapped === "completed" || mapped === "failed" || mapped === "cancelled") patch.endedAt = Date.now();
  return updateCallByRef(providerRef, patch);
}

// ---------- realtime voice bridge config ----------
export function realtimeConfigured(): boolean {
  return !!(process.env.OPA_REALTIME_API_KEY || process.env.OPENAI_API_KEY);
}
export function realtimeConfig() {
  return {
    apiKey: process.env.OPA_REALTIME_API_KEY || process.env.OPENAI_API_KEY,
    url: process.env.OPA_REALTIME_URL || "wss://api.openai.com/v1/realtime",
    model: process.env.OPA_REALTIME_MODEL || "gpt-4o-realtime-preview",
  };
}

// ---------- Twilio Media Stream <-> realtime voice model bridge ----------
// Twilio delivers 8kHz mulaw audio as base64 frames on this socket; the
// realtime API accepts g711_ulaw directly, so frames pass through untouched.
// We keep a transcript (speakers labelled) — never an audio recording.
export async function bridgeCallStream(twilioWs: WebSocket) {
  let streamSid = "";
  let callId = 0;
  const transcript: CallTranscriptLine[] = [];
  let realtime: WebSocket | null = null;

  const closeAll = () => {
    try { realtime?.close(); } catch { /* already closed */ }
    try { twilioWs.close(); } catch { /* already closed */ }
  };

  twilioWs.on("message", async (raw) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    switch (msg.event) {
      case "start": {
        streamSid = msg.start?.streamSid ?? "";
        callId = Number(msg.start?.customParameters?.callId ?? 0);
        const callRow = callId ? await getCallForBridge(callId) : undefined;
        if (!callRow || !realtimeConfigured()) { closeAll(); return; }
        const cfg = realtimeConfig();
        realtime = new WebSocket(`${cfg.url}?model=${cfg.model}`, {
          headers: { Authorization: `Bearer ${cfg.apiKey}`, "OpenAI-Beta": "realtime=v1" },
        });
        realtime.on("open", () => {
          realtime!.send(JSON.stringify({
            type: "session.update",
            session: {
              modalities: ["text", "audio"],
              voice: "alloy",
              input_audio_format: "g711_ulaw",
              output_audio_format: "g711_ulaw",
              input_audio_transcription: { model: "whisper-1" },
              turn_detection: { type: "server_vad" },
              instructions:
                `You are an AI assistant on a live phone call, acting for the person who asked for this call. ` +
                `An AI disclosure was already spoken. Your task: ${callRow.purpose}. ` +
                `Be concise (one or two sentences per turn), get the task done, confirm any concrete outcome ` +
                `(times, names, amounts) back to the caller before ending, then say goodbye. Never claim to be human.`,
            },
          }));
          realtime!.send(JSON.stringify({ type: "response.create" }));
        });
        realtime.on("message", (data) => {
          let evt: any;
          try { evt = JSON.parse(data.toString()); } catch { return; }
          if (evt.type === "response.audio.delta" && streamSid) {
            twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload: evt.delta } }));
          } else if (evt.type === "response.audio_transcript.done") {
            transcript.push({ speaker: "agent", text: evt.transcript, at: Date.now() });
          } else if (evt.type === "conversation.item.input_audio_transcription.completed") {
            transcript.push({ speaker: "callee", text: evt.transcript, at: Date.now() });
          }
        });
        realtime.on("close", closeAll);
        realtime.on("error", closeAll);
        break;
      }
      case "media":
        realtime?.send(JSON.stringify({ type: "input_audio_buffer.append", audio: msg.media?.payload }));
        break;
      case "stop":
        if (callId) {
          await updateCall(callId, { status: "completed", transcript: transcript.length ? transcript : null, outcome: transcript.length ? "conversation completed" : "ended before conversation", endedAt: Date.now() });
        }
        closeAll();
        break;
    }
  });
  twilioWs.on("close", () => {
    if (callId) void updateCall(callId, { status: "completed", transcript: transcript.length ? transcript : null, endedAt: Date.now() });
    try { realtime?.close(); } catch { /* already closed */ }
  });
  twilioWs.on("error", closeAll);
}

async function getCallForBridge(callId: number) {
  const { getCallById } = await import("./db");
  return getCallById(callId);
}
