# Risk Policy v0.1 (draft)

A declarative file that maps agent actions to risk tiers and confirmation rules, so safety behavior is reviewable, versioned, and portable across implementations. Tiers are defined in [Trust and Safety](../../docs/04-trust-and-safety.md).

- [`policy.example.yaml`](policy.example.yaml): conservative defaults every deployment should start from.

## Evaluation Order

1. Match the action against `actions` (exact match beats wildcard; longer wildcard prefix beats shorter). Unmatched actions use `default_tier` (T3 in the example), so new tools fail closed.
2. Apply the tier's default rule.
3. Apply user overrides, which may only **relax** T0 to T2 rules or set **standing limits** for T3; they can never remove the T3 confirmation for amounts above the limit.
4. Apply `untrusted_origin` rules: an action triggered by content from an untrusted source (email body, web page, another agent) is escalated by one tier.
5. Log the decision to the event log with the policy version.
