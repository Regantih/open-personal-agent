import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient, API_BASE } from "@/lib/queryClient";
import type { ActionSuggestion, AgentEvent, Approval, Fact, Message, PanelWidget, Settings, StateSnapshot, Tier } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowUp, Bell, Brain, Check, CircleAlert, Cpu, Download, ExternalLink, KeyRound, Link2, Lock, MessageSquare, Mic, MicOff, OctagonX, Play, RotateCcw,
  ShieldCheck, Sparkles, Trash2, Upload, Volume2, Wrench, X, CalendarDays, Mail, CreditCard, Phone, Plane, Send, Radio,
} from "lucide-react";

const REPO_URL = "https://github.com/Regantih/open-personal-agent";

interface SessionInfo { userId: string | null; singleUser: boolean; email: string | null; phone: string | null }

const FALLBACK_SUGGESTIONS: ActionSuggestion[] = [
  { label: "Calendar this week", prompt: "What's on my calendar this week?" },
  { label: "Check my inbox", prompt: "Check my inbox and handle anything important" },
  { label: "Unused subscriptions", prompt: "Which subscriptions am I not using?" },
];

const tierLabel: Record<Tier, string> = { T0: "Read", T1: "Reversible", T2: "Acts as you", T3: "Money / irreversible" };

function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtDay(ms: number) {
  return new Date(ms).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function RichText({ text }: { text: string }) {
  // Minimal rendering: **bold** only. Everything else is plain text.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span className="bubble-text">
      {parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}
    </span>
  );
}

function TierChip({ tier, testId }: { tier: Tier; testId?: string }) {
  return (
    <span data-testid={testId} className={`tier-${tier} tier-chip inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium`}>
      {tier} <span className="opacity-80">{tierLabel[tier]}</span>
    </span>
  );
}

function useCountdown(expiresAt: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((expiresAt - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function ApprovalCard({ a, compact = false }: { a: Approval; compact?: boolean }) {
  const { toast } = useToast();
  const [allowCategory, setAllowCategory] = useState(false);
  const left = useCountdown(a.expiresAt);
  const decide = useMutation({
    mutationFn: async (decision: "approve" | "deny") => {
      const r = await apiRequest("POST", `/api/approvals/${a.id}`, { decision, allowCategory });
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/state"] }),
    onError: (e: Error) => toast({ title: "Could not complete", description: e.message.replace(/^\d+: /, ""), variant: "destructive" }),
  });
  return (
    <div data-testid={`card-approval-${a.id}`} className="rounded-lg border border-[hsl(36_70%_70%)] bg-[hsl(40_90%_97%)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <TierChip tier={a.tier} testId={`chip-tier-${a.id}`} />
        {a.escalated && (
          <span className="inline-flex items-center gap-1 text-xs text-[hsl(2_60%_38%)]" data-testid={`text-escalated-${a.id}`}>
            <CircleAlert className="h-3.5 w-3.5" /> Escalated from {a.baseTier}: untrusted content in context
          </span>
        )}
        <span className="ml-auto font-mono text-xs text-muted-foreground" data-testid={`text-expires-${a.id}`}>code {a.code} · {left}</span>
      </div>
      <p className="mt-2 text-sm font-medium leading-snug" data-testid={`text-approval-summary-${a.id}`}>{a.summary}</p>
      {!compact && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <dt>Action</dt><dd className="font-mono">{a.action}</dd>
          {a.amountUsd != null && (<><dt>Amount</dt><dd className="font-mono text-foreground">${a.amountUsd.toFixed(2)}</dd></>)}
          {a.merchant && (<><dt>Counterparty</dt><dd>{a.merchant}</dd></>)}
          {a.refundable != null && (<><dt>Refundable</dt><dd>{a.refundable ? "Yes" : "No"}</dd></>)}
          {a.amountUsd != null && (<><dt>Pays with</dt><dd>Single-use card capped at this amount</dd></>)}
        </dl>
      )}
      {a.tier === "T2" && !a.escalated && (
        <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={allowCategory} onCheckedChange={(v) => setAllowCategory(!!v)} data-testid={`checkbox-allow-category-${a.id}`} />
          Always allow <span className="font-mono">{a.action}</span> from now on
        </label>
      )}
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => decide.mutate("approve")} disabled={decide.isPending} data-testid={`button-approve-${a.id}`}>
          <Check className="mr-1 h-4 w-4" /> {decide.isPending ? "Signing…" : "Approve"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => decide.mutate("deny")} disabled={decide.isPending} data-testid={`button-deny-${a.id}`}>
          <X className="mr-1 h-4 w-4" /> Deny
        </Button>
      </div>
    </div>
  );
}

// Live reply stream: /api/events pushes assistant_delta chunks while a turn
// runs so the reply types out like a real stream instead of appearing whole.
const replyStream = { text: "", listeners: new Set<() => void>() };
const replyStreamNotify = () => replyStream.listeners.forEach((f) => f());
const subscribeStream = (cb: () => void) => { replyStream.listeners.add(cb); return () => { replyStream.listeners.delete(cb); }; };

function MessageBubble({ m }: { m: Message }) {
  const mine = m.role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`row-message-${m.id}`}>
      <div className={`max-w-[85%] sm:max-w-[75%] ${mine ? "" : ""}`}>
        {m.channel === "proactive" && (
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-primary"><Bell className="h-3.5 w-3.5" /> Proactive update · batch lane</div>
        )}
        <div
          className={
            mine
              ? "rounded-2xl rounded-br-md bg-foreground px-3.5 py-2.5 text-sm text-background"
              : `rounded-2xl rounded-bl-md border px-3.5 py-2.5 text-sm ${m.channel === "proactive" ? "border-primary/30 bg-accent" : "bg-card"}`
          }
        >
          <RichText text={m.text} />
        </div>
        <div className={`mt-1 text-xs text-muted-foreground ${mine ? "text-right" : ""}`}>
          {m.channel === "sms" ? "SMS · " : ""}{fmtTime(m.createdAt)}
        </div>
      </div>
    </div>
  );
}

