# Roadmap

## v0.1: Playbook (this release)

- [x] Reference architecture and diagram
- [x] Open-source-first stack with licenses
- [x] Standards map and gaps
- [x] Trust and safety defaults
- [x] Channels and gatekeepers map
- [x] Phased build plan
- [x] Open Memory Format v0.1 draft with schema, example, and validator
- [x] Risk Policy v0.1 draft

## v0.2: Minimal Reference Implementation ([app/](app/))

- [x] Web chat channel and SMS webhook with Twilio signature check (verified locally via `npm run test:channels`; needs a live Twilio number for production traffic)
- [x] Email channel on an owned domain (inbound webhook with Mailgun signature or shared-secret auth; outbound via Resend/SMTP or simulated outbox)
- [x] Orchestrator loop with the risk-policy engine (inline by default; Temporal durable-workflow backend via `OPA_ORCHESTRATOR=temporal`)
- [x] Model router with a real-time planner lane and a fast batch lane
- [x] Self-hosted (vLLM) model option in the router (`OPA_LLM_PROVIDER=openai`, any OpenAI-compatible endpoint)
- [x] Calendar tool and flight-search tool (sample data behind provider interfaces; real calendar via MCP still to do)
- [x] T3 confirmation flow with AP2-shaped signed mandate records and single-use cards (simulated issuer)
- [x] Prompt-injection taint escalation and kill switch
- [x] Memory stored and exported in OMF, with validated import
- [x] Action log of every model call, policy decision, approval, and execution
- [x] Langfuse tracing (optional, via `LANGFUSE_*` env vars)
- [x] 50-task eval suite (`npm run eval`)

## v0.2.5: Multi-user foundation

- [x] Opt-in multi-tenant mode (`OPA_MULTI_USER=1`): `user_id` scoping on every domain table behind a `Store` interface; single-user `local` mode unchanged by default
- [x] Passwordless auth: email magic links + SMS OTP, hashed session tokens, sign-in UI
- [x] Channel bindings: inbound SMS routes by bound `From` number; inbound email routes by per-user `agent+<token>@` address
- [x] BYOK vault: user model keys AES-256-GCM encrypted at rest, per-turn credential resolution, usage metering + free-tier turn cap
- [x] Per-user mandate secrets — a mandate cannot verify across tenants
- [x] Tenancy eval suite (t01–t08): isolation, bindings, auth tokens, BYOK, usage, sessions
- [ ] Postgres store driver (the `Store` interface is async so this is a drop-in)
- [ ] Deploy story (Dockerfile/fly.toml), real Twilio A2P number, inbound email on an owned domain

## v0.3: Voice and Payments

- [ ] Voice via LiveKit Agents or Pipecat
- [ ] Single-use card integration behind the vault interface
- [ ] AP2 mandate generation and verification (v0.2 signs AP2-shaped intent/payment objects with HMAC; asymmetric AP2 signatures and verifiable credentials still to do)
- [ ] Browser rung using Steel Browser with human takeover

## v0.4: Agent Network

- [ ] A2A Agent Card for each user's agent
- [ ] Cross-agent scheduling using OMF `people.shared_scopes`
- [ ] Out-of-scope request notifications

## Open Calls for Help

- Signed OMF export envelope and deletion receipts
- A shared, public eval suite of real personal-agent tasks
- A shared action-log export format
