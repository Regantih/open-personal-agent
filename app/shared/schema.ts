import { z } from "zod";

// Shared types between the agent server and the web client.

export type Tier = "T0" | "T1" | "T2" | "T3";

export interface Message {
  id: number;
  role: "user" | "agent";
  channel: "web" | "sms" | "email" | "proactive" | "system";
  text: string;
  createdAt: number;
}

export interface AgentEvent {
  id: number;
  ts: number;
  type:
    | "message_in"
    | "message_out"
    | "model_call"
    | "tool_call"
    | "policy"
    | "approval"
    | "execution"
    | "memory"
    | "kill_switch"
    | "provider"
    | "error";
  summary: string;
  data: Record<string, unknown> | null;
}

export interface Fact {
  id: string;
  category: string;
  key: string | null;
  statement: string;
  sourceType: "user_stated" | "inferred" | "imported" | "third_party";
  channel: string | null;
  reference: string | null;
  confidence: number;
  scope: string;
  sensitivity: "low" | "medium" | "high" | "special_category";
  createdAt: number;
  expiresAt: number | null;
  supersedes: string[];
  active: boolean;
}

export interface CalendarItem {
  id: number;
  title: string;
  start: number;
  end: number;
  kind: "event" | "hold";
  location: string | null;
  providerRef?: string | null;
}

export interface InboxEmail {
  id: number;
  sender: string;
  subject: string;
  body: string;
  receivedAt: number;
  read: boolean;
  providerRef?: string | null;
}

export interface Approval {
  id: number;
  code: string;
  tool: string;
  action: string;
  tier: Tier;
  baseTier: Tier;
  escalated: boolean;
  summary: string;
  params: Record<string, unknown>;
  amountUsd: number | null;
  merchant: string | null;
  refundable: boolean | null;
  status: "pending" | "approved" | "denied" | "expired" | "executed" | "failed";
  mandate: Mandate | null;
  createdAt: number;
  expiresAt: number;
  result: string | null;
  allowCategory: boolean;
}

export interface Mandate {
  version: "opa-mandate-0.1" | "opa-mandate-0.2";
  approval_id: number;
  action: string;
  amount_usd: number | null;
  merchant: string | null;
  params_sha256: string;
  issued_at: number;
  expires_at: number;
  signature: string;
  // AP2-shaped objects present on v0.2 mandates.
  ap2?: {
    intent_mandate: {
      natural_language_description: string;
      user_cart_confirmation_required: boolean;
      merchants: string[] | null;
      requires_refundability: boolean;
      intent_expiry: string;
    };
    payment_mandate: {
      payment_details_total: {
        label: string;
        amount: { currency: string; value: number };
        refund_period: string;
      };
      payment_method: string;
      merchant_agent: string | null;
      risk_data: Record<string, unknown>;
    } | null;
  };
}

export interface Booking {
  id: number;
  kind: string;
  merchant: string;
  description: string;
  amountUsd: number;
  status: string;
  cardRef: string;
  cardLast4: string;
  commissionUsd: number;
  createdAt: number;
}

export interface Subscription {
  id: number;
  merchant: string;
  monthlyUsd: number;
  lastUsedDays: number;
  status: "active" | "cancelled";
}

export interface Outbox {
  id: number;
  recipient: string;
  subject: string;
  body: string;
  status: "draft" | "sent";
  createdAt: number;
  providerRef?: string | null;
}

// A connected third-party account (OAuth) — metadata only, secrets never leave the server.
export interface ProviderConnectionInfo {
  provider: string;
  accountLabel: string | null;
  scopes: string[];
  connectedAt: number;
}

export interface Settings {
  paused: boolean;
  standingLimitUsd: number;
  maxDailySpendUsd: number;
  optIns: string[];
  plannerModel: string;
  fastModel: string;
  llmConfigured: boolean;
  llmProvider: string;
  smsConfigured: boolean;
  emailConfigured: boolean;
  tracing: boolean;
  orchestrator: string;
  singleUser: boolean;
  userEmail: string | null;
  userPhone: string | null;
  agentEmail: string | null;
  boundChannels: { channel: string; address: string; verifiedAt: number }[];
  keyProviders: string[];
  connections: ProviderConnectionInfo[];
  credentials: { site: string; username: string; createdAt: number }[];
  oauthProviders: string[];
  providerStatus: { calendar: string; inbox: string; flights: string; cards: string };
  usageToday: { turns: number; inputTokens: number; outputTokens: number };
  freeTierRemaining: number | null;
  freeTierLimit: number | null;
}

export interface ActionSuggestion {
  label: string;
  prompt: string;
  reason?: string;
}

export interface PanelWidget { type: string; title?: string; limit?: number; text?: string }
export interface Panel { id: string; title: string; widgets: PanelWidget[]; createdAt: number }

export interface Call {
  id: number;
  to: string;
  purpose: string;
  status: string;
  providerRef: string | null;
  transcript: { speaker: string; text: string; at: number }[] | null;
  outcome: string | null;
  createdAt: number;
  endedAt: number | null;
}

export interface StateSnapshot {
  messages: Message[];
  approvals: Approval[];
  events: AgentEvent[];
  facts: Fact[];
  calendar: CalendarItem[];
  inbox: InboxEmail[];
  bookings: Booking[];
  subscriptions: Subscription[];
  outbox: Outbox[];
  settings: Settings;
  calls: Call[];
  panels: Panel[];
  suggestions: ActionSuggestion[];
  policy: { version: string; defaultTier: Tier; actions: { match: string; tier: Tier }[] };
}

export const sendMessageSchema = z.object({ text: z.string().min(1).max(2000) });
export const decideApprovalSchema = z.object({
  decision: z.enum(["approve", "deny"]),
  allowCategory: z.boolean().optional(),
});
export const settingsUpdateSchema = z.object({
  standingLimitUsd: z.number().min(0).max(10000).optional(),
  paused: z.boolean().optional(),
  revokeOptIn: z.string().optional(),
});
