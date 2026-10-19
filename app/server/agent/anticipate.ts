import type { Store } from "./db";

// Anticipation: the "thinks ahead" lane. Deterministic rules map the user's
// real state to the follow-ups a good assistant would already be lining up —
// flight on the calendar -> check-in, seat, parking; a dinner reservation ->
// call to confirm. These produce one-tap action buttons that run through the
// normal turn pipeline (and normal T0-T3 approvals), never around it.
//
// Rules are pure reads of the scoped store; each suggestion carries a stable
// `tag` so model-generated buttons can dedupe against them.

export interface Anticipation { tag: string; label: string; prompt: string; reason: string }

const HOUR = 3600000, DAY = 24 * HOUR;

const flightish = (t: string) => /\b(flight|fly|airline|[A-Z]{3}\s*(->|to|→)\s*[A-Z]{3})\b/i.test(t);
const reservationish = (t: string) => /\b(reservation|dinner|restaurant|table for|lunch at|booked a table)\b/i.test(t);
const prepish = (t: string) => /\b(interview|doctor|dentist|appointment|meeting|exam|inspection|closing)\b/i.test(t);

function fmtDay(ts: number): string {
  return new Date(ts).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export async function anticipate(store: Store): Promise<Anticipation[]> {
  const now = Date.now();
  const out: Anticipation[] = [];

  const [events, bookings, pending, calls, sent, inboxAll] = await Promise.all([
    store.listCalendar(now - 2 * HOUR, now + 7 * DAY),
    store.listBookings(),
    store.listApprovals(),
    store.listCalls(10),
    store.listOutbox(),
    store.listInbox(),
  ]);

  // Rule 1 — flight coming up: check-in window, seat, and the Hark signature:
  // a booking implies ground logistics (parking / airport run).
  for (const e of events.filter((e) => e.kind === "event" && flightish(e.title) && e.start > now && e.start < now + 3 * DAY)) {
    const when = fmtDay(e.start);
    out.push({
      tag: `checkin:${e.id}`,
      label: "Check in & pick seat",
      prompt: `Check me in for "${e.title}" (${when}) — confirm my seat preference is applied.`,
      reason: `You fly ${when} — check-in and seat selection usually open 24h out.`,
    });
    out.push({
      tag: `ground:${e.id}`,
      label: "Sort the airport run",
      prompt: `Plan my airport run for "${e.title}" (${when}): when to leave, parking or a ride, and add a reminder hold if needed.`,
      reason: `The "${e.title}" trip needs ground logistics — leave time, parking, or a ride.`,
    });
    break; // one flight's worth of follow-ups is enough
  }

  // Rule 2 — a dinner/venue reservation soon: the agent can call to confirm.
  for (const e of events.filter((e) => e.kind === "event" && reservationish(e.title) && e.start > now && e.start < now + 2 * DAY)) {
    out.push({
      tag: `confirm:${e.id}`,
      label: "Call to confirm",
      prompt: `Call the venue and confirm "${e.title}" (${fmtDay(e.start)}) — party size and time. Report back.`,
      reason: `"${e.title}" is coming up — a quick confirmation call avoids surprises.`,
    });
    break;
  }

  // Rule 3 — prep-worthy appointments inside 36h.
  for (const e of events.filter((e) => e.kind === "event" && prepish(e.title) && e.start > now && e.start < now + 36 * HOUR)) {
    out.push({
      tag: `prep:${e.id}`,
      label: `Prep for "${e.title.slice(0, 20)}"`,
      prompt: `Brief me for "${e.title}" (${fmtDay(e.start)}): relevant context, what to bring, anything in my inbox or memory that relates.`,
      reason: `"${e.title}" is soon — a short brief pulls the relevant context together.`,
    });
    break;
  }

  // Rule 4 — a completed call with no follow-up outcome noted: offer to act on it.
  const done = calls.find((c) => c.status === "completed" && !c.outcome && now - (c.endedAt ?? c.createdAt) < DAY);
  if (done) {
    out.push({
      tag: `callfollowup:${done.id}`,
      label: "Summarize the call",
      prompt: `Summarize the outcome of my call to ${done.to} ("${done.purpose}") and suggest any follow-ups.`,
      reason: `The call to ${done.to} finished — the transcript may need a next step.`,
    });
  }

  // Rule 5 — approvals waiting: a one-tap read-only review (never an approve).
  const nPending = pending.filter((a) => a.status === "pending").length;
  if (nPending > 0) {
    out.push({
      tag: "approvals",
      label: `Review ${nPending} approval${nPending === 1 ? "" : "s"}`,
      prompt: "Summarize my pending approvals — what each one does, the tier, and the risk.",
      reason: `${nPending} approval${nPending === 1 ? "" : "s"} waiting for your decision.`,
    });
  }

  // Rule 6 — an outbound email with no reply in 48h: offer to chase them.
  // The agent's follow-up lane — sent messages that went quiet get a nudge button.
  const stale = sent
    .filter((o) => o.status === "sent" && now - o.createdAt > 2 * DAY && now - o.createdAt < 14 * DAY)
    .filter((o) => !inboxAll.some((m) => m.receivedAt > o.createdAt && m.sender.toLowerCase().includes(o.recipient.toLowerCase())))
    .sort((a, b) => a.createdAt - b.createdAt);
  if (stale.length) {
    const o = stale[0];
    const days = Math.floor((now - o.createdAt) / DAY);
    out.push({
      tag: `followup:${o.id}`,
      label: `Nudge ${o.recipient.split("@")[0]}`,
      prompt: `Draft a short, polite follow-up to my email "${o.subject}" to ${o.recipient} — no reply in ${days} days.`,
      reason: `Your email to ${o.recipient} ("${o.subject}") has had no reply in ${days} days.`,
    });
  }

  return out.slice(0, 5);
}
