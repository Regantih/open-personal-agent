# Asta — Open Personal Agent Reference App (v0.2)

**Asta** is a working, minimal personal agent you text. It plans with a frontier model, runs every action through the [Risk Policy](../spec/risk-policy/), asks before it spends money or acts as you, and stores memory you can export as [Open Memory Format](../spec/open-memory-format/).

This is a reference implementation of the [playbook](../docs/). It is small on purpose, so you can read all of it in an afternoon and replace any part.

## What it does

- Chat by web, SMS, or email. Ask about your calendar, search flights, audit subscriptions, read and draft email, and tell it preferences to remember.
- Every tool call is checked against `spec/risk-policy/policy.example.yaml` before it runs. The model cannot approve anything itself.
- T2 and T3 actions create a pending approval with a 4-digit code and a 10-minute expiry. Approve in the app or reply `APPROVE 1234` by text.
- Approving signs an AP2-shaped mandate (intent + payment objects, HMAC over the action, amount, merchant, and a hash of the exact parameters). The mandate is verified again before execution. Money moves only on a single-use card capped at the approved amount.
- Prompt-injection defense: after the agent reads email or other untrusted content, every later action in that turn is escalated one tier. The sample inbox includes a hostile email so you can watch it work.
- Kill switch: text `stop everything` (or use the switch). All actions pause, pending approvals are cancelled, and reads still work. `RESUME` turns it back on.
- Memory: facts carry provenance, scope, confidence, and expiry. Export validates against the OMF schema; import accepts any valid OMF v0.1 file.
- Two model lanes: a planner model for real-time turns and a fast model for the background check (proactive digest). Anthropic by default; any OpenAI-compatible endpoint (vLLM, Ollama, Groq) works too.
- An append-only activity log of every message, model call, policy decision, approval, and execution. Optional Langfuse tracing mirrors every turn, generation, and tool call.
- Optional multi-user mode: passwordless sign-in (email magic link or SMS OTP), per-user storage isolation, per-user mandate secrets, per-user agent email addresses, channel binding, and encrypted bring-your-own-model-key (BYOK) vaulting with a free-tier turn cap.
- A 64-task eval suite (`npm run eval`) exercises the whole pipeline — policy, approvals, taint escalation, kill switch, memory, tenancy isolation, and the browser rung — with a scripted model, no API key needed.

## Real vs. sample

