# 5. Channels and Gatekeepers

Personal agents win by living where people already communicate. Some of those places are open networks; others are controlled by a single company.

## Channel Map

| Channel | Openness | How to connect | Risks |
| --- | --- | --- | --- |
| **SMS / RCS** | Open carrier network | Carrier APIs such as [Telnyx](https://telnyx.com/products/voice-api) or [Twilio](https://www.twilio.com/en-us/voice/fact-sheet) | US A2P 10DLC registration; carrier filtering |
| **Voice** | Open telephone network | SIP trunk plus [LiveKit Agents](https://docs.livekit.io/agents.md) or [Pipecat](https://docs.pipecat.ai/overview/pipecat) | Call-consent and recording laws; robocall rules |
| **Email** | Open protocol | Own domain mail server, or [AgentMail](https://docs.agentmail.to/knowledge-base/inbox-capabilities) | Deliverability and spam reputation |
| **iMessage** | Closed; no official Apple API | Third-party relays such as [Sendblue](https://www.sendblue.com/api), [Linq](https://linqapp.com/blog/imessage-for-agents), or [LoopMessage](https://loopmessage.com/), or a self-run Mac relay | Platform can break relays at any time; keep SMS fallback |
| **WhatsApp** | Closed and policy-restricted | WhatsApp Business API | General-purpose AI assistants barred from January 15, 2026 ([Economic Times](https://economictimes.indiatimes.com/tech/artificial-intelligence/meta-bans-general-purpose-ai-chatbots-from-whatsapp-business-platform/articleshow/124683946.cms)); EU interim measures restored free access in the EEA ([European Commission](https://ec.europa.eu/commission/presscorner/api/files/document/print/en/ip_26_1276/IP_26_1276_EN.pdf)), effective July 13, 2026 ([Tech Times](https://www.techtimes.com/articles/320553/20260715/eu-antitrust-order-reopens-whatsapp-chatgpt-setting-precedent-ai-markets.htm)); elsewhere still unavailable for ChatGPT as of October 2026 ([Blueticks](https://blueticks.co/blog/chatgpt-whatsapp)) |

**Recommendation:** launch on SMS, voice, and email, which no single company can switch off. Add iMessage through two relay vendors with automatic SMS fallback. Add WhatsApp only where policy allows.

## Compliance Gates

| Gate | Trigger | Lead time guidance |
| --- | --- | --- |
| Google CASA security assessment | Requesting restricted Gmail scopes; annual ([Google](https://support.google.com/cloud/answer/13465431?hl=en)) | Start before public launch; begin with Calendar and less sensitive scopes |
| Uber `request` scope approval | Booking rides for users ([Uber Developers](https://developer.uber.com/docs/riders/ride-requests/tutorials/api/best-practices)) | Apply early; use deep links meanwhile |
| Card program obligations | Issuing cards to agents ([Stripe Issuing for agents](https://docs.stripe.com/issuing/agents)) | Access by application |
| SOC 2 | Partners and enterprise buyers ask for it | Type I early; Type II needs an observation period |
| Telephony rules | Outbound calls and texts | Consent capture from day one |

## Policy Advocacy

Gatekept channels are a policy problem, not a code problem. The EU case on WhatsApp shows that regulators will act when a platform excludes rival assistants ([European Commission](https://ec.europa.eu/commission/presscorner/api/files/document/print/en/ip_26_1276/IP_26_1276_EN.pdf)). Contributors are encouraged to document channel-access problems in this repository's issues so there is a shared, public record.
