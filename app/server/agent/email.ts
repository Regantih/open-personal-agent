import { createHmac, timingSafeEqual } from "node:crypto";

// Email channel.
//
// Outbound: an EmailSender provider. Default is the simulated outbox. Real
// delivery activates automatically when provider env vars are set:
//   RESEND_API_KEY + EMAIL_FROM           -> Resend API (no extra dependency)
//   SMTP_URL (+ EMAIL_FROM, optional)     -> any SMTP relay via nodemailer,
//                                            e.g. smtps://user:pass@smtp.example.com:465
// Force a choice with EMAIL_PROVIDER=simulated|resend|smtp.
//
// Inbound: POST /api/channels/email accepts a parsed inbound payload
// ({from, to, subject, text} — Mailgun-style fields like "stripped-text" and
// "body-plain" are also understood). Auth, in order:
//   MAILGUN_SIGNING_KEY   -> verifies Mailgun webhook signature (timestamp+token+signature)
//   EMAIL_CHANNEL_SECRET  -> shared secret in the "x-opa-email-secret" header or "secret" field
// Mail addressed to the agent address (AGENT_EMAIL, or OWNER_EMAIL's own address
// replying in) is treated as a user command: the agent answers by email.
// Everything else lands in the sample inbox for the agent to read later.
// With no auth env var set the endpoint refuses mail.

export interface EmailSender {
  name: string;
  send(to: string, subject: string, body: string): Promise<{ delivery: string }>;
}

const simulatedSender: EmailSender = {
  name: "simulated-outbox",
  async send() {
    return { delivery: "simulated outbox (set RESEND_API_KEY or SMTP_URL for real delivery)" };
  },
};

const resendSender: EmailSender = {
  name: "resend",
  async send(to, subject, body) {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text: body }),
    });
    if (!resp.ok) throw new Error(`Resend returned ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const data: any = await resp.json();
    return { delivery: `resend id ${data.id ?? "?"}` };
  },
};

const smtpSender: EmailSender = {
  name: "smtp",
  async send(to, subject, body) {
    // nodemailer is a real dependency; imported lazily so the simulated path never loads it.
    const nodemailer = (await import("nodemailer")).default;
    const transport = nodemailer.createTransport(process.env.SMTP_URL!);
    const info = await transport.sendMail({ from: process.env.EMAIL_FROM || process.env.SMTP_URL!.split("@").pop(), to, subject, text: body });
    return { delivery: `smtp messageId ${info.messageId ?? "?"}` };
  },
};

export function emailSender(): EmailSender {
  const forced = (process.env.EMAIL_PROVIDER || "").toLowerCase();
  if (forced === "resend" || (!forced && process.env.RESEND_API_KEY)) return resendSender;
  if (forced === "smtp" || (!forced && process.env.SMTP_URL)) return smtpSender;
  return simulatedSender;
}

export function emailOutboundConfigured(): boolean {
  return emailSender() !== simulatedSender;
}

// ---------- inbound ----------

export interface InboundEmail { from: string; to: string; subject: string; text: string }

export function normalizeInbound(body: Record<string, any>): InboundEmail {
  return {
    from: String(body.from ?? body.From ?? body.sender ?? ""),
    to: String(body.to ?? body.To ?? body.recipient ?? ""),
    subject: String(body.subject ?? body.Subject ?? "(no subject)"),
    text: String(body.text ?? body["stripped-text"] ?? body["body-plain"] ?? body.body ?? "").slice(0, 8000),
  };
}

function safeEqual(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function validInboundEmailAuth(req: { headers: Record<string, any>; body: Record<string, any> }): boolean {
  const mailgunKey = process.env.MAILGUN_SIGNING_KEY;
  if (mailgunKey) {
    const { timestamp, token, signature } = req.body ?? {};
    if (!timestamp || !token || !signature) return false;
    const expected = createHmac("sha256", mailgunKey).update(String(timestamp) + String(token)).digest("hex");
    return safeEqual(expected, String(signature));
  }
  const secret = process.env.EMAIL_CHANNEL_SECRET;
  if (secret) {
    const got = String(req.headers["x-opa-email-secret"] ?? req.body?.secret ?? "");
    return safeEqual(got, secret);
  }
  return false;
}

// An email is a command for the agent only if it comes from the owner.
// If AGENT_EMAIL is set, it must also be addressed there; otherwise any
// authenticated owner mail counts. With OWNER_EMAIL unset nothing is a command.
export function isAgentAddressed(mail: InboundEmail): boolean {
  const owner = (process.env.OWNER_EMAIL || "").toLowerCase();
  if (!owner || !mail.from.toLowerCase().includes(owner)) return false;
  const agentAddr = (process.env.AGENT_EMAIL || "").toLowerCase();
  return !agentAddr || mail.to.toLowerCase().includes(agentAddr);
}

export function emailInboundConfigured(): boolean {
  return !!(process.env.MAILGUN_SIGNING_KEY || process.env.EMAIL_CHANNEL_SECRET);
}
