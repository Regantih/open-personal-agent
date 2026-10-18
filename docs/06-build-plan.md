# 6. Build Plan

A phased plan for a small team building on the open stack. Each phase has exit criteria; do not advance without meeting them.

## Phase 0: Foundations (weeks 0 to 6)

- **Channels:** SMS and email on an owned domain.
- **Runtime:** Temporal, a model router, Langfuse tracing.
- **Actions:** calendar via MCP, flight search, Steel Browser for long-tail sites.
- **Trust:** risk-policy engine, event log, vault; every T2 and T3 action approved by a human operator.
- **Data:** Postgres system of record; memory stored in the Open Memory Format.
- **Exit criteria:** 20 design-partner users complete 100 real tasks with zero unauthorized actions, and every user can export their memory.

## Phase 1: Private Beta (months 2 to 4)

- Voice via LiveKit Agents or Pipecat; proactive calls for urgent items only.
- Payments: user-approved wallet first, then single-use cards; AP2-style mandates for every T3 approval.
- Bank data for subscription audits.
- Hotels and rides; partner applications submitted.
- Compliance: start the Google CASA assessment and SOC 2 Type I.
- **Exit criteria:** 150 users; at least 30% grant payment access by week 4 (Instinct reports about 40% after roughly three weeks, per [36Kr](https://eu.36kr.com/en/p/4003952149663618)); task success rate tracked by evals.

## Phase 2: Invite-Only Growth (months 4 to 8)

- Batch lane and routing of extraction and classification to self-hosted open-weight models (vLLM or SGLang).
- A2A-based scheduling between users' agents, with per-relationship scopes.
- Commission ledger live across travel and dining partners.
- Android containers for the top mobile-only apps.
- **Exit criteria:** positive contribution margin per active user after compute and human operations.

## Phase 3: Scale (months 8 to 12)

- Reserved GPU capacity for the batch lane; multi-provider failover.
- iMessage via two relay vendors; WhatsApp where policy allows.
- UCP or ACP checkout with merchants that support them.
- SOC 2 Type II.

## Team

| Role | Owns | When |
| --- | --- | --- |
| Agent research lead | Orchestrator, planning, computer-use reliability, evals | Day 0 |
| Infrastructure engineers (2) | Browser and Android fleets, scheduler, capacity | Phase 0 |
| Integrations engineers (2) | MCP tools, travel and commerce APIs | Phase 0 |
| Security engineer | Vault, policy engine, injection defense, CASA, SOC 2 | Phase 0 |
| Conversational product designer | Tone, review pages, confirmation flows | Phase 0 |
| Human operators | The last rung of the action ladder; labeled data for evals | Phase 0 |
| Voice engineer | Voice pipeline and latency | Phase 1 |
| Partnerships lead | Travel, dining, and merchant commissions | Phase 1 |

## Unit Economics Checks

Track these weekly from Phase 1:

- Compute cost per active user per day, split by real-time and batch lanes.
- Human-operator minutes per completed task.
- Gross transaction volume per user and realized commission rate.
- Share of tasks completed on each rung of the action ladder (higher rungs are cheaper and more reliable).

For reference, Instinct's founder considered a $100 per month subscription and chose a free, commission-funded model instead ([36Kr](https://eu.36kr.com/en/p/4019986928029832)). An open deployment can choose either; the metrics above tell you whether the choice works.
