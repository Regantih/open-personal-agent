# 1. Reference Architecture

![Reference architecture](assets/reference-architecture.png)

A personal agent has four layers and two cross-cutting planes. Every proposed action passes the trust plane before it executes, and every result is written to memory and the audit log.

## Layer 1: Channel Gateway

Normalizes every conversation into one internal message format tied to a stable user identity.

- **Inbound:** SMS/RCS, email, voice, and optionally iMessage and WhatsApp. Each message arrives by webhook, is resolved to a user, and is written to the event log before any processing.
- **Outbound:** replies go to the channel the user last used, unless urgency rules say to call. Example pattern: calling at 2:55 p.m. about a document that must be signed by 3 p.m. ([36Kr interview](https://eu.36kr.com/en/p/4003952149663618)).
- **Voice pipeline:** SIP trunk, streaming speech-to-text with turn detection, the language model, then streaming text-to-speech. Target sub-second round trips; Pipecat documents 500 to 800 ms as typical ([Pipecat docs](https://docs.pipecat.ai/overview/pipecat)). Voice matters: some Instinct users complete over 90% of interactions by voice ([36Kr](https://eu.36kr.com/en/p/4019986928029832)).
- **Review pages:** for complex plans such as trips, generate a signed, expiring web page the user can review and edit, rather than forcing long text threads.

## Layer 2: Agent Runtime

- **Orchestrator.** Each request becomes a durable workflow that can plan, call tools, wait hours or days for a reply or approval, and resume after a crash. Long tasks are normal: one reported task ran about 18 hours across organizers, customer service, and video staff ([36Kr](https://eu.36kr.com/en/p/4019986928029832)).
- **Scheduler with two lanes.** A real-time lane for users who are waiting, with reserved capacity. A batch lane for background work (inbox triage, order tracking, price watches). Batching background work reportedly improves efficiency 3x to 8x for some tasks ([36Kr](https://eu.36kr.com/en/p/4019986928029832)).
- **Model router.** A policy table mapping task type to model tier: frontier models for planning and ambiguity, small or open-weight models for extraction, classification, and summarization. Log every routing decision so evals can prove a cheaper tier holds quality.

## Layer 3: Action Layer (the action ladder)

Always try the most reliable rung first; fall down the ladder only when needed.

1. **Native APIs and protocols.** Flights, hotels, rides, dining, and merchants that support UCP or ACP. Most reliable, often commission-bearing.
2. **OAuth integrations.** Email, calendar, bank data, music, and similar, exposed to the agent as MCP tools.
3. **Browser fleet.** Isolated cloud browser sessions with saved, user-authorized logins, for sites with no API.
4. **Android fleet.** Containerized Android devices for mobile-only apps.
5. **Human operator.** Takes over edge cases or stuck tasks. Human actions are logged exactly like agent actions and become training and eval data.

## Layer 4: Data and State

- **Personal memory graph.** People, preferences, habits, accounts, and past decisions. Every fact carries source, consent scope, confidence, and expiry. Must be exportable in the [Open Memory Format](../spec/open-memory-format/).
- **Secrets and PII vault.** Card tokens, site credentials, and one-time-code routing, isolated from model context. Models receive references, never raw card numbers or passwords.
- **Event log.** Append-only record of every message, tool call, approval, and payment. Used for debugging, disputes, user transparency, and evals.

## Plane: Trust and Policy

- Risk-tier policy engine (T0 read through T3 money or irreversible). See [Trust and Safety](04-trust-and-safety.md) and the [Risk Policy spec](../spec/risk-policy/).
- Permission graph: scopes per person and per relationship. Instinct describes sharing nearly everything with a spouse but only a work calendar with a colleague, and alerting the user when someone requests out-of-scope information ([36Kr interview](https://eu.36kr.com/en/p/4003952149663618)).
- Prompt-injection scanning on every untrusted input (email, web pages, attachments, other agents' messages).
- Spend limits enforced twice: in policy and at the card or token level.

## Plane: Commerce and Platform

- Payments: user-approved wallets, single-use cards, and signed AP2 mandates. See [Standards](03-standards.md).
- Commission ledger: attributes each booking or purchase to a partner and expected commission.
- Observability and evals: traces of every step, replayable task suites, regression gates on model or prompt changes.
- Capacity planning: multiple inference providers, reserved capacity for the real-time lane, batch or spot capacity for background work.

## One Request End to End

"I land in New York tonight, handle it."

1. A voice note arrives over SMS or iMessage. The gateway transcribes it and logs the event.
2. The orchestrator starts a workflow; the router sends planning to a frontier model.
3. Memory supplies airline, seat, hotel, and ground-transport preferences, plus the calendar.
4. Action ladder: flight search via a flights API, hotel via a lodging API, transfer via a rides API.
5. Policy marks the flight and hotel as T3 and sends a review page with one-tap confirmation.
6. On approval, a signed mandate and a single-use card scoped to the amount are created; bookings complete.
7. Calendar updates; the commission ledger records attribution; the batch lane schedules flight-status checks and a pickup reminder.
8. Every step is visible to the user in their action log and exportable with their memory.
