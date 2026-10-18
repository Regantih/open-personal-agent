# 2. Open Stack

An open-source option for every layer, with commercial services as optional plug-ins. Licenses were read from each project's GitHub repository metadata in October 2026; always confirm the license file yourself before commercial use.

## Open-Source Components

| Layer | Need | Project | License | Notes |
| --- | --- | --- | --- | --- |
| Runtime | Durable workflows | [Temporal](https://github.com/temporalio/temporal) | MIT | Long-lived workflows that wait for approvals and survive crashes ([Temporal docs](https://docs.temporal.io/ai)) |
| Runtime | Stateful agent framework | [Letta](https://github.com/letta-ai/letta) | Apache-2.0 | Stateful agents with built-in memory management |
| Models | Self-hosted inference | [vLLM](https://github.com/vllm-project/vllm) | Apache-2.0 | Serve open-weight models for the cheap tier and batch lane |
| Models | Self-hosted inference | [SGLang](https://github.com/sgl-project/sglang) | Apache-2.0 | Alternative serving engine |
| Voice | Real-time media server | [LiveKit](https://github.com/livekit/livekit) | Apache-2.0 | WebRTC and SIP media |
| Voice | Voice agent framework | [LiveKit Agents](https://github.com/livekit/agents) | Apache-2.0 | Agents can place and receive calls via SIP ([LiveKit docs](https://docs.livekit.io/agents.md)) |
| Voice | Voice agent framework | [Pipecat](https://github.com/pipecat-ai/pipecat) | BSD-2-Clause | 150+ service integrations, 500 to 800 ms typical round trip ([Pipecat docs](https://docs.pipecat.ai/overview/pipecat)) |
| Voice | Speech-to-text | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | MIT | Self-hosted transcription |
| Voice | Text-to-speech | [Kokoro](https://github.com/hexgrad/kokoro) | Apache-2.0 | Small open TTS model |
| Action | Cloud browsers | [Steel Browser](https://github.com/steel-dev/steel-browser) | Apache-2.0 | Self-hostable browser sessions; persistent profiles and live human takeover ([Steel](https://steel.dev/)) |
| Action | Browser agent | [Browser Use](https://github.com/browser-use/browser-use) | MIT | LLM-driven browser control |
| Action | Browser agent | [Stagehand](https://github.com/browserbase/stagehand) | MIT | Browser automation with natural-language steps |
| Action | Sandboxes and desktops | [E2B](https://github.com/e2b-dev/E2B) | Apache-2.0 | Sandboxed Linux desktops for computer use ([E2B docs](https://docs.e2b.dev/use-cases/computer-use)) |
| Action | Android in containers | [docker-android](https://github.com/budtmo/docker-android) | Custom Apache-2.0 with amendments | Review the amendments on forks and data processing before commercial use |
| Action | Tool connectivity | [MCP SDKs and spec](https://github.com/modelcontextprotocol/modelcontextprotocol) | See repository | Expose every integration as an MCP tool |
| Data | Agent memory | [Mem0](https://github.com/mem0ai/mem0) | Apache-2.0 | User, session, and agent memory |
| Data | Temporal knowledge graph | [Graphiti](https://github.com/getzep/graphiti) | Apache-2.0 | Facts that change over time, with provenance |
| Platform | Tracing and evals | [Langfuse](https://github.com/langfuse/langfuse) | MIT core | Core features remain MIT after the ClickHouse acquisition ([ClickHouse](https://clickhouse.com/blog/clickhouse-acquires-langfuse-open-source-llm-observability)) |
| Commerce | Agent-to-agent | [A2A](https://github.com/a2aproject/A2A) | Apache-2.0 | See [Standards](03-standards.md) |
| Commerce | Payment mandates | [AP2](https://github.com/google-agentic-commerce/AP2) | Apache-2.0 | Signed user authorizations |
| Commerce | Checkout | [UCP](https://github.com/Universal-Commerce-Protocol/ucp) | Apache-2.0 | Discovery through order management |
| Commerce | Checkout | [ACP](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol) | Apache-2.0 | Agent checkout with merchants |

## Where Open Source Runs Out

Some layers need a licensed service or a partner relationship. Commercial options documented in public vendor material:

| Need | Commercial options | Notes |
| --- | --- | --- |
| Phone numbers, SMS, SIP | [Telnyx](https://telnyx.com/products/voice-api), [Twilio](https://www.twilio.com/en-us/voice/fact-sheet) | Carrier access cannot be self-hosted; US A2P registration applies |
| iMessage relay | [Sendblue](https://www.sendblue.com/api), [Linq](https://linqapp.com/blog/imessage-for-agents), [LoopMessage](https://loopmessage.com/) | No official Apple API; keep SMS fallback |
| Agent email inbox | [AgentMail](https://docs.agentmail.to/knowledge-base/inbox-capabilities) | Or self-host mail on your own domain |
| Hosted browsers at scale | [Browserbase](https://www.browserbase.com/industry/ai), [Anchor Browser](https://docs.anchorbrowser.io/introduction) | Useful when self-hosted fleets hit bot detection |
| Cloud Android | [Genymotion Cloud](https://www.genymotion.com/android-cloud/) | API-controlled virtual devices |
| Low-latency STT/TTS | [Deepgram](https://deepgram.com/product/speech-to-text), [Cartesia](https://www.cartesia.ai/sonic/), [ElevenLabs](https://elevenlabs.io/docs/overview/capabilities/text-to-speech) | Typically better latency and quality than self-hosted today |
| Frontier models | Anthropic, OpenAI, Google computer-use APIs ([Anthropic](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool), [OpenAI](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use), [Google](https://ai.google.dev/gemini-api/docs/computer-use)) | Use behind a router so they stay swappable |
| Bank data | [Plaid](https://plaid.com/docs/api/products/transactions/) | Powers subscription audits |
| Card issuing | [Stripe Issuing](https://docs.stripe.com/issuing/agents), [Lithic](https://www.lithic.com/card-issuing) | Licensed financial infrastructure |
| Travel inventory | [Duffel](https://duffel.com/flights/book) flights, [Expedia Rapid](https://partner.expediagroup.com/en-us/solutions/build-your-travel-experience/rapid-api) lodging | Amadeus Self-Service keys were disabled July 17, 2026 ([AirLabs](https://airlabs.co/amadeus-self-service-api-shutdown)) |
| Rides, dining | [Uber Ride Request API](https://developer.uber.com/docs/riders/ride-requests/tutorials/api/best-practices), [OpenTable APIs](https://www.opentable.com/restaurant-solutions/api-partners/faqs/) | Partner or scope approval required |
| Compliance | [Vanta](https://www.vanta.com/products/soc-2) for SOC 2; [Google CASA](https://support.google.com/cloud/answer/13465431?hl=en) for Gmail restricted scopes | CASA is annual and mandatory for restricted scopes |

## Anti-Lock-In Rules

1. Put every model behind the router; never call a provider directly from task code.
2. Put every integration behind an MCP tool interface.
3. Keep the system of record (users, memory, events) in your own Postgres, not inside a vendor.
4. Store memory in, or exportable to, the [Open Memory Format](../spec/open-memory-format/).
5. Keep payment consent as signed mandates you can verify independently of any one wallet.
