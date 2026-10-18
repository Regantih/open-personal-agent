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

- [x] Web chat channel and SMS webhook with Twilio signature check (SMS not yet live-tested)
- [ ] Email channel on an owned domain
- [x] Orchestrator loop with the risk-policy engine (simple in-process loop; Temporal not yet)
- [x] Model router with a real-time planner lane and a fast batch lane
- [ ] Self-hosted (vLLM) model option in the router
- [x] Calendar tool and flight-search tool (sample data behind provider interfaces; real calendar via MCP still to do)
- [x] T3 confirmation flow with signed mandate records and single-use cards (simulated issuer)
- [x] Prompt-injection taint escalation and kill switch
- [x] Memory stored and exported in OMF, with validated import
- [x] Action log of every model call, policy decision, approval, and execution
- [ ] Langfuse tracing
- [ ] 50-task eval suite

## v0.3: Voice and Payments

- [ ] Voice via LiveKit Agents or Pipecat
- [ ] Single-use card integration behind the vault interface
- [ ] AP2 mandate generation and verification
- [ ] Browser rung using Steel Browser with human takeover

## v0.4: Agent Network

- [ ] A2A Agent Card for each user's agent
- [ ] Cross-agent scheduling using OMF `people.shared_scopes`
- [ ] Out-of-scope request notifications

## Open Calls for Help

- Signed OMF export envelope and deletion receipts
- A shared, public eval suite of real personal-agent tasks
- A shared action-log export format