| Part | Status |
| --- | --- |
| Agent loop, tool calling, model router | Real (Anthropic Messages API, or any OpenAI-compatible endpoint incl. self-hosted vLLM) |
| Risk policy engine, approvals, kill switch, taint escalation | Real |
| Mandate signing and verification | Real HMAC-SHA256 over AP2-shaped intent + payment objects |
| OMF export and import with schema validation | Real |
| SMS webhook with Twilio signature check | Verified end-to-end locally (`npm run test:channels`); needs a live Twilio number for production traffic. WhatsApp works over the same endpoint — Twilio's `whatsapp:` sender prefix normalizes to the bound number |
| Email channel | Real inbound webhook (Mailgun signature or shared secret) + outbound via Resend/SMTP; simulated by default |
| Calendar, inbox, subscriptions | Sample data in SQLite — or **real Google Calendar + Gmail** when a user connects their Google account (Settings → Connections, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`PUBLIC_BASE_URL`). Remote data mirrors into the store so the panels show live state; every send still goes through the normal approval tiers |
| Flight search and booking | Sample inventory with fictional carriers — or **live Duffel inventory + real orders** with `DUFFEL_API_KEY` (test keys run the same code path) |
| Single-use cards, cancellations | Simulated — or **real Lithic single-use cards** with `LITHIC_API_KEY` (capped at the approved amount; the model sees only last4) |
| Orchestration | Pluggable: inline loop (default) or Temporal durable workflows (`OPA_ORCHESTRATOR=temporal`) |
| Tracing | Built-in event log plus optional Langfuse mirror (`LANGFUSE_*` env vars) |
| Multi-user | Opt-in (`OPA_MULTI_USER=1`): magic-link/OTP sign-in, per-user stores, BYOK vault, per-user agent email |
| Browser rung | Real Chromium via `playwright-core` — `browser_open`/`browser_act`/`browser_read`/`browser_close`, T3-gated, domain allowlist, CDP screencast live view + input takeover in the Browser tab, sessions revoked on kill switch |
| Site-login vault | Real — AES-256-GCM website credentials the agent fills into its own browser (`browser_login`, T3). Secrets enter only via `POST /api/credentials` (Settings → Site logins), are never in tool params/approval rows, never returned by the API, and fills fail closed if the page host doesn't match the credential site |
| Voice | Browser Web Speech STT → normal turn pipeline → ElevenLabs TTS (`ELEVENLABS_API_KEY`); mic + speaker buttons in the composer |
| Outbound calls | Simulated line (scripted transcript) — or **real calls** with `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER`/`PUBLIC_BASE_URL`: T2-gated, opens with a spoken AI disclosure, hourly cap, transcript (never audio) in the Data tab, kill switch hangs up live calls. Two-way conversation needs a realtime voice key (`OPA_REALTIME_API_KEY` or `OPENAI_API_KEY`); without it a one-way disclosed announcement plays |
| Panels | Custom dashboards declared in chat (`panel_create`/`panel_list`/`panel_delete`, T1/T0) — fixed widget types bound to real store data (calendar, inbox, subscriptions, bookings, calls, facts, approvals, usage, note), rendered in the Panels tab. No generated code; definitions are validated and capped |
| Anticipation | Deterministic rules map state to follow-ups — a flight inside 3 days yields check-in + airport-run buttons, a reservation inside 2 days offers a confirmation call, an outbound email with no reply in 48h gets a nudge button, pending approvals get a read-only review button. Buttons merge ahead of model suggestions, carry a "why", clear when stale, and run through the normal T0–T3 pipeline |
| Messaging people | `message_send` (T2 `message.send_to_contact`) emails or texts anyone — chase a contractor, nudge a vendor, confirm a detail. Validated destinations, approval first, sent email lands in the outbox so the follow-up lane can track replies |
| Proactive outreach | The batch lane also texts you — when the digest has something worth saying it goes to your bound phone (or `OWNER_PHONE`) via SMS, capped at one outbound per 4h. Twilio for real sends, simulated otherwise |
| Real-time | `GET /api/events` (SSE) pushes state signals, assistant reply deltas (the reply types out), and live call status/transcript updates. Simulated calls pace like real ones when `OPA_SIMULATED_CALL_REALTIME=1` (the demo server sets this); with Twilio the same events come from real status callbacks |
| Storage | SQLite (default) or PostgreSQL via `DATABASE_URL` — same `Store` interface, verified against Postgres 16 |
| Rate limits & headers | Fixed-window limiter on `/api/auth/*` and message/webhook routes; CSP/HSTS/security headers on every response (`server/security.ts`) |
| Eval suite | 94 deterministic tasks (`npm run eval`) |

## Run it

Requires Node 20+.

```bash
cd app
npm install
export ANTHROPIC_API_KEY=sk-ant-...
export OPA_PLANNER_MODEL=<your planner model id>
export OPA_FAST_MODEL=<your fast model id>
npm run dev            # http://localhost:5000
```

Production:

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

Or with containers — `docker compose up` inside `app/` boots the app plus a
Postgres 16 container; `app/Dockerfile` (repo-root build context) and
`app/fly.toml` cover single-process deploys. Full instructions, including
Neon/Fly and live Twilio/Mailgun setup, are in [DEPLOYMENT.md](../DEPLOYMENT.md).

Run from the `app/` directory so it can find `../spec/risk-policy/policy.example.yaml` and `../spec/open-memory-format/schema.json`, or set `POLICY_PATH` and `OMF_SCHEMA_PATH`.

### Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` | Model access | required unless `OPA_LLM_PROVIDER=openai` |
| `OPA_LLM_PROVIDER` | `anthropic` or `openai` (any OpenAI-compatible endpoint) | `anthropic` |
| `OPA_OPENAI_BASE_URL` | OpenAI-compatible base URL (vLLM: `http://localhost:8000/v1`) | `http://localhost:8000/v1` |
| `OPA_OPENAI_API_KEY` | API key for the OpenAI-compatible endpoint | none |
| `OPA_PLANNER_MODEL` | Real-time lane model | sandbox default |
| `OPA_FAST_MODEL` | Batch lane model | sandbox default |
| `OPA_TIMEZONE` | User timezone | `America/Chicago` |
| `OPA_DB_PATH` | SQLite file | `data.db` |
| `DATABASE_URL` | Postgres connection string — switches the whole store to `pg` | sqlite |
| `OPA_MULTI_USER` | `1` enables multi-tenant mode (sign-in, per-user stores, BYOK) | off — single `local` user |
| `MASTER_KEY` | Hex/base64 key encrypting stored user model keys | generated and stored in platform settings |
| `OPA_FREE_PLANNER_TURNS` | Planner turns/day for users without a BYOK key | `25` |
| `POLICY_PATH` | Risk policy YAML | `../spec/risk-policy/policy.example.yaml` |
| `OMF_SCHEMA_PATH` | OMF JSON schema | `../spec/open-memory-format/schema.json` |
| `MANDATE_SECRET` | HMAC key for mandates | generated and stored in the DB |
| `TWILIO_AUTH_TOKEN` | Verifies inbound SMS signatures | SMS disabled if unset |
| `TWILIO_ACCOUNT_SID` / `TWILIO_FROM_NUMBER` | Outbound calls via Twilio Voice | calls simulated if unset |
| `OPA_REALTIME_API_KEY` (or `OPENAI_API_KEY`) / `OPA_REALTIME_MODEL` | Two-way call audio (realtime voice model over the media stream) | one-way announcement calls |
| `PUBLIC_BASE_URL` | Public URL Twilio calls, used in signature checks | none |
| `OWNER_PHONE` | Only this E.164 number may text the agent (single-user mode) | any verified sender |
| `OPA_BACKGROUND_INTERVAL_MIN` | Run the proactive check every N minutes (all users) | off |
| `OPA_PROACTIVE_INTERVAL_MINUTES` | Run the proactive check + action buttons every N minutes | off |
| `EMAIL_CHANNEL_SECRET` | Shared secret for `POST /api/channels/email` | inbound email disabled if unset |
| `MAILGUN_SIGNING_KEY` | Alternative: verify Mailgun webhook signatures | shared-secret mode if unset |
| `OWNER_EMAIL` | Only this address may command the agent by email | inbound mail goes to inbox only |
| `AGENT_EMAIL` | The agent's own inbound address | any owner mail counts |
| `EMAIL_PROVIDER` | `simulated`, `resend`, or `smtp` | auto-detect |
| `RESEND_API_KEY` + `EMAIL_FROM` | Real outbound mail via Resend | simulated outbox |
| `SMTP_URL` (+ `EMAIL_FROM`) | Real outbound mail via any SMTP relay | simulated outbox |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL` | Mirror turns, generations, and tools to Langfuse | tracing off |
| `OPA_ORCHESTRATOR` | `inline` or `temporal` | `inline` |
| `OPA_CHROME_PATH` | Chrome/Chromium executable for the browser rung | `channel: "chrome"` auto-detect |
| `OPA_BROWSER_WS_ENDPOINT` | Remote CDP endpoint (Steel/browserless sidecar) instead of local Chrome | unset |
| `OPA_BROWSER_HEADFUL` | `1` shows the browser window instead of headless | headless |
| `OPA_BROWSER_ALLOWLIST` | Comma-separated domain suffixes (`*` = all); unset = all allowed | unset |
| `OPA_BROWSER_IDLE_MS` | Reap idle browser sessions after N ms | `600000` |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE` | Reply voice (`POST /api/voice/tts`) | voice off |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth client (Calendar + Gmail connection) — needs `PUBLIC_BASE_URL`; redirect URI is `{PUBLIC_BASE_URL}/api/connect/google/callback` | sample data |
| `DUFFEL_API_KEY` | Live flight inventory + real orders (Duffel test keys work) | sample inventory |
| `LITHIC_API_KEY` (+ `LITHIC_BASE_URL`) | Real single-use cards via Lithic | simulated cards |
| `TEMPORAL_ADDRESS` / `TEMPORAL_NAMESPACE` / `TEMPORAL_TASK_QUEUE` | Temporal connection | `localhost:7233` / `default` / `opa-agent` |

### Connect Google (real calendar + inbox)

