// In-process event bus. The server pushes state changes to connected browser
// clients over SSE (GET /api/events) so the UI updates live instead of waiting
// for the 2.5s poll. Single-node only — a multi-node deploy would swap this
// for Redis pub/sub; the emit/subscribe API stays identical.

export type BusEvent = {
  type: "event" | "call" | "assistant_delta" | "assistant_done" | "state";
  [k: string]: unknown;
};

type Listener = (e: BusEvent) => void;
const subs = new Map<string, Set<Listener>>();

export function emit(userId: string, e: BusEvent): void {
  const set = subs.get(userId);
  if (!set?.size) return;
  set.forEach((fn) => {
    try { fn(e); } catch { /* a dead listener must not break the emitter */ }
  });
}

export function subscribe(userId: string, fn: Listener): () => void {
  let set = subs.get(userId);
  if (!set) { set = new Set(); subs.set(userId, set); }
  set.add(fn);
  return () => { set!.delete(fn); if (!set!.size) subs.delete(userId); };
}
