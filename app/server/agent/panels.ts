import { randomBytes } from "node:crypto";
import type { Store } from "./db";

// Panels: user/agent-declared dashboard cards rendered in the Panels tab.
// Deliberately scoped — a panel composes fixed widget types bound to real
// store data rather than generating arbitrary UI code. Widgets are validated
// here before anything is stored.
//
// Panels live in the per-user settings row ("panels"), so no migration; a
// user reset clears them like other settings.

export const WIDGET_TYPES = ["calendar", "inbox", "subscriptions", "bookings", "calls", "facts", "approvals", "usage", "note"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];
export interface PanelWidget { type: WidgetType; title?: string; limit?: number; text?: string }
export interface Panel { id: string; title: string; widgets: PanelWidget[]; createdAt: number }

const MAX_PANELS = 10;
const MAX_WIDGETS = 6;

export async function listPanels(store: Store): Promise<Panel[]> {
  return store.getSetting<Panel[]>("panels", []);
}

function validateWidget(raw: any): PanelWidget {
  if (!raw || typeof raw !== "object" || !WIDGET_TYPES.includes(raw.type)) {
    throw new Error(`Invalid widget type "${raw?.type}" — one of: ${WIDGET_TYPES.join(", ")}`);
  }
  const w: PanelWidget = { type: raw.type };
  if (raw.title !== undefined) {
    if (typeof raw.title !== "string" || !raw.title.trim()) throw new Error("widget title must be a non-empty string");
    w.title = raw.title.trim().slice(0, 60);
  }
  if (raw.limit !== undefined) {
    const n = Number(raw.limit);
    if (!Number.isInteger(n) || n < 1 || n > 20) throw new Error("widget limit must be 1-20");
    w.limit = n;
  }
  if (raw.type === "note") {
    if (typeof raw.text !== "string" || !raw.text.trim()) throw new Error("note widget needs a text field");
    w.text = raw.text.trim().slice(0, 300);
  }
  return w;
}

export async function createPanel(store: Store, input: { title: string; widgets: any[] }): Promise<Panel> {
  const title = String(input.title ?? "").trim().slice(0, 60);
  if (!title) throw new Error("panel title required");
  const widgets = (Array.isArray(input.widgets) ? input.widgets : []).map(validateWidget);
  if (!widgets.length) throw new Error("panel needs at least one widget");
  if (widgets.length > MAX_WIDGETS) throw new Error(`panels support at most ${MAX_WIDGETS} widgets`);
  const panels = await listPanels(store);
  if (panels.length >= MAX_PANELS) throw new Error(`Panel limit reached (${MAX_PANELS}) — delete one first`);
  const panel: Panel = { id: "pnl_" + randomBytes(4).toString("hex"), title, widgets, createdAt: Date.now() };
  await store.setSetting("panels", [...panels, panel]);
  return panel;
}

export async function deletePanel(store: Store, id: string): Promise<boolean> {
  const panels = await listPanels(store);
  const next = panels.filter((p) => p.id !== id);
  if (next.length === panels.length) return false;
  await store.setSetting("panels", next);
  return true;
}