1. In Google Cloud Console create an OAuth client (Web type) with redirect URI `{PUBLIC_BASE_URL}/api/connect/google/callback`. Enable the Calendar and Gmail APIs.
2. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_BASE_URL`, restart.
3. Each user clicks **Connect** under Settings → Connections. Their refresh token is encrypted in the same vault as BYOK keys; scopes appear on the connection row.

After connecting, `get_calendar`/`read_inbox` mirror live data into the store (deduped per `provider_ref`), `create_calendar_hold` writes a real Calendar event, and `draft_email`/`send_email` run through Gmail drafts — still under the normal approval tiers and taint escalation.

### Connect SMS

1. Buy a number in Twilio and complete A2P 10DLC registration for US traffic.
2. Set the number's incoming message webhook to `POST {PUBLIC_BASE_URL}/api/channels/sms`.
3. Set `TWILIO_AUTH_TOKEN`, `PUBLIC_BASE_URL`, and `OWNER_PHONE`, then restart.

The webhook rejects requests with an invalid `X-Twilio-Signature` and replies with TwiML. `npm run test:channels` boots a real server and verifies signed-vs-forged requests end to end — including a `whatsapp:` sender, so pointing a WhatsApp-enabled Twilio sender (sandbox or approved) at the same webhook just works.

### Use a self-hosted (vLLM) model

```bash
export OPA_LLM_PROVIDER=openai
export OPA_OPENAI_BASE_URL=http://localhost:8000/v1   # vllm serve <model> --port 8000
export OPA_PLANNER_MODEL=<your served model id>
export OPA_FAST_MODEL=<your served model id>
```

Tool calling must be enabled on the server (`--enable-auto-tool-choice --tool-call-parser <parser>` on vLLM). The OpenAI lane also works for Ollama (`http://localhost:11434/v1`), Groq, Together, or a proxy in front of several models.

### Connect email

Inbound (`POST /api/channels/email`): point your provider's inbound parse/forward webhook at the endpoint — Mailgun works out of the box (set `MAILGUN_SIGNING_KEY`), or set `EMAIL_CHANNEL_SECRET` and have the forwarder send it as the `x-opa-email-secret` header. Set `OWNER_EMAIL` and `AGENT_EMAIL` so mail from you to the agent is treated as a command and answered; everything else lands in the inbox as untrusted content.

Outbound: the default is the simulated outbox. Set `RESEND_API_KEY` + `EMAIL_FROM` or `SMTP_URL` (+ `EMAIL_FROM`) for real delivery; `send_email` uses whichever is configured.

### Multi-user mode

`OPA_MULTI_USER=1` turns the app into a multi-tenant service:

- **Sign-in is passwordless.** `/api/auth/magic-link` emails a single-use link; `/api/auth/phone/request` + `/api/auth/phone/verify` sign in by SMS code. Sessions are opaque tokens in an httpOnly cookie; only SHA-256 hashes are stored. With the simulated senders, the API returns `devLink`/`devCode` so the flow works with no mail/SMS provider.
- **Every domain table is scoped by `user_id`.** Messages, facts, approvals, bookings, settings, usage — a user can only ever see their own rows. Each user also gets their own mandate secret, so mandates cannot verify across tenants.
- **Channels bind to accounts.** Under Settings → Linked channels, a user verifies a phone number or email by code/link. Inbound SMS routes by `From`; inbound email routes by per-user agent address (`agent+<token>@<domain>`) — bound senders issue commands, everyone else lands in that user's inbox as untrusted content.
- **BYOK.** Users can store their own Anthropic/OpenAI-compatible key (`AES-256-GCM` under `MASTER_KEY`). Their key bills them; without one, `OPA_FREE_PLANNER_TURNS` caps planner turns per day on the platform key.

Single-user remains the default: `OPA_MULTI_USER` unset → every request resolves to the `local` user, `OWNER_PHONE`/`OWNER_EMAIL` gate channels, and nothing else changes.

### Temporal orchestration

The default orchestrator runs each task inline. For durable workflows — retries, timeouts, execution history across restarts — install the SDK and switch backends:

```bash
npm i @temporalio/client @temporalio/worker @temporalio/workflow @temporalio/activity
export OPA_ORCHESTRATOR=temporal TEMPORAL_ADDRESS=localhost:7233
```

