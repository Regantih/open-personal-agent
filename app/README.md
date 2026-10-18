# Open Personal Agent: Reference App (v0.2)

A working, minimal personal agent you text. It plans with a frontier model, runs every action through the [Risk Policy](../spec/risk-policy/), asks before it spends money or acts as you, and stores memory you can export as [Open Memory Format](../spec/open-memory-format/).

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
- A 50-task eval suite (`npm run eval`) exercises the whole pipeline — policy, approvals, taint escalation, kill switch, memory — with a scripted model, no API key needed.

## Real vs. sample

| Part | Status |
| --- | --- |
| Agent loop, tool calling, model router | Real (Anthropic Messages API, or any OpenAI-compatible endpoint incl. self-hosted vLLM) |
| Risk policy engine, approvals, kill switch, taint escalation | Real |
| Mandate signing and verification | Real HMAC-SHA256 over AP2-shaped intent + payment objects |
| OMF export and import with schema validation | Real |
| SMS webhook with Twilio signature check | Verified end-to-end locally (`npm run test:channels`); needs a live Twilio number for production traffic |
| Email channel | Real inbound webhook (Mailgun signature or shared secret) + outbound via Resend/SMTP; simulated by default |
| Calendar, inbox, subscriptions | Sample data in SQLite |
| Flight search and booking | Sample inventory with fictional carriers; bookings are simulated |
| Single-use cards, cancellations | Simulated |
| Orchestration | Pluggable: inline loop (default) or Temporal durable workflows (`OPA_ORCHESTRATOR=temporal`) |
| Tracing | Built-in event log plus optional Langfuse mirror (`LANGFUSE_*` env vars) |
| Eval suite | 50 deterministic tasks (`npm run eval`) |

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
| `POLICY_PATH` | Risk policy YAML | `../spec/risk-policy/policy.example.yaml` |
| `OMF_SCHEMA_PATH` | OMF JSON schema | `../spec/open-memory-format/schema.json` |
| `MANDATE_SECRET` | HMAC key for mandates | generated and stored in the DB |
| `TWILIO_AUTH_TOKEN` | Verifies inbound SMS signatures | SMS disabled if unset |
| `PUBLIC_BASE_URL` | Public URL Twilio calls, used in signature checks | none |
| `OWNER_PHONE` | Only this E.164 number may text the agent | any verified sender |
| `OPA_BACKGROUND_INTERVAL_MIN` | Run the proactive check every N minutes | off |
| `EMAIL_CHANNEL_SECRET` | Shared secret for `POST /api/channels/email` | inbound email disabled if unset |
| `MAILGUN_SIGNING_KEY` | Alternative: verify Mailgun webhook signatures | shared-secret mode if unset |
| `OWNER_EMAIL` | Only this address may command the agent by email | inbound mail goes to inbox only |
| `AGENT_EMAIL` | The agent's own inbound address | any owner mail counts |
| `EMAIL_PROVIDER` | `simulated`, `resend`, or `smtp` | auto-detect |
| `RESEND_API_KEY` + `EMAIL_FROM` | Real outbound mail via Resend | simulated outbox |
| `SMTP_URL` (+ `EMAIL_FROM`) | Real outbound mail via any SMTP relay | simulated outbox |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL` | Mirror turns, generations, and tools to Langfuse | tracing off |
| `OPA_ORCHESTRATOR` | `inline` or `temporal` | `inline` |
| `TEMPORAL_ADDRESS` / `TEMPORAL_NAMESPACE` / `TEMPORAL_TASK_QUEUE` | Temporal connection | `localhost:7233` / `default` / `opa-agent` |

### Connect SMS

1. Buy a number in Twilio and complete A2P 10DLC registration for US traffic.
2. Set the number's incoming message webhook to `POST {PUBLIC_BASE_URL}/api/channels/sms`.
3. Set `TWILIO_AUTH_TOKEN`, `PUBLIC_BASE_URL`, and `OWNER_PHONE`, then restart.

The webhook rejects requests with an invalid `X-Twilio-Signature` and replies with TwiML. `npm run test:channels` boots a real server and verifies signed-vs-forged requests end to end.

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

### Temporal orchestration

The default orchestrator runs each task inline. For durable workflows — retries, timeouts, execution history across restarts — install the SDK and switch backends:

```bash
npm i @temporalio/client @temporalio/worker @temporalio/workflow @temporalio/activity
export OPA_ORCHESTRATOR=temporal TEMPORAL_ADDRESS=localhost:7233
```

Each inbound turn, approval decision, and background check becomes a workflow (`server/temporal/workflows.ts`) wrapping activities (`server/temporal/activities.ts`). A worker runs in-process; split it out for production.

### Evals and channel tests

```bash
npm run eval            # 50 deterministic tasks; no API key needed
npm run eval -- e14     # run one task
npm run test:channels   # signed SMS + email webhooks against a live server
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
| GET | `/api/state` | Full snapshot for the UI |
| POST | `/api/messages` | `{ text }`, returns `{ reply }` |
| POST | `/api/approvals/:id` | `{ decision: "approve" or "deny", allowCategory? }` |
| POST | `/api/settings` | `{ paused?, standingLimitUsd?, revokeOptIn? }` |
| POST | `/api/background/run` | Run the proactive check now |
| GET | `/api/memory/export` | Download OMF v0.1 JSON |
| POST | `/api/memory/import` | Import an OMF v0.1 document |
| POST | `/api/memory/:id/forget` | Remove one fact |
| DELETE | `/api/memory` | Delete all memory |
| POST | `/api/reset` | Reset sample data |
| POST | `/api/channels/sms` | Twilio inbound webhook |
| POST | `/api/channels/email` | Inbound email webhook (Mailgun-signed or shared secret) |

## License

Apache-2.0, same as the repository.
