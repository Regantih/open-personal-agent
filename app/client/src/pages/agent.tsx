import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient, API_BASE } from "@/lib/queryClient";
import type { AgentEvent, Approval, Fact, Message, StateSnapshot, Tier } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowUp, Bell, Brain, Check, CircleAlert, Cpu, Download, ExternalLink, KeyRound, MessageSquare, OctagonX, Play, RotateCcw,
  ShieldCheck, Sparkles, Trash2, Upload, Wrench, X, CalendarDays, Mail, CreditCard, Plane, Send, Radio,
} from "lucide-react";

const REPO_URL = "https://github.com/Regantih/open-personal-agent";

const SUGGESTIONS = [
  "What's on my calendar this week?",
  "Find me a flight from DFW to SFO next Monday afternoon",
  "Which subscriptions am I not using?",
  "Check my inbox and handle what needs doing",
  "Remember I prefer aisle seats on flights over 2 hours",
  "stop everything",
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
  const lastMsg = state.messages[state.messages.length - 1];
  const pendingCommitted = pendingText !== null && lastMsg?.role === "user" && lastMsg.text === pendingText;
  const endRef = useRef<HTMLDivElement>(null);
  const pending = state.approvals.filter((a) => a.status === "pending");

  const send = useMutation({
    mutationFn: async (t: string) => (await apiRequest("POST", "/api/messages", { text: t })).json(),
    onMutate: (t) => setPendingText(t),
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

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Conversation">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {state.messages.map((m) => <MessageBubble key={m.id} m={m} />)}
          {pendingText && (
            <>
              {!pendingCommitted && (
                <div className="flex justify-end"><div className="max-w-[75%] rounded-2xl rounded-br-md bg-foreground px-3.5 py-2.5 text-sm text-background opacity-70"><span className="bubble-text">{pendingText}</span></div></div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="status-thinking">
                <span className="flex gap-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" /></span>
                Working: planning, checking policy, calling tools
              </div>
            </>
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
            {SUGGESTIONS.map((s, i) => (
              <button key={s} role="listitem" onClick={() => submit(s)} disabled={send.isPending} data-testid={`button-suggestion-${i}`}
                className="shrink-0 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50">
                {s}
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
};
const eventTone: Partial<Record<AgentEvent["type"], string>> = {
  policy: "text-primary", approval: "text-[hsl(36_80%_34%)]", execution: "text-primary", kill_switch: "text-destructive", error: "text-destructive", model_call: "text-[hsl(222_40%_40%)]",
};
const FILTERS: { id: string; label: string; types: AgentEvent["type"][] | null }[] = [
  { id: "all", label: "All", types: null },
  { id: "policy", label: "Policy", types: ["policy", "approval", "execution", "kill_switch"] },
  { id: "models", label: "Models", types: ["model_call"] },
  { id: "tools", label: "Tools", types: ["tool_call", "error"] },
  { id: "memory", label: "Memory", types: ["memory"] },
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
    </div>
  );
}

function PolicyTab({ state }: { state: StateSnapshot }) {
  const { toast } = useToast();
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
          <div className="mt-1 flex items-center justify-between text-xs"><span>Voice</span><Badge variant="outline">Roadmap</Badge></div>
          <div className="mt-1 flex items-center justify-between text-xs"><span>Orchestrator / tracing</span><Badge variant="outline" data-testid="status-infra">{s.orchestrator}{s.tracing ? " + langfuse" : ""}</Badge></div>
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

function ControlPanel({ state }: { state: StateSnapshot }) {
  const pendingCount = state.approvals.filter((a) => a.status === "pending").length;
  return (
    <Tabs defaultValue="approvals" className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 pt-3">
        <TabsList className="h-9 w-full justify-start overflow-x-auto bg-transparent p-0">
          <TabsTrigger value="approvals" className="px-2.5 data-[state=active]:bg-muted sm:px-3" data-testid="tab-approvals">
            Approvals{pendingCount > 0 && <span className="ml-1.5 rounded-full bg-[hsl(36_85%_42%)] px-1.5 text-[11px] font-semibold text-white" data-testid="badge-pending-count">{pendingCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="activity" className="px-2.5 data-[state=active]:bg-muted sm:px-3" data-testid="tab-activity">Activity</TabsTrigger>
          <TabsTrigger value="memory" className="px-2.5 data-[state=active]:bg-muted sm:px-3" data-testid="tab-memory">Memory</TabsTrigger>
          <TabsTrigger value="data" className="px-2.5 data-[state=active]:bg-muted sm:px-3" data-testid="tab-data">Data</TabsTrigger>
          <TabsTrigger value="policy" className="px-2.5 data-[state=active]:bg-muted sm:px-3" data-testid="tab-policy">Policy</TabsTrigger>
        </TabsList>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <TabsContent value="approvals" className="mt-0"><ApprovalsTab approvals={state.approvals} /></TabsContent>
        <TabsContent value="activity" className="mt-0"><ActivityTab events={state.events} /></TabsContent>
        <TabsContent value="memory" className="mt-0"><MemoryTab facts={state.facts} /></TabsContent>
        <TabsContent value="data" className="mt-0"><DataTab state={state} /></TabsContent>
        <TabsContent value="policy" className="mt-0"><PolicyTab state={state} /></TabsContent>
      </div>
    </Tabs>
  );
}

export default function AgentPage() {
  const { toast } = useToast();
  const [mobileView, setMobileView] = useState<"chat" | "control">("chat");
  const { data: state, isLoading, error } = useQuery<StateSnapshot>({ queryKey: ["/api/state"], refetchInterval: 2500 });

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

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-[15px] font-semibold tracking-tight sm:text-base" data-testid="text-app-title">Open Personal Agent</h1>
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">v0.2</span>
        </div>
        {state && (
          <span data-testid="status-agent" className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${state.settings.paused ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${state.settings.paused ? "bg-destructive" : "bg-primary"}`} />
            {state.settings.paused ? "Paused" : "Active"}
          </span>
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

      {isLoading && <div className="p-6 text-sm text-muted-foreground" data-testid="status-loading">Connecting to your agent…</div>}
      {error && <div className="p-6 text-sm text-destructive" data-testid="status-error">Could not reach the agent server: {(error as Error).message}</div>}
      {state && (
        <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className={`min-h-0 ${mobileView === "chat" ? "flex" : "hidden"} flex-col lg:flex`}><Conversation state={state} /></div>
          <aside className={`min-h-0 border-l bg-[hsl(40_18%_95%)] ${mobileView === "control" ? "flex" : "hidden"} flex-col lg:flex`} aria-label="Control panel">
            <ControlPanel state={state} />
          </aside>
        </main>
      )}
    </div>
  );
}
