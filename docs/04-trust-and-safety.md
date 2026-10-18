# 4. Trust and Safety

A personal agent can read your email, log into your accounts, and spend your money. Every implementation built from this playbook should ship with these defaults turned on. They are deliberately conservative; users can relax them, but the software should never start permissive.

## Risk Tiers

| Tier | Examples | Default rule |
| --- | --- | --- |
| **T0 Read** | Read inbox, check calendar, search flights, look up a balance | Allowed within the scopes the user granted |
| **T1 Reversible write** | Calendar holds, drafts, saved carts, reminders | Allowed; included in the daily summary |
| **T2 Acts as the user** | Sending email or messages as the user, refundable bookings, contacting a business | Allowed only after the user opts in per category |
| **T3 Money or irreversible** | Non-refundable purchases, payments, subscription cancellations, sharing data with third parties | Explicit confirmation every time, until the user sets a standing limit |

The tiers are expressed in a machine-readable policy file: see the [Risk Policy spec](../spec/risk-policy/).

Model vendors set the same expectation. Anthropic recommends human confirmation for consequential actions such as financial transactions ([Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)), and Google's computer-use safety policies restrict autonomous messaging and purchases ([Google AI for Developers](https://ai.google.dev/gemini-api/docs/computer-use)).

## Ten Defaults

1. **Confirm money.** Every T3 action shows the amount, merchant, refundability, and payment method before execution.
2. **Bind approval to the exact action.** Record approvals as signed mandates (for example, AP2) tied to amount and merchant, so an approval cannot be reused for a different purchase.
3. **Single-use or scoped credentials.** Prefer single-use virtual cards or tokens scoped to the approved amount. Stripe's agent wallet, for example, shares credentials only after user approval and can issue a single-use card per purchase ([Stripe](https://stripe.com/newsroom/news/stripe-helps-meta-muse-shop-with-link)).
4. **Models never see secrets.** Card numbers, passwords, and one-time codes live in a vault; the model handles references only.
5. **Treat all fetched content as untrusted.** Emails, web pages, attachments, and other agents' messages are data, never instructions. Scan them for injection before they reach the planner, and never let content from an untrusted source trigger a T2 or T3 action without user confirmation.
6. **Least-privilege scopes.** Request the narrowest OAuth scopes that work and expand only when a task needs it. Users can revoke any permission at any time; Instinct's founder describes withdrawable, user-paced authorization as a core principle ([36Kr interview](https://eu.36kr.com/en/p/4003952149663618)).
7. **Per-relationship permissions.** Other people's agents get explicit scopes (for example, work calendar only), and out-of-scope requests trigger a notification to the user.
8. **Complete action log.** Every message, tool call, approval, and payment goes to an append-only log the user can read and export.
9. **Human handoff with the same rules.** Human operators follow the same policy engine and appear in the same log.
10. **Kill switch.** One message ("stop everything") pauses all running tasks, freezes agent-held cards, and revokes active sessions.

## Abuse Prevention

An open playbook also helps bad actors. Mitigations every deployment should adopt:

- **Identity verification** before enabling payments or outbound calls to third parties.
- **Outbound call rules:** disclose that the caller is an AI agent acting for a named user; respect recording-consent laws (some US states require consent from every party).
- **Rate limits** on outbound messages, calls, and new account creation.
- **No impersonation:** the agent never claims to be the human user on voice calls.
- **Spend anomaly detection** at both the policy layer and the card layer.

## Privacy

- Collect only what a task needs; attach an expiry to every memory fact.
- Make memory exportable and deletable from day one (see the [Open Memory Format](../spec/open-memory-format/)).
- Do not use personal data for advertising without explicit, separate consent.
- Apps reading Gmail via restricted scopes must pass Google's annual security assessment, which includes verifying data deletion on user request ([Google](https://support.google.com/cloud/answer/13465431?hl=en)).
