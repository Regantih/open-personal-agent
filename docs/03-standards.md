# 3. Open Standards

Build on shared protocols so agents interoperate instead of forming walled gardens.

## The Stack

| Responsibility | Standard | Status | Use it for |
| --- | --- | --- | --- |
| Agent to tools and data | **MCP** (Model Context Protocol) | Current revision 2026-07-28 made the protocol stateless ([Data Lakehouse Hub](https://datalakehousehub.com/blog/state-of-agentic-ai-standards-2026/)) | Every integration: email, calendar, bank data, travel |
| Agent to agent | **A2A** (Agent2Agent) | v1.0 in March 2026 with signed Agent Cards; joined the Agentic AI Foundation under the Linux Foundation in August 2026 ([Data Lakehouse Hub](https://datalakehousehub.com/blog/state-of-agentic-ai-standards-2026/)) | Scheduling between users' agents, group planning, merchant agents |
| Proof of user authorization | **AP2** (Agent Payments Protocol) | Uses W3C Verifiable Credentials as signed mandates ([Descope](https://www.descope.com/blog/post/developer-guide-agentic-commerce)) | Recording exactly what the user approved to spend |
| Commerce orchestration | **UCP** (Universal Commerce Protocol) | Public since January 2026; Apache 2.0; backed by Google, Shopify, and major retailers ([Descope](https://www.descope.com/blog/post/developer-guide-agentic-commerce)) | Catalog search, carts, identity linking, checkout, orders ([UCP](http://ucp.dev/)) |
| Commerce orchestration | **ACP** (Agentic Commerce Protocol) | Apache 2.0, from OpenAI and Stripe; scope narrowed toward product discovery in March 2026 ([Agentic AI Foundation](https://aaif.io/blog/how-does-agentic-commerce-work)) | Merchant discovery and checkout where supported |
| Machine payments | **x402** | Contributed by Coinbase to an x402 Foundation at the Linux Foundation, operational since July 2026 ([Data Lakehouse Hub](https://datalakehousehub.com/blog/state-of-agentic-ai-standards-2026/)) | Paying per call for APIs and content |
| Agent identity on websites | Trusted Agent Protocol, Web Bot Auth | Emerging ([Agentic AI Foundation](https://aaif.io/blog/how-does-agentic-commerce-work)) | Identifying your agent to sites without a commerce protocol |

## How They Fit Together

```
User intent
  -> Orchestrator plans the task
  -> MCP tools read context (calendar, email, preferences)
  -> A2A delegates to other agents (a friend's agent, a merchant agent)
  -> UCP or ACP builds the cart and checkout
  -> AP2 mandate proves the user approved this amount and scope
  -> Card network token or single-use card settles the payment
```

## Gaps No Open Standard Covers Yet

These are the most valuable places for the open community to contribute:

1. **Limited payment credentials.** Issuing scoped, agent-specific credentials is proprietary today; there is no open standard ([Agentic AI Foundation](https://aaif.io/blog/how-does-agentic-commerce-work)).
2. **Portable agent memory.** No common format lets a user move what one agent knows to another. This repository proposes the [Open Memory Format](../spec/open-memory-format/) as a starting point.
3. **Cross-agent permission scopes.** A2A covers discovery and delegation; there is no shared vocabulary for "my colleague's agent may see my work calendar but not my inbox." The [Open Memory Format](../spec/open-memory-format/) includes a draft scope vocabulary.
4. **Action logs users can audit.** No standard format for an agent's action history that a user can export or a third party can verify.
