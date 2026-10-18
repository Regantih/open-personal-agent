# 0. Why Open

## The market is concentrating fast

- Instinct, a personal agent reached by text, call, or email, raised $1B at a $10B valuation about a year after founding ([Reuters](https://www.reuters.com/pt/tecnologia/YJK5QKMPVRO23EHRHIOACCOZZM-2026-09-28)).
- Its founder reported annualized transaction volume above $1B from just over 100,000 users, about half from travel ([36Kr](https://eu.36kr.com/en/p/4019986928029832)).
- Meta launched Muse, a competing personal agent, and integrated Stripe's agent wallet so Muse can shop across the internet ([Stripe](https://stripe.com/newsroom/news/stripe-helps-meta-muse-shop-with-link)).

The product works, and capital is moving quickly. That is exactly when a market tends to lock in around a few owners.

## Code is not the main control point

The software for a personal agent can be built by a small team with today's models and open-source tools. The durable control points sit elsewhere:

| Control point | Why it matters | Current state |
| --- | --- | --- |
| **Messaging channels** | Agents live where people already text | iMessage has no official API. WhatsApp barred general-purpose AI assistants from its Business API from January 15, 2026 ([Economic Times](https://economictimes.indiatimes.com/tech/artificial-intelligence/meta-bans-general-purpose-ai-chatbots-from-whatsapp-business-platform/articleshow/124683946.cms)); the EU forced access back open only in the EEA ([European Commission](https://ec.europa.eu/commission/presscorner/api/files/document/print/en/ip_26_1276/IP_26_1276_EN.pdf)) |
| **Payment credentials** | Agents that cannot pay cannot finish tasks | Checkout and consent have open protocols, but "provide limited payment credentials" has no open standard yet ([Agentic AI Foundation](https://aaif.io/blog/how-does-agentic-commerce-work)) |
| **User memory** | The agent that knows you best is hardest to leave | Instinct reports that users who connect sensitive data retain at about 80% ([36Kr](https://eu.36kr.com/en/p/4019986928029832)); no portable memory format exists |
| **Compute** | Background, always-on agents are compute hungry | Instinct's founder spends about 40% of his time on compute, and short-notice capacity can cost 3x to 4x ([36Kr](https://eu.36kr.com/en/p/4019986928029832)) |
| **Commerce partnerships** | Commissions fund free agents | Travel, dining, and ride APIs require partner approval |

## What openness can realistically do

1. **Remove the knowledge barrier.** Publish the architecture, failure modes, and safety patterns so any team can build a competent agent.
2. **Make memory portable.** If users can export their agent memory in a common format, no agent owns its users. This is the single highest-leverage contribution. See the [Open Memory Format](../spec/open-memory-format/).
3. **Default to open protocols.** Agents built on MCP, A2A, AP2, and UCP or ACP can interoperate instead of forming walled gardens.
4. **Build on owned channels.** SMS, email, and voice run on open networks. Treat gatekept channels as add-ons.
5. **Pool what individuals cannot.** Shared eval suites, shared site-automation knowledge, and coordinated standards work.

## What openness cannot do alone

- It does not give anyone iMessage or WhatsApp access; that takes regulation or platform policy change.
- It does not create GPU capacity or partner contracts.
- An open agent that holds cards and logins is also useful to fraudsters. That is why the safety defaults in [Trust and Safety](04-trust-and-safety.md) are part of the playbook, not an appendix.