function Conversation({ state }: { state: StateSnapshot }) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const streaming = useSyncExternalStore(subscribeStream, () => replyStream.text);
  const [listening, setListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recogRef = useRef<any>(null);
  const lastMsg = state.messages[state.messages.length - 1];
  const pendingCommitted = pendingText !== null && lastMsg?.role === "user" && lastMsg.text === pendingText;
  const endRef = useRef<HTMLDivElement>(null);
  const pending = state.approvals.filter((a) => a.status === "pending");

  const voiceStatus = useQuery<{ tts: boolean }>({ queryKey: ["/api/voice/status"], queryFn: getQueryFn({ on401: "returnNull" }) });
  const SpeechRec: any = typeof window !== "undefined" ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
  const ttsOn = voiceStatus.data?.tts && speakReplies;

  const speak = async (reply: string) => {
    try {
      const r = await fetch(`${API_BASE}/api/voice/tts`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: reply }) });
      if (!r.ok) return;
      const blob = await r.blob();
      audioRef.current?.pause();
      const a = new Audio(URL.createObjectURL(blob));
      audioRef.current = a;
      void a.play();
    } catch { /* voice unavailable */ }
  };

  const send = useMutation({
    mutationFn: async (t: string) => (await apiRequest("POST", "/api/messages", { text: t })).json(),
    onMutate: (t) => setPendingText(t),
    onSuccess: (data) => { if (ttsOn && data?.reply) void speak(data.reply); },
    onSettled: () => { setPendingText(null); queryClient.invalidateQueries({ queryKey: ["/api/state"] }); },
    onError: (e: Error) => toast({ title: "Message failed", description: e.message, variant: "destructive" }),
  });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [state.messages.length, pendingText, pending.length]);

  const submit = (t: string) => {
    const v = t.trim();
    if (!v || send.isPending) return;
    setText("");
    send.mutate(v);
  };

  const toggleMic = () => {
    if (!SpeechRec) { toast({ title: "No speech recognition", description: "This browser has no Web Speech API (Chrome/Edge do).", variant: "destructive" }); return; }
    if (listening) { recogRef.current?.stop(); setListening(false); return; }
    const r = new SpeechRec();
    recogRef.current = r;
    r.lang = "en-US";
    r.interimResults = true;
    r.onresult = (e: any) => {
      const res = e.results[e.results.length - 1];
      setText(res[0].transcript);
      if (res.isFinal) { setListening(false); r.stop(); submit(res[0].transcript); }
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    r.start();
    setListening(true);
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Conversation">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {state.messages.length === 0 && !pendingText && (
            <div className="mt-8 rounded-2xl border bg-card p-6 text-center" data-testid="card-welcome">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border bg-accent"><Sparkles className="h-5 w-5 text-primary" /></div>
              <h2 className="mt-3 text-lg font-semibold tracking-tight">Asta is listening</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Text it like a person — plan a trip, audit subscriptions, have it call someone, or just ask it to remember things.
              </p>
              <div className="mx-auto mt-4 grid max-w-sm grid-cols-2 gap-2 text-left text-[13px]">
                <div className="rounded-lg border bg-background px-3 py-2"><Phone className="mb-1 h-3.5 w-3.5 text-primary" />Call a business for you</div>
                <div className="rounded-lg border bg-background px-3 py-2"><Plane className="mb-1 h-3.5 w-3.5 text-primary" />Search + book travel</div>
                <div className="rounded-lg border bg-background px-3 py-2"><Brain className="mb-1 h-3.5 w-3.5 text-primary" />Remember what matters</div>
                <div className="rounded-lg border bg-background px-3 py-2"><ShieldCheck className="mb-1 h-3.5 w-3.5 text-primary" />Asks before it acts</div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Try a suggestion below — or just start typing.</p>
            </div>
          )}
          {state.messages.map((m) => <MessageBubble key={m.id} m={m} />)}
          {pendingText && (
            <>
              {!pendingCommitted && (
                <div className="flex justify-end"><div className="max-w-[75%] rounded-2xl rounded-br-md bg-foreground px-3.5 py-2.5 text-sm text-background opacity-70"><span className="bubble-text">{pendingText}</span></div></div>
              )}
              {!streaming && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="status-thinking">
                  <span className="flex gap-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" /></span>
                  Working: planning, checking policy, calling tools
                </div>
              )}
            </>
          )}
          {streaming && (
            <div className="flex justify-start" data-testid="row-message-streaming">
              <div className="max-w-[85%] sm:max-w-[75%]">
                <div className="rounded-2xl rounded-bl-md border bg-card px-3.5 py-2.5 text-sm"><span className="bubble-text">{streaming}</span><span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-foreground/40 align-middle" /></div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t bg-background/95 px-4 pb-4 pt-3 sm:px-6">
        <div className="mx-auto max-w-2xl">
          {pending.length > 0 && (
            <div className="mb-3 space-y-2" data-testid="list-pending-inline">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[hsl(36_80%_32%)]"><KeyRound className="h-3.5 w-3.5" /> Waiting for your approval</div>
              {pending.slice(0, 2).map((a) => <ApprovalCard key={a.id} a={a} compact />)}
            </div>
          )}
          <div className="chip-row mb-2 flex gap-2 overflow-x-auto pb-1 pr-6 sm:flex-wrap sm:overflow-visible sm:pr-0" role="list" aria-label="Suggestions">
            {(state.suggestions.length ? state.suggestions : FALLBACK_SUGGESTIONS).map((s, i) => (
              <button key={s.label} role="listitem" onClick={() => submit(s.prompt)} disabled={send.isPending} data-testid={`button-suggestion-${i}`} title={s.reason || s.prompt}
                className="shrink-0 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50">
                {s.label}
              </button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); submit(text); }} className="flex items-end gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(text); } }}
              placeholder="Text your agent…"
              rows={1}
              className="min-h-[44px] resize-none bg-card"
              data-testid="input-message"
              aria-label="Message"
            />
            <Button type="button" size="icon" variant={listening ? "default" : "outline"} className={`h-11 w-11 shrink-0 ${listening ? "animate-pulse" : ""}`} onClick={toggleMic} data-testid="button-mic" aria-label={listening ? "Stop listening" : "Talk to your agent"} title="Talk to your agent">
              {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
            {voiceStatus.data?.tts && (
              <Button type="button" size="icon" variant={speakReplies ? "default" : "outline"} className="h-11 w-11 shrink-0" onClick={() => { setSpeakReplies(!speakReplies); if (speakReplies) audioRef.current?.pause(); }} data-testid="button-speaker" aria-label="Speak replies" title="Speak replies (ElevenLabs)">
                <Volume2 className="h-5 w-5" />
              </Button>
            )}
            <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={!text.trim() || send.isPending} data-testid="button-send" aria-label="Send">
              <ArrowUp className="h-5 w-5" />
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}

const eventIcon: Record<AgentEvent["type"], JSX.Element> = {
  message_in: <MessageSquare className="h-3.5 w-3.5" />, message_out: <MessageSquare className="h-3.5 w-3.5" />,
  model_call: <Cpu className="h-3.5 w-3.5" />, tool_call: <Wrench className="h-3.5 w-3.5" />, policy: <ShieldCheck className="h-3.5 w-3.5" />,
  approval: <KeyRound className="h-3.5 w-3.5" />, execution: <Check className="h-3.5 w-3.5" />, memory: <Brain className="h-3.5 w-3.5" />,
  kill_switch: <OctagonX className="h-3.5 w-3.5" />, error: <CircleAlert className="h-3.5 w-3.5" />,
  provider: <Link2 className="h-3.5 w-3.5" />, integrity: <ShieldCheck className="h-3.5 w-3.5" />,
};
const eventTone: Partial<Record<AgentEvent["type"], string>> = {
  policy: "text-primary", approval: "text-[hsl(36_80%_34%)]", execution: "text-primary", kill_switch: "text-destructive", error: "text-destructive", integrity: "text-destructive", model_call: "text-[hsl(222_40%_40%)]",
};
const FILTERS: { id: string; label: string; types: AgentEvent["type"][] | null }[] = [
  { id: "all", label: "All", types: null },
  { id: "policy", label: "Policy", types: ["policy", "approval", "execution", "kill_switch", "integrity"] },
  { id: "models", label: "Models", types: ["model_call"] },
  { id: "tools", label: "Tools", types: ["tool_call", "error"] },
  { id: "memory", label: "Memory", types: ["memory"] },
  { id: "providers", label: "Providers", types: ["provider"] },
];

function ActivityTab({ events }: { events: AgentEvent[] }) {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<number | null>(null);
  const f = FILTERS.find((x) => x.id === filter)!;
  const list = f.types ? events.filter((e) => f.types!.includes(e.type)) : events;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((x) => (
          <button key={x.id} onClick={() => setFilter(x.id)} data-testid={`button-filter-${x.id}`}
            className={`rounded-md px-2 py-1 text-xs ${filter === x.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{x.label}</button>
        ))}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Append-only log of every message, model call, policy decision, approval, and execution.</p>
      {list.length === 0 && <div className="grid place-items-center rounded-lg border border-dashed py-8 text-sm text-muted-foreground">No events yet — send the agent a message and watch the log fill in.</div>}
      <ol className="space-y-1">
        {list.map((e) => (
          <li key={e.id} data-testid={`row-event-${e.id}`}>
            <button onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted">
              <span className={`mt-0.5 ${eventTone[e.type] ?? "text-muted-foreground"}`}>{eventIcon[e.type]}</span>
              <span className="min-w-0 flex-1 text-xs leading-relaxed [overflow-wrap:anywhere]">{e.summary}</span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{fmtTime(e.ts)}</span>
            </button>
            {open === e.id && e.data && (
              <pre className="mx-2 mb-2 max-h-64 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-relaxed">{JSON.stringify(e.data, null, 2)}</pre>
            )}
          </li>
        ))}
        {!list.length && <li className="text-sm text-muted-foreground">No events yet.</li>}
      </ol>
    </div>
  );
}

function FactRow({ f }: { f: Fact }) {
  const forget = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/memory/${f.id}/forget`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/state"] }),
  });
  return (
    <li className="rounded-lg border bg-card p-3" data-testid={`card-fact-${f.id}`}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm leading-snug">{f.statement}</p>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => forget.mutate()} aria-label="Forget this fact" data-testid={`button-forget-${f.id}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{f.category}</span>
        <span className="font-mono">{f.scope}</span>
        <span>{f.sourceType.replace("_", " ")}{f.channel ? ` via ${f.channel}` : ""}</span>
        <span>confidence {f.confidence}</span>
        <span>{f.expiresAt ? `expires ${new Date(f.expiresAt).toLocaleDateString()}` : "no expiry"}</span>
        {f.supersedes.length > 0 && <span>supersedes {f.supersedes.length}</span>}
      </div>
    </li>
  );
}

function MemoryTab({ facts }: { facts: Fact[] }) {
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState(false);
  const [json, setJson] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const importM = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/memory/import", JSON.parse(json))).json(),
    onSuccess: (r: any) => { toast({ title: `Imported ${r.imported} facts` }); setJson(""); setImportOpen(false); queryClient.invalidateQueries({ queryKey: ["/api/state"] }); },
    onError: (e: Error) => toast({ title: "Import failed", description: e.message.replace(/^\d+: /, "").slice(0, 300), variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: async () => apiRequest("DELETE", "/api/memory"),
    onSuccess: () => { setConfirmDelete(false); queryClient.invalidateQueries({ queryKey: ["/api/state"] }); },
  });
  return (
    <div>
      <div className="mb-3 rounded-lg border border-primary/25 bg-accent p-3 text-xs leading-relaxed text-accent-foreground">
        You own this memory. Export it as <strong className="font-semibold">Open Memory Format v0.1</strong> (validated against the published schema) and import it into any compatible agent.
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" asChild data-testid="button-export-memory">
          <a href={`${API_BASE}/api/memory/export`} target="_blank" rel="noopener noreferrer"><Download className="mr-1 h-4 w-4" /> Export OMF</a>
        </Button>
        <Button size="sm" variant="outline" onClick={() => setImportOpen(!importOpen)} data-testid="button-toggle-import"><Upload className="mr-1 h-4 w-4" /> Import</Button>
        <Button size="sm" variant="outline" className={confirmDelete ? "border-destructive text-destructive" : ""} onClick={() => (confirmDelete ? del.mutate() : setConfirmDelete(true))} data-testid="button-delete-memory">
          <Trash2 className="mr-1 h-4 w-4" /> {confirmDelete ? "Tap again to delete all" : "Delete all"}
        </Button>
      </div>
      {importOpen && (
        <div className="mb-4 space-y-2">
          <Textarea value={json} onChange={(e) => setJson(e.target.value)} rows={6} placeholder='Paste an OMF v0.1 JSON export ({"omf_version":"0.1", ...})' className="font-mono text-xs" data-testid="input-import-json" />
          <Button size="sm" onClick={() => { try { JSON.parse(json); importM.mutate(); } catch { toast({ title: "That isn't valid JSON", variant: "destructive" }); } }} disabled={!json.trim() || importM.isPending} data-testid="button-import-memory">Validate and import</Button>
        </div>
      )}
      <ul className="space-y-2">
        {facts.map((f) => <FactRow key={f.id} f={f} />)}
        {!facts.length && <li className="text-sm text-muted-foreground">No memory stored. Tell your agent a preference and it will remember it here.</li>}
      </ul>
    </div>
  );
}

function Section({ icon, title, children }: { icon: JSX.Element; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{icon}{title}</h3>
      {children}
    </section>
  );
}

function DataTab({ state }: { state: StateSnapshot }) {
  return (
    <div>
      <p className="mb-4 text-xs text-muted-foreground">Sample connected data for this sandbox. Swap in real providers behind the same tool interfaces.</p>
      <Section icon={<CalendarDays className="h-3.5 w-3.5" />} title="Calendar">
        <ul className="divide-y rounded-lg border bg-card">
          {state.calendar.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm" data-testid={`row-calendar-${c.id}`}>
              <span className="w-36 shrink-0 whitespace-nowrap font-mono text-[11px] text-muted-foreground">{fmtDay(c.start)}</span>
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{c.title}</span>
              {c.kind === "hold" && <Badge variant="outline">hold</Badge>}
            </li>
          ))}
        </ul>
      </Section>
      <Section icon={<Mail className="h-3.5 w-3.5" />} title="Inbox (untrusted content)">
        <ul className="divide-y rounded-lg border bg-card">
          {state.inbox.map((e) => (
            <li key={e.id} className="px-3 py-2" data-testid={`row-inbox-${e.id}`}>
              <div className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate font-medium">{e.subject}</span>{!e.read && <span className="h-2 w-2 rounded-full bg-primary" aria-label="unread" />}</div>
              <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{e.sender}</div>
            </li>
          ))}
        </ul>
      </Section>
      <Section icon={<CreditCard className="h-3.5 w-3.5" />} title="Subscriptions">
        <ul className="divide-y rounded-lg border bg-card">
          {state.subscriptions.map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm" data-testid={`row-subscription-${s.id}`}>
              <span className={`min-w-0 flex-1 ${s.status === "cancelled" ? "text-muted-foreground line-through" : ""}`}>{s.merchant}</span>
              <span className="font-mono text-xs">${s.monthlyUsd.toFixed(2)}/mo</span>
              <span className={`w-20 text-right text-xs ${s.lastUsedDays > 60 ? "text-[hsl(36_80%_34%)]" : "text-muted-foreground"}`}>{s.status === "cancelled" ? "cancelled" : `${s.lastUsedDays}d idle`}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section icon={<Plane className="h-3.5 w-3.5" />} title="Bookings">
        {state.bookings.length ? (
          <ul className="divide-y rounded-lg border bg-card">
            {state.bookings.map((b) => (
              <li key={b.id} className="px-3 py-2 text-sm" data-testid={`row-booking-${b.id}`}>
                <div className="flex gap-2"><span className="min-w-0 flex-1">{b.merchant}: {b.description}</span><span className="font-mono text-xs">${b.amountUsd.toFixed(2)}</span></div>
                <div className="text-xs text-muted-foreground">Single-use card ••{b.cardLast4} · {b.status} · sample commission ${b.commissionUsd.toFixed(2)}</div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No bookings yet.</p>}
      </Section>
      <Section icon={<Send className="h-3.5 w-3.5" />} title="Outbox">
        {state.outbox.length ? (
          <ul className="divide-y rounded-lg border bg-card">
            {state.outbox.map((o) => (
              <li key={o.id} className="px-3 py-2 text-sm" data-testid={`row-outbox-${o.id}`}>
                <div className="flex gap-2"><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{o.subject}</span><Badge variant={o.status === "sent" ? "default" : "outline"}>{o.status}</Badge></div>
                <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">to {o.recipient}</div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No drafts or sent mail.</p>}
      </Section>
      <Section icon={<Phone className="h-3.5 w-3.5" />} title="Calls">
        {state.calls.length ? (
          <ul className="divide-y rounded-lg border bg-card">
            {state.calls.map((c) => (
              <li key={c.id} className="px-3 py-2 text-sm" data-testid={`row-call-${c.id}`}>
                <div className="flex gap-2"><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{c.to}: {c.purpose}</span><Badge variant={c.status === "completed" ? "default" : "outline"}>{c.status}</Badge></div>
                <div className="text-xs text-muted-foreground">
                  {c.transcript?.length ? `${c.transcript.length} transcript lines` : c.outcome ?? "no transcript"} · {c.providerRef ?? "unplaced"}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No calls placed. Ask the agent to call a business — it discloses itself and keeps a transcript.</p>}
      </Section>
    </div>
  );
}

interface BrowserStatus { open: boolean; url: string; title: string; frameBytes: number }

function BrowserTab() {
  const { toast } = useToast();
  const imgRef = useRef<HTMLImageElement>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const status = useQuery<BrowserStatus>({
    queryKey: ["/api/browser/status"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    refetchInterval: 2000,
  });
  const s = status.data;

  // Poll the latest screencast jpeg while a session is open.
  useEffect(() => {
    if (!s?.open) { setFrameUrl(null); return; }
    let alive = true;
    let objectUrl: string | null = null;
    const tick = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/browser/frame`, { credentials: "include" });
        if (!alive) return;
        if (!r.ok || r.status === 204) return; // 204 = session open, frame pending
        // arrayBuffer, not blob(): response.blob() intermittently fails with
        // "Failed to fetch" in Chromium while the body streams correctly —
        // building the Blob ourselves sidesteps that path entirely.
        const buf = await r.arrayBuffer();
        if (!buf.byteLength) return;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
        setFrameUrl(objectUrl);
      } catch { /* session may have closed */ }
    };
    void tick();
    const t = setInterval(tick, 900);
    return () => { alive = false; clearInterval(t); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [s?.open]);

  const sendInput = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await apiRequest("POST", "/api/browser/input", body)).json(),
    onError: (e: any) => toast({ title: "Input failed", description: e.message, variant: "destructive" }),
  });
  const close = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/browser/close", {})).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/browser/status"] }),
  });

  // Map a click on the scaled <img> back to page coordinates.
  const onClickImage = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    const rect = img.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * img.naturalWidth);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * img.naturalHeight);
    sendInput.mutate({ kind: "click", x, y });
  };
  const onKey = (e: React.KeyboardEvent) => {
    e.preventDefault();
    const map: Record<string, string> = { Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Escape: "Escape", ArrowDown: "ArrowDown", ArrowUp: "ArrowUp" };
    sendInput.mutate(map[e.key] ? { kind: "key", key: map[e.key] } : { kind: "type", text: e.key });
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          The agent's browser — a real Chromium session. Every action it takes here needs T3 approval. Click into the view to take over (e.g. log in yourself — the agent never sees your keystrokes as credentials unless it reads the page).
        </p>
        {s?.open && <Button size="sm" variant="outline" onClick={() => close.mutate()} data-testid="button-close-browser">Close session</Button>}
      </div>
      {s?.open ? (
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-[11px] text-muted-foreground" data-testid="text-browser-url"><ExternalLink className="h-3 w-3" />{s.url}</div>
          <div className="overflow-hidden rounded-lg border bg-black" tabIndex={0} onKeyDown={onKey} data-testid="browser-view" role="application" aria-label="Agent browser live view — click to take over">
            {frameUrl
              ? <img ref={imgRef} src={frameUrl} alt="live browser" className="block w-full cursor-crosshair select-none" onClick={onClickImage} draggable={false} />
              : <div className="grid h-64 place-items-center text-sm text-muted-foreground">Waiting for first frame…</div>}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Click = mouse click · typing goes to the page · refreshes ~1/s</p>
        </div>
      ) : (
        <div className="grid h-56 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground" data-testid="browser-empty">
          No session yet. Ask the agent to open a page — e.g. <span className="font-mono">"open github.com/Regantih and tell me about my repos"</span> — approve it, then watch here.
        </div>
      )}
    </div>
  );
}

function PolicyTab({ state }: { state: StateSnapshot }) {
  const { toast } = useToast();
  const voiceStatus = useQuery<{ tts: boolean }>({ queryKey: ["/api/voice/status"], queryFn: getQueryFn({ on401: "returnNull" }) });
  const [limit, setLimit] = useState(String(state.settings.standingLimitUsd));
  const update = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await apiRequest("POST", "/api/settings", body)).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/state"] }),
    onError: (e: Error) => toast({ title: "Not saved", description: e.message.replace(/^\d+: /, ""), variant: "destructive" }),
  });
  const s = state.settings;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-lg border bg-card p-3">
        <div>
          <div className="text-sm font-medium">Kill switch</div>
          <div className="text-xs text-muted-foreground">Pauses all actions, cancels pending approvals. Reads still work.</div>
        </div>
        <Switch checked={s.paused} onCheckedChange={(v) => update.mutate({ paused: v })} data-testid="switch-paused" aria-label="Pause agent" />
      </div>

      <div className="rounded-lg border bg-card p-3">
        <div className="text-sm font-medium">Standing limit for T3 actions</div>
        <p className="mt-0.5 text-xs text-muted-foreground">Purchases at or under this amount run without asking, still with a signed mandate. $0 means always ask. Daily cap: ${s.maxDailySpendUsd}.</p>
        <div className="mt-2 flex gap-2">
          <div className="relative w-32"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ""))} className="pl-6 font-mono" inputMode="decimal" data-testid="input-standing-limit" aria-label="Standing limit in dollars" /></div>
          <Button size="sm" variant="outline" onClick={() => update.mutate({ standingLimitUsd: Number(limit || 0) })} data-testid="button-save-limit">Save</Button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">T2 categories you allowed</h3>
        {s.optIns.length ? (
          <ul className="space-y-1">
            {s.optIns.map((o) => (
              <li key={o} className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm"><span className="flex-1 font-mono text-xs">{o}</span>
                <Button size="sm" variant="ghost" onClick={() => update.mutate({ revokeOptIn: o })} data-testid={`button-revoke-${o}`}>Revoke</Button></li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">None. Every T2 action asks first.</p>}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risk policy v{state.policy.version} · unmatched actions default to {state.policy.defaultTier}</h3>
        <ul className="grid grid-cols-1 gap-1">
          {state.policy.actions.map((a) => (
            <li key={a.match} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted"><span className="flex-1 font-mono [overflow-wrap:anywhere]">{a.match}</span><TierChip tier={a.tier} /></li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Loaded from <span className="font-mono">spec/risk-policy/policy.example.yaml</span>. Actions taken after reading email or web content are escalated one tier.</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Cpu className="h-3.5 w-3.5" /> Model router</div>
          <div className="mt-2 text-xs"><span className="text-muted-foreground">Real-time lane</span><div className="font-mono" data-testid="text-planner-model">{s.plannerModel}</div></div>
          <div className="mt-1 text-xs"><span className="text-muted-foreground">Batch lane</span><div className="font-mono" data-testid="text-fast-model">{s.fastModel}</div></div>
          <div className="mt-1 flex items-center justify-between text-xs"><span>Provider</span><Badge variant="outline" data-testid="status-provider">{s.llmProvider}</Badge></div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Radio className="h-3.5 w-3.5" /> Channels</div>
          <div className="mt-2 flex items-center justify-between text-xs"><span>Web chat</span><Badge>Active</Badge></div>
          <div className="mt-1 flex items-center justify-between text-xs"><span>SMS (Twilio webhook)</span><Badge variant="outline" data-testid="status-sms">{s.smsConfigured ? "Configured" : "Needs number"}</Badge></div>
          <div className="mt-1 flex items-center justify-between text-xs"><span>Email (inbound + outbound)</span><Badge variant="outline" data-testid="status-email">{s.emailConfigured ? "Configured" : "Simulated"}</Badge></div>
          <div className="mt-1 flex items-center justify-between text-xs"><span>Voice (mic + ElevenLabs TTS)</span><Badge variant="outline" data-testid="status-voice">{voiceStatus.data?.tts ? "Configured" : "Mic only"}</Badge></div>
          <div className="mt-1 flex items-center justify-between text-xs"><span>Orchestrator / tracing</span><Badge variant="outline" data-testid="status-infra">{s.orchestrator}{s.tracing ? " + langfuse" : ""}</Badge></div>
        </div>
      </div>

      <AccountSection s={s} />
    </div>
  );
}

function SignIn() {
  const { toast } = useToast();
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"enter" | "sent">("enter");
  const [devLink, setDevLink] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });

  const magic = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/auth/magic-link", { email })).json(),
    onSuccess: (r: any) => { setStage("sent"); setDevLink(r.devLink ?? null); },
    onError: (e: Error) => toast({ title: "Could not send link", description: e.message.replace(/^\d+: /, ""), variant: "destructive" }),
  });
  const otpReq = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/auth/phone/request", { phone })).json(),
    onSuccess: (r: any) => { setStage("sent"); setDevCode(r.devCode ?? null); },
    onError: (e: Error) => toast({ title: "Could not send code", description: e.message.replace(/^\d+: /, ""), variant: "destructive" }),
  });
  const otpVerify = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/auth/phone/verify", { phone, code })).json(),
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Code rejected", description: e.message.replace(/^\d+: /, ""), variant: "destructive" }),
  });

  const [legal, setLegal] = useState<"terms" | "privacy" | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("auth") === "expired") {
      toast({ title: "That sign-in link is invalid or expired", description: "Request a new one below — links work once and expire in 15 minutes.", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const FEATURES = [
    { icon: Sparkles, title: "Does things, not just answers", body: "Books flights, calls businesses, texts people, watches your inbox and calendar." },
    { icon: ShieldCheck, title: "Asks before it acts", body: "Anything that spends money or acts as you shows an approval card first — a signed mandate executes it." },
    { icon: Brain, title: "Memory you own", body: "Every fact it stores shows its provenance. Export all of it, or delete it, any time." },
    { icon: Phone, title: "Talks to people", body: "Its own phone and email — calls the venue, chases the reply, texts you first when it matters." },
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-10 px-4 py-10 lg:flex-row lg:gap-16">
        <div className="max-w-md lg:flex-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Asta</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            A personal agent that lives in your text messages — and does the work. It plans trips, calls the restaurant, chases the email, and remembers what matters. Everything consequential asks you first.
          </p>
          <div className="mt-6 space-y-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-card"><f.icon className="h-4 w-4 text-primary" /></div>
                <div><div className="text-sm font-medium">{f.title}</div><div className="text-[13px] leading-snug text-muted-foreground">{f.body}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="w-full max-w-sm shrink-0 rounded-xl border bg-card p-6" data-testid="card-signin">
          <h2 className="text-lg font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Passwordless — a link or a text gets you in.</p>
        <div className="mt-4 flex gap-1 rounded-lg bg-muted p-1">
          {(["email", "phone"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setStage("enter"); }} data-testid={`button-auth-${m}`}
              className={`flex-1 rounded-md py-1.5 text-sm capitalize ${mode === m ? "bg-foreground text-background" : "text-muted-foreground"}`}>{m === "email" ? "Email link" : "Text message"}</button>
          ))}
        </div>
        {mode === "email" ? (
          <div className="mt-4 space-y-2">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" data-testid="input-auth-email" />
            <Button className="w-full" onClick={() => magic.mutate()} disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || magic.isPending} data-testid="button-send-link">
              {magic.isPending ? "Sending…" : "Email me a sign-in link"}
            </Button>
            {stage === "sent" && (
              <p className="text-xs text-muted-foreground">
                {devLink ? (
                  <>Tap to sign in — your link is ready (expires in 15 minutes): <a href={devLink} className="mt-1 block font-medium text-primary underline [overflow-wrap:anywhere]" data-testid="link-dev-magic">Sign in to Asta</a></>
                ) : "Link sent — it expires in 15 minutes. Check your inbox."}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" data-testid="input-auth-phone" />
            {stage === "enter" ? (
              <Button className="w-full" onClick={() => otpReq.mutate()} disabled={phone.replace(/\D/g, "").length < 7 || otpReq.isPending} data-testid="button-send-code">
                {otpReq.isPending ? "Sending…" : "Text me a code"}
              </Button>
            ) : (
              <>
                <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="6-digit code" inputMode="numeric" data-testid="input-auth-code" />
                <Button className="w-full" onClick={() => otpVerify.mutate()} disabled={code.length !== 6 || otpVerify.isPending} data-testid="button-verify-code">
                  {otpVerify.isPending ? "Checking…" : "Sign in"}
                </Button>
                <p className="text-xs text-muted-foreground">{devCode ? <>Your code: <span className="font-mono font-medium text-foreground" data-testid="text-dev-code">{devCode}</span> (expires in 15 minutes)</> : "Code sent — it expires in 15 minutes."}</p>
              </>
            )}
          </div>
        )}
          <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            By signing in you agree to the <button className="underline hover:text-foreground" onClick={() => setLegal("terms")}>Terms</button> and <button className="underline hover:text-foreground" onClick={() => setLegal("privacy")}>Privacy</button> notice.
          </p>
        </div>
      </div>
      <footer className="border-t px-4 py-4 text-center text-[11px] text-muted-foreground">
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Open source</a>
        {" · "}<button className="underline hover:text-foreground" onClick={() => setLegal("terms")}>Terms</button>
        {" · "}<button className="underline hover:text-foreground" onClick={() => setLegal("privacy")}>Privacy</button>
      </footer>
      {legal && <LegalDoc kind={legal} onClose={() => setLegal(null)} />}
    </div>
  );
}

function LegalDoc({ kind, onClose }: { kind: "terms" | "privacy"; onClose: () => void }) {
  const content = kind === "terms" ? {
    title: "Terms of use",
    body: [
      ["The service", "This is a personal agent: software that takes actions on your behalf — reading your connected data, messaging people, booking things, browsing the web — inside limits you control."],
      ["You stay in control", "Actions that spend money or act as you require your explicit approval before they execute. You can pause the agent at any time with the kill switch; approvals expire; every execution is logged and auditable."],
      ["Sandbox data", "Unless you connect real providers, flight inventory, payments, and calls run against simulated providers that perform no real-world action."],
      ["Your responsibility", "You're responsible for actions you approve and for the credentials and provider accounts you connect. The agent discloses itself as an AI on calls and never acts outside the configured risk policy."],
      ["No warranty", "This software is provided as-is, open source, without warranty of any kind."],
    ],
  } : {
    title: "Privacy notice",
    body: [
      ["Your data", "Messages, memories, calendar, and connected-provider data are stored per-user and never shared across accounts. You can export everything (Open Memory Format) or delete it all, any time."],
      ["Credentials", "Site logins and model keys you store are encrypted at rest (AES-256-GCM). They are used only to act for you and are never shown to the model or returned by any endpoint."],
      ["Calls", "Call audio is never recorded — only transcripts are kept, and they live in your account's data."],
      ["Model providers", "Your messages are sent to the configured model provider (e.g. Anthropic) to plan actions. With a your-own-key setup, requests go under your key only."],
      ["Deletion", "Deleting a fact, a credential, or your whole memory removes it from the store. The reset control wipes your entire agent state."],
    ],
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose} data-testid={`dialog-legal-${kind}`}>
      <div className="max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-xl border bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">{content.title}</h3><button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-muted-foreground" /></button></div>
        <div className="mt-4 space-y-4">
          {content.body.map(([h, b]) => <div key={h}><div className="text-sm font-medium">{h}</div><p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{b}</p></div>)}
        </div>
      </div>
    </div>
  );
}

function AccountSection({ s }: { s: Settings }) {
  const { toast } = useToast();
  const [bindChannel, setBindChannel] = useState<"sms" | "email">("sms");
  const [bindAddr, setBindAddr] = useState("");
  const [bindCode, setBindCode] = useState("");
  const [bindStage, setBindStage] = useState<"enter" | "sent">("enter");
  const [bindDev, setBindDev] = useState<string | null>(null);
  const [keyProvider, setKeyProvider] = useState("anthropic");
  const [keyValue, setKeyValue] = useState("");
  const [credSite, setCredSite] = useState("");
  const [credUser, setCredUser] = useState("");
  const [credPass, setCredPass] = useState("");
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/state"] });

  const bindStart = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/channels/bind", { channel: bindChannel, address: bindAddr })).json(),
    onSuccess: (r: any) => { setBindStage("sent"); setBindDev(r.devCode ?? r.devLink ?? null); },
    onError: (e: Error) => toast({ title: "Could not send", description: e.message.replace(/^\d+: /, ""), variant: "destructive" }),
  });
  const bindVerify = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/channels/bind/verify", { channel: bindChannel, address: bindAddr, code: bindCode })).json(),
    onSuccess: () => { setBindStage("enter"); setBindAddr(""); setBindCode(""); setBindDev(null); invalidate(); toast({ title: "Channel linked" }); },
    onError: (e: Error) => toast({ title: "Code rejected", description: e.message.replace(/^\d+: /, ""), variant: "destructive" }),
  });
  const saveKey = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/keys", { provider: keyProvider, key: keyValue })).json(),
    onSuccess: () => { setKeyValue(""); invalidate(); toast({ title: "Key stored (encrypted at rest)" }); },
    onError: (e: Error) => toast({ title: "Key rejected", description: e.message.replace(/^\d+: /, ""), variant: "destructive" }),
  });
  const delKey = useMutation({
    mutationFn: async (p: string) => apiRequest("DELETE", `/api/keys/${p}`),
    onSuccess: invalidate,
  });
  const disconnectGoogle = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/connect/google/disconnect"),
    onSuccess: () => { invalidate(); toast({ title: "Google disconnected" }); },
    onError: (e: Error) => toast({ title: "Disconnect failed", description: e.message.replace(/^\d+: /, ""), variant: "destructive" }),
  });
  const saveCred = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/credentials", { site: credSite, username: credUser, password: credPass })).json(),
    onSuccess: () => { setCredSite(""); setCredUser(""); setCredPass(""); invalidate(); toast({ title: "Login saved — encrypted at rest" }); },
    onError: (e: Error) => toast({ title: "Login rejected", description: e.message.replace(/^\d+: /, ""), variant: "destructive" }),
  });
  const delCred = useMutation({
    mutationFn: async (site: string) => apiRequest("DELETE", `/api/credentials/${site}`),
    onSuccess: invalidate,
  });
  const logout = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] }),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Account</div>
        <div className="mt-2 text-xs text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{s.userEmail ?? s.userPhone ?? "local user"}</span>
          {!s.singleUser && <Button size="sm" variant="ghost" className="ml-2 h-6 px-2 text-xs" onClick={() => logout.mutate()} data-testid="button-signout">Sign out</Button>}
        </div>
        {s.agentEmail && (
          <div className="mt-2 text-xs text-muted-foreground">
            Email your agent at <span className="font-mono text-foreground" data-testid="text-agent-email">{s.agentEmail}</span>
          </div>
        )}
        {s.usageToday && (
          <div className="mt-2 text-xs text-muted-foreground" data-testid="text-usage">
            Today: {s.usageToday.turns} agent turn{s.usageToday.turns === 1 ? "" : "s"}
            {s.freeTierRemaining !== null && s.freeTierLimit !== null && ` · ${s.freeTierRemaining}/${s.freeTierLimit} free turns left`}
            {s.freeTierRemaining === null && s.keyProviders.length > 0 && " · your own model key"}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Radio className="h-3.5 w-3.5" /> Linked channels</div>
        <ul className="mt-2 space-y-1">
          {s.boundChannels.map((b) => (
            <li key={`${b.channel}:${b.address}`} className="flex items-center gap-2 text-xs" data-testid={`row-binding-${b.channel}`}>
              <Badge variant="outline">{b.channel}</Badge><span className="font-mono">{b.address}</span>
            </li>
          ))}
          {!s.boundChannels.length && <li className="text-xs text-muted-foreground">No channels linked yet — the web app only.</li>}
        </ul>
        <div className="mt-3 flex gap-1.5">
          <select value={bindChannel} onChange={(e) => { setBindChannel(e.target.value as "sms" | "email"); setBindStage("enter"); }} className="rounded-md border bg-background px-2 py-1 text-xs" data-testid="select-bind-channel" aria-label="Channel type">
            <option value="sms">SMS</option><option value="email">Email</option>
          </select>
          <Input value={bindAddr} onChange={(e) => setBindAddr(e.target.value)} placeholder={bindChannel === "sms" ? "+1 555 123 4567" : "you@example.com"} className="h-8 flex-1 text-xs" data-testid="input-bind-address" />
          <Button size="sm" variant="outline" className="h-8" onClick={() => bindStart.mutate()} disabled={!bindAddr.trim() || bindStart.isPending} data-testid="button-bind-start">
            {bindStage === "sent" ? "Resend" : "Send code"}
          </Button>
        </div>
        {bindStage === "sent" && (
          <div className="mt-2 flex gap-1.5">
            <Input value={bindCode} onChange={(e) => setBindCode(e.target.value)} placeholder="code" className="h-8 w-28 font-mono text-xs" data-testid="input-bind-code" />
            <Button size="sm" className="h-8" onClick={() => bindVerify.mutate()} disabled={!bindCode.trim() || bindVerify.isPending} data-testid="button-bind-verify">Verify</Button>
            {bindDev && <span className="self-center font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]" data-testid="text-bind-dev">{bindDev.startsWith("http") ? "link emailed (check inbox)" : `dev: ${bindDev}`}</span>}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Link2 className="h-3.5 w-3.5" /> Connections</div>
        <p className="mt-1 text-xs text-muted-foreground">Connect real accounts — the agent reads and acts through them instead of the built-in sample data.</p>
        <ul className="mt-2 space-y-1.5">
          {(() => {
            const g = s.connections?.find((c) => c.provider === "google");
            return (
              <li className="flex items-center gap-2 text-xs" data-testid="row-connection-google">
                <Badge variant="outline">Google</Badge>
                <span className="text-muted-foreground">Calendar · Gmail</span>
                {g ? (
                  <>
                    <span className="font-medium" data-testid="text-google-account">{g.accountLabel ?? "connected"}</span>
                    <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-xs" onClick={() => disconnectGoogle.mutate()} disabled={disconnectGoogle.isPending} data-testid="button-disconnect-google">Disconnect</Button>
                  </>
                ) : s.oauthProviders?.includes("google") ? (
                  <a href="/api/connect/google" className="ml-auto" data-testid="button-connect-google"><Button size="sm" variant="outline" className="h-6 px-2 text-xs">Connect</Button></a>
                ) : (
                  <span className="ml-auto text-muted-foreground" data-testid="text-google-unconfigured">not configured</span>
                )}
              </li>
            );
          })()}
          <li className="flex items-center gap-2 text-xs" data-testid="row-provider-flights">
            <Badge variant="outline">Flights</Badge>
            <span className="text-muted-foreground">{s.providerStatus?.flights === "duffel" ? "Duffel — live inventory" : "sample inventory"}</span>
          </li>
          <li className="flex items-center gap-2 text-xs" data-testid="row-provider-cards">
            <Badge variant="outline">Cards</Badge>
            <span className="text-muted-foreground">{s.providerStatus?.cards === "lithic" ? "Lithic — real single-use cards" : "simulated single-use cards"}</span>
          </li>
        </ul>
        {(s.providerStatus?.calendar === "google-calendar" || s.providerStatus?.inbox === "gmail") && (
          <p className="mt-2 text-xs text-primary" data-testid="text-live-providers">Live: calendar → {s.providerStatus.calendar}, inbox → {s.providerStatus.inbox}</p>
        )}
      </div>

      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><KeyRound className="h-3.5 w-3.5" /> Model keys (BYOK)</div>
        <p className="mt-1 text-xs text-muted-foreground">Bring your own model key — encrypted at rest, used only for your turns. Without one, free-tier limits apply.</p>
        <ul className="mt-2 space-y-1">
          {s.keyProviders.map((p) => (
            <li key={p} className="flex items-center gap-2 text-xs" data-testid={`row-key-${p}`}>
              <Badge variant="outline">{p}</Badge><span className="text-muted-foreground">stored · encrypted</span>
              <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-xs" onClick={() => delKey.mutate(p)} data-testid={`button-delkey-${p}`}>Remove</Button>
            </li>
          ))}
          {!s.keyProviders.length && <li className="text-xs text-muted-foreground">No keys stored.</li>}
        </ul>
        <div className="mt-3 flex gap-1.5">
          <select value={keyProvider} onChange={(e) => setKeyProvider(e.target.value)} className="rounded-md border bg-background px-2 py-1 text-xs" data-testid="select-key-provider" aria-label="Key provider">
            <option value="anthropic">Anthropic</option><option value="openai">OpenAI-compatible</option>
          </select>
          <Input type="password" value={keyValue} onChange={(e) => setKeyValue(e.target.value)} placeholder="sk-…" className="h-8 flex-1 font-mono text-xs" data-testid="input-byok-key" />
          <Button size="sm" variant="outline" className="h-8" onClick={() => saveKey.mutate()} disabled={keyValue.length < 8 || saveKey.isPending} data-testid="button-save-key">Save</Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Site logins (vault)</div>
        <p className="mt-1 text-xs text-muted-foreground">Logins the agent can type into its own browser (T3, with approval). Passwords are encrypted at rest and are never shown to the model or returned by the API.</p>
        <ul className="mt-2 space-y-1">
          {(s.credentials ?? []).map((c) => (
            <li key={c.site} className="flex items-center gap-2 text-xs" data-testid={`row-credential-${c.site}`}>
              <Badge variant="outline">{c.site}</Badge><span className="text-muted-foreground">{c.username}</span>
              <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-xs" onClick={() => delCred.mutate(c.site)} data-testid={`button-delcred-${c.site}`}>Remove</Button>
            </li>
          ))}
          {!(s.credentials ?? []).length && <li className="text-xs text-muted-foreground">No logins saved.</li>}
        </ul>
        <div className="mt-3 flex gap-1.5">
          <Input value={credSite} onChange={(e) => setCredSite(e.target.value)} placeholder="site.com" className="h-8 w-28 font-mono text-xs" data-testid="input-cred-site" />
          <Input value={credUser} onChange={(e) => setCredUser(e.target.value)} placeholder="username" className="h-8 flex-1 text-xs" data-testid="input-cred-user" />
          <Input type="password" value={credPass} onChange={(e) => setCredPass(e.target.value)} placeholder="password" className="h-8 flex-1 font-mono text-xs" data-testid="input-cred-pass" />
          <Button size="sm" variant="outline" className="h-8" onClick={() => saveCred.mutate()} disabled={!credSite.trim() || !credUser.trim() || !credPass || saveCred.isPending} data-testid="button-save-cred">Save</Button>
        </div>
      </div>
    </div>
  );
}

function ApprovalsTab({ approvals }: { approvals: Approval[] }) {
  const pending = approvals.filter((a) => a.status === "pending");
  const history = approvals.filter((a) => a.status !== "pending");
  const tone: Record<string, string> = { executed: "text-primary", denied: "text-muted-foreground", expired: "text-muted-foreground", failed: "text-destructive", approved: "text-primary" };
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {pending.map((a) => <ApprovalCard key={a.id} a={a} />)}
        {!pending.length && (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground" data-testid="status-no-approvals">
            Nothing waiting. When your agent wants to spend money or act as you, it will ask here.
          </div>
        )}
      </div>
      {history.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</h3>
          <ul className="space-y-2">
            {history.map((a) => (
              <li key={a.id} className="rounded-lg border bg-card p-3" data-testid={`row-approval-history-${a.id}`}>
                <div className="flex items-center gap-2"><TierChip tier={a.tier} /><span className={`ml-auto text-xs font-medium capitalize ${tone[a.status] ?? ""}`}>{a.status}</span></div>
                <p className="mt-1.5 text-sm leading-snug">{a.summary}</p>
                {a.mandate && (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">mandate {a.mandate.version} · sig {a.mandate.signature.slice(0, 20)}…</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Panels: custom dashboards declared via chat ("build me a panel tracking X").
// Fixed widget types bound to real snapshot data — no generated code.
function PanelsTab({ state }: { state: StateSnapshot }) {
  const lim = (w: PanelWidget) => w.limit ?? 5;
  const rows = (w: PanelWidget): { primary: string; secondary?: string }[] => {
    switch (w.type) {
      case "calendar": return state.calendar.slice(0, lim(w)).map((c) => ({ primary: c.title, secondary: fmtDay(c.start) }));
      case "inbox": return state.inbox.slice(0, lim(w)).map((e) => ({ primary: e.subject, secondary: e.sender }));
      case "subscriptions": return state.subscriptions.slice(0, lim(w)).map((s) => ({ primary: s.merchant, secondary: `$${s.monthlyUsd.toFixed(2)}/mo · ${s.status}` }));
      case "bookings": return state.bookings.slice(0, lim(w)).map((b) => ({ primary: `${b.merchant}: ${b.description}`, secondary: `$${b.amountUsd.toFixed(2)} · ${b.status}` }));
      case "calls": return state.calls.slice(0, lim(w)).map((c) => ({ primary: `${c.to}: ${c.purpose}`, secondary: c.status }));
      case "facts": return state.facts.slice(0, lim(w)).map((f) => ({ primary: f.statement, secondary: f.category }));
      case "approvals": return state.approvals.filter((a) => a.status === "pending").slice(0, lim(w)).map((a) => ({ primary: a.summary, secondary: a.tier }));
      case "usage": {
        const u = state.settings.usageToday;
        return [
          { primary: "Planner turns today", secondary: String(u.turns) },
          { primary: "Tokens in / out", secondary: `${u.inputTokens} / ${u.outputTokens}` },
          ...(state.settings.freeTierRemaining !== null ? [{ primary: "Free tier left", secondary: String(state.settings.freeTierRemaining) }] : []),
        ];
      }
      case "note": return [{ primary: w.text ?? "" }];
      default: return [{ primary: `unknown widget "${w.type}"` }];
    }
  };
  return (
    <div>
      <p className="mb-4 text-xs text-muted-foreground">Custom dashboards from real data. Ask the agent to build one — "make me a panel tracking subscriptions and bookings."</p>
      {state.panels.length ? (
        <div className="grid gap-3">
          {state.panels.map((p) => (
            <div key={p.id} className="rounded-lg border bg-card p-3" data-testid={`panel-${p.id}`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{p.title}</div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {p.widgets.map((w, i) => (
                  <div key={i} className="rounded-md border bg-background p-2.5" data-testid={`panel-${p.id}-widget-${i}`}>
                    <div className="text-[11px] font-medium text-muted-foreground">{w.title ?? w.type}</div>
                    <ul className="mt-1 space-y-1">
                      {rows(w).map((r, j) => (
                        <li key={j} className="text-xs">
                          <span className="[overflow-wrap:anywhere]">{r.primary}</span>
                          {r.secondary && <span className="ml-1.5 text-[11px] text-muted-foreground">{r.secondary}</span>}
                        </li>
                      ))}
                      {!rows(w).length && <li className="text-xs text-muted-foreground">Nothing here yet.</li>}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="text-no-panels">No panels yet. Ask the agent to build one from your data.</p>
      )}
    </div>
  );
}

function ControlPanel({ state, tab, onTab }: { state: StateSnapshot; tab: string; onTab: (t: string) => void }) {
  const pendingCount = state.approvals.filter((a) => a.status === "pending").length;
  return (
    <Tabs value={tab} onValueChange={onTab} className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 pt-3">
        <TabsList className="h-9 w-full justify-start overflow-x-auto bg-transparent p-0">
          <TabsTrigger value="approvals" className="px-2.5 data-[state=active]:bg-muted sm:px-3" data-testid="tab-approvals">
            Approvals{pendingCount > 0 && <span className="ml-1.5 rounded-full bg-[hsl(36_85%_42%)] px-1.5 text-[11px] font-semibold text-white" data-testid="badge-pending-count">{pendingCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="activity" className="px-2.5 data-[state=active]:bg-muted sm:px-3" data-testid="tab-activity">Activity</TabsTrigger>
          <TabsTrigger value="memory" className="px-2.5 data-[state=active]:bg-muted sm:px-3" data-testid="tab-memory">Memory</TabsTrigger>
          <TabsTrigger value="data" className="px-2.5 data-[state=active]:bg-muted sm:px-3" data-testid="tab-data">Data</TabsTrigger>
          <TabsTrigger value="panels" className="px-2.5 data-[state=active]:bg-muted sm:px-3" data-testid="tab-panels">Panels</TabsTrigger>
          <TabsTrigger value="browser" className="px-2.5 data-[state=active]:bg-muted sm:px-3" data-testid="tab-browser">Browser</TabsTrigger>
          <TabsTrigger value="policy" className="px-2.5 data-[state=active]:bg-muted sm:px-3" data-testid="tab-policy">Settings</TabsTrigger>
        </TabsList>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <TabsContent value="approvals" className="mt-0"><ApprovalsTab approvals={state.approvals} /></TabsContent>
        <TabsContent value="activity" className="mt-0"><ActivityTab events={state.events} /></TabsContent>
        <TabsContent value="memory" className="mt-0"><MemoryTab facts={state.facts} /></TabsContent>
        <TabsContent value="data" className="mt-0"><DataTab state={state} /></TabsContent>
        <TabsContent value="panels" className="mt-0"><PanelsTab state={state} /></TabsContent>
        <TabsContent value="browser" className="mt-0"><BrowserTab /></TabsContent>
        <TabsContent value="policy" className="mt-0"><PolicyTab state={state} /></TabsContent>
      </div>
    </Tabs>
  );
}

export default function AgentPage() {
  const { toast } = useToast();
  const [mobileView, setMobileView] = useState<"chat" | "control">("chat");
  const [panelTab, setPanelTab] = useState("approvals");
  const { data: session, isLoading: sessionLoading } = useQuery<SessionInfo | null>({ queryKey: ["/api/auth/session"], queryFn: getQueryFn({ on401: "returnNull" }) });
  const signedIn = !!session && (session.singleUser || !!session.userId);
  const { data: state, isLoading, error } = useQuery<StateSnapshot>({ queryKey: ["/api/state"], refetchInterval: 2500, enabled: signedIn });

  const background = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/background/run")).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/state"] }),
    onError: (e: Error) => toast({ title: "Background check failed", description: e.message, variant: "destructive" }),
  });
  const kill = useMutation({
    mutationFn: async (paused: boolean) => (await apiRequest("POST", "/api/settings", { paused })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/state"] }),
  });
  const reset = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/reset"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/state"] }),
  });
  const pendingCount = useMemo(() => state?.approvals.filter((a) => a.status === "pending").length ?? 0, [state]);

  // Live push: /api/events streams assistant deltas (reply typing) and state
  // signals (events, call status/transcript) — state refetches debounce to
  // ~4/sec; the 2.5s poll stays as the fallback for SSE-less environments.
  useEffect(() => {
    if (!signedIn) return;
    const es = new EventSource(`${API_BASE}/api/events`, { withCredentials: true });
    let t: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (t) return;
      t = setTimeout(() => { t = null; queryClient.invalidateQueries({ queryKey: ["/api/state"] }); }, 250);
    };
    es.onmessage = (msg) => {
      try {
        const e = JSON.parse(msg.data);
        if (e.type === "assistant_delta") { replyStream.text = e.reset ? String(e.delta ?? "") : replyStream.text + String(e.delta ?? ""); replyStreamNotify(); }
        else if (e.type === "assistant_done") { replyStream.text = ""; replyStreamNotify(); invalidate(); }
        else invalidate();
      } catch { /* malformed frame */ }
    };
    return () => { es.close(); if (t) clearTimeout(t); };
  }, [signedIn]);

  // OAuth redirect landing: ?connected=google / ?connect_error=...
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const connected = q.get("connected");
    const connectError = q.get("connect_error");
    if (!connected && !connectError) return;
    if (connected) toast({ title: `${connected} connected — live data now flows into your agent` });
    else toast({ title: "Connection failed", description: connectError ?? undefined, variant: "destructive" });
    window.history.replaceState({}, "", window.location.pathname);
  }, [toast]);

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-[15px] font-semibold tracking-tight sm:text-base" data-testid="text-app-title">Asta</h1>
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">v0.2</span>
        </div>
        {state && (
          <span data-testid="status-agent" className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${state.settings.paused ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${state.settings.paused ? "bg-destructive" : "bg-primary"}`} />
            {state.settings.paused ? "Paused" : "Active"}
          </span>
        )}
        {state?.settings.freeTierRemaining !== null && state?.settings.freeTierRemaining !== undefined && state?.settings.freeTierLimit !== null && (
          <button
            onClick={() => { setPanelTab("policy"); setMobileView("control"); }}
            title={state.settings.freeTierRemaining <= 5 ? "Running low — add your own model key in Settings → Account for unlimited turns" : "Free plan — add your own model key in Settings → Account for unlimited turns"}
            data-testid="pill-free-tier"
            className={`hidden items-center gap-1 rounded-full border px-2 py-0.5 text-xs sm:inline-flex ${state.settings.freeTierRemaining <= 5 ? "border-[hsl(36_80%_32%/0.4)] text-[hsl(36_80%_32%)]" : "text-muted-foreground"}`}
          >
            <Sparkles className="h-3 w-3" />{state.settings.freeTierRemaining}/{state.settings.freeTierLimit} free
          </button>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => background.mutate()} disabled={background.isPending || !state} data-testid="button-background" className="hidden sm:inline-flex">
            <Sparkles className="mr-1 h-4 w-4" /> {background.isPending ? "Checking…" : "Background check"}
          </Button>
          {state && (state.settings.paused ? (
            <Button size="sm" variant="outline" onClick={() => kill.mutate(false)} data-testid="button-resume"><Play className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Resume</span><span className="sr-only sm:hidden">Resume</span></Button>
          ) : (
            <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/5" onClick={() => kill.mutate(true)} data-testid="button-stop"><OctagonX className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Stop all</span><span className="sr-only sm:hidden">Stop all</span></Button>
          ))}
          <Button size="icon" variant="ghost" onClick={() => reset.mutate()} aria-label="Reset demo data" title="Reset demo data" data-testid="button-reset"><RotateCcw className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" asChild aria-label="Source on GitHub" title="Source on GitHub" className="hidden sm:inline-flex">
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" data-testid="link-github"><ExternalLink className="h-4 w-4" /></a>
          </Button>
        </div>
      </header>

      <div className="flex shrink-0 gap-1 border-b p-2 lg:hidden" role="tablist" aria-label="View">
        <button role="tab" aria-selected={mobileView === "chat"} onClick={() => setMobileView("chat")} data-testid="button-view-chat"
          className={`flex-1 rounded-md py-1.5 text-sm ${mobileView === "chat" ? "bg-foreground text-background" : "text-muted-foreground"}`}>Chat</button>
        <button role="tab" aria-selected={mobileView === "control"} onClick={() => setMobileView("control")} data-testid="button-view-control"
          className={`flex-1 rounded-md py-1.5 text-sm ${mobileView === "control" ? "bg-foreground text-background" : "text-muted-foreground"}`}>
          Control{pendingCount > 0 ? ` (${pendingCount})` : ""}
        </button>
      </div>

      {sessionLoading && <div className="p-6 text-sm text-muted-foreground" data-testid="status-loading">Connecting…</div>}
      {session !== undefined && !signedIn && <SignIn />}
      {signedIn && isLoading && <div className="p-6 text-sm text-muted-foreground" data-testid="status-loading">Connecting to your agent…</div>}
      {signedIn && error && <div className="p-6 text-sm text-destructive" data-testid="status-error">Could not reach the agent server: {(error as Error).message}</div>}
      {signedIn && state && (
        <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className={`min-h-0 ${mobileView === "chat" ? "flex" : "hidden"} flex-col lg:flex`}><Conversation state={state} /></div>
          <aside className={`min-h-0 border-l bg-[hsl(40_18%_95%)] ${mobileView === "control" ? "flex" : "hidden"} flex-col lg:flex`} aria-label="Control panel">
            <ControlPanel state={state} tab={panelTab} onTab={setPanelTab} />
          </aside>
        </main>
      )}
    </div>
  );
}