Each inbound turn, approval decision, and background check becomes a workflow (`server/temporal/workflows.ts`) wrapping activities (`server/temporal/activities.ts`). A worker runs in-process; split it out for production.

### Evals and channel tests

```bash
npm run eval            # 94 deterministic tasks; no API key needed
npm run eval -- e14     # run one task (e50–m03 cover channels, tenancy, browser, vault, calls, panels, anticipation, messaging)
npm run test:channels   # signed SMS/WhatsApp + voice + email webhooks against a live server
```

The eval harness scripts the model (`setScriptedModel` in `server/agent/llm.ts`) so it tests the real machinery — policy decisions, mandate signing and verification, taint escalation, the kill switch — deterministically.

### Langfuse tracing

Set `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` (and `LANGFUSE_BASE_URL` for self-hosted) and every turn, model generation, tool call, and approval decision is mirrored to Langfuse through its ingestion API. No SDK needed.

## How the code maps to the playbook

| Playbook layer ([architecture](../docs/01-architecture.md)) | File |
| --- | --- |
| Channels | `server/routes.ts` (`/api/messages`, `/api/channels/sms`, `/api/channels/email`), `server/agent/email.ts` |
| Orchestrator | `server/agent/orchestrator.ts`, `server/temporal/` |
| Model router | `server/agent/llm.ts`, `server/agent/agent.ts` |
| Risk policy engine | `server/agent/policy.ts` |
| Tools | `server/agent/tools.ts`, `server/agent/flights.ts` |
| Vault, mandates, single-use cards | `server/agent/vault.ts` |
| Memory and OMF | `server/agent/db.ts`, `server/agent/omf.ts` |
| Tracing | `server/agent/tracing.ts`, `events` table, Activity tab |
| Control surface | `client/src/pages/agent.tsx` |
| Eval suite | `evals/tasks.ts`, `evals/run.ts`, `script/test-channels.ts` |

## Swap in real providers

- Flights: implement the `FlightProvider` interface in `server/agent/flights.ts` (for example with the Duffel API) and keep `book_flight` returning the same shape. The policy action names (`booking.create.refundable` and `booking.create.nonrefundable`) stay the same.
- Calendar and email: replace the SQLite reads in `tools.ts` with a Google Calendar or Gmail client, or an MCP server. Mark any tool that returns third-party text with `taints: true`.
- Cards: replace `issueSingleUseCard` in `vault.ts` with your issuer's single-use or merchant-locked card API.
- Policy: edit the YAML. No code change is needed to retier an action.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/auth/session` | Current sign-in state |
| POST | `/api/auth/magic-link` | `{ email }` — send a sign-in link |
| GET | `/api/auth/verify` | Consume a magic link, set the session cookie |
| POST | `/api/auth/phone/request` + `/api/auth/phone/verify` | SMS-code sign-in |
| POST | `/api/auth/logout` | End the session |
| GET | `/api/state` | Full snapshot for the UI |
| POST | `/api/messages` | `{ text }`, returns `{ reply }` |
| POST | `/api/approvals/:id` | `{ decision: "approve" or "deny", allowCategory? }` |
| POST | `/api/settings` | `{ paused?, standingLimitUsd?, revokeOptIn? }` |
| POST | `/api/background/run` | Run the proactive check now |
| GET/POST/DELETE | `/api/keys` | BYOK model keys: list providers, store (encrypted), remove |
| GET/POST | `/api/channels` + `/api/channels/bind*` | List bindings, verify a phone/email onto the account |
| GET | `/api/memory/export` | Download OMF v0.1 JSON |
| POST | `/api/memory/import` | Import an OMF v0.1 document |
| POST | `/api/memory/:id/forget` | Remove one fact |
| DELETE | `/api/memory` | Delete all memory |
| POST | `/api/reset` | Reset sample data |
| POST | `/api/channels/sms` | Twilio inbound webhook (signature-verified) |
| POST | `/api/channels/email` | Inbound email webhook (Mailgun-signed or shared secret) |

All `/api` routes except auth, `/api/health`, and the two webhooks require a session in multi-user mode.

## License

Apache-2.0, same as the repository.
