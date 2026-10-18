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

## v0.2: Minimal Reference Implementation

- [ ] SMS and email gateway on an owned domain
- [ ] Temporal-based orchestrator with the risk-policy engine
- [ ] Model router with at least one hosted and one self-hosted (vLLM) model
- [ ] Calendar MCP tool and flight-search tool
- [ ] T3 confirmation flow with mandate records
- [ ] Memory stored and exported in OMF
- [ ] Langfuse tracing and a 50-task eval suite

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
