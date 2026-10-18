# Open Personal Agent: Reference App (v0.2)

A working, minimal personal agent you text. It plans with a frontier model, runs every action through the [Risk Policy](../spec/risk-policy/), asks before it spends money or acts as you, and stores memory you can export as [Open Memory Format](../spec/open-memory-format/).

This is a reference implementation of the [playbook](../docs/). It is small on purpose, so you can read all of it in an afternoon and replace any part.

## What it does

- Chat by web or SMS. Ask about your calendar, search flights, audit subscriptions, read and draft email, and tell it preferences to remember.
- Every tool call is checked against `spec/risk-policy/policy.example.yaml` before it runs. The model cannot approve anything itself.
- T2 and T3 actions create a pending approval with a 4-digit code and a 10-minute expiry. Approve in the app or reply `APPROVE 1234` by text.
- Approving signs a mandate (HMAC over the action, amount, merchant, and a hash of the exact parameters). The mandate is verified again before execution. Money moves only on a single-use card capped at the approved amount.
- Prompt-injection defense: after the agent reads email or other untrusted content, every later action in that turn is escalated one tier. The sample inbox includes a hostile email so you can watch it work.
- Kill switch: text `stop everything` (or use the switch). All actions pause, pending approvals are cancelled, and reads still work. `RESUME` turns it back on.
- Memory: facts carry provenance, scope, confidence, and expiry. Export validates against the OMF schema; import accepts any valid OMF v0.1 file.
- Two model lanes: a planner model for real-time turns and a fast model for the background check (proactive digest).
- An append-only activity log of every message, model call, policy decision, approval, and execution.

## Real vs. sample

| Part | Status |
| --- | --- |
| Agent loop, tool calling, model router | Real (Anthropic Messages API) |
| Risk policy engine, approvals, kill switch, taint escalation | Real |
| Mandate signing and verification | Real HMAC-SHA256, inspired by AP2 but not AP2-compliant |
| OMF export and import with schema validation | Real |
| SMS webhook with Twilio signature check | Built, not yet live-tested against a real number |
| Calendar, inbox, subscriptions | Sample data in SQLite |
| Flight search and booking | Sample inventory with fictional carriers; bookings are simulated |
| Single-use cards, email sending, cancellations | Simulated |
| Orchestration | A simple in-process loop, not Temporal yet |
| Tracing | The built-in event log, not Langfuse yet |
| Eval suite | Not started |

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
| `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` | Model access | required |
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

### Connect SMS

1. Buy a number in Twilio and complete A2P 10DLC registration for US traffic.
2. Set the number's incoming message webhook to `POST {PUBLIC_BASE_URL}/api/channels/sms`.
3. Set `TWILIO_AUTH_TOKEN`, `PUBLIC_BASE_URL`, and `OWNER_PHONE`, then restart.

The webhook rejects requests with an invalid `X-Twilio-Signature` and replies with TwiML.

## How the code maps to the playbook

| Playbook layer ([architecture](../docs/01-architecture.md)) | File |
| --- | --- |
| Channels | `server/routes.ts` (`/api/messages`, `/api/channels/sms`) |
| Orchestrator and model router | `server/agent/agent.ts` |
| Risk policy engine | `server/agent/policy.ts` |
| Tools | `server/agent/tools.ts`, `server/agent/flights.ts` |
| Vault, mandates, single-use cards | `server/agent/vault.ts` |
| Memory and OMF | `server/agent/db.ts`, `server/agent/omf.ts` |
| Action log | `events` table, Activity tab |
| Control surface | `client/src/pages/agent.tsx` |

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

## License

Apache-2.0, same as the repository.
