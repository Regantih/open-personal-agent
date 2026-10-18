# Contributing

Thank you for helping keep personal agents open.

## Ways to Contribute

- **Corrections.** Vendor facts, licenses, and policies change quickly. If something is outdated, open a pull request with a source link.
- **Stack entries.** Add an open-source project or commercial option to [docs/02-open-stack.md](docs/02-open-stack.md). Include the license (from the project's license file) and a link to documentation that supports each claim.
- **Spec proposals.** Changes to the [Open Memory Format](spec/open-memory-format/) or [Risk Policy](spec/risk-policy/) start as an issue labeled `spec:omf` or `spec:risk`, then a pull request that updates the schema, the README, and at least one example.
- **Gatekeeper reports.** Document channel-access or platform-policy problems you hit, with dates and sources, using the issue template.
- **Reference implementation.** See [ROADMAP.md](ROADMAP.md) for the first milestones.

## Rules for Documentation

1. Every factual claim about a product, company, or policy needs an inline source link.
2. State dates for anything time-sensitive ("as of October 2026").
3. Do not include confidential, leaked, or proprietary material about any company.
4. Keep the safety defaults in [docs/04-trust-and-safety.md](docs/04-trust-and-safety.md) intact; proposals to relax them need a clear rationale and review.

## Pull Requests

- Keep each pull request focused on one change.
- Run `python tools/validate.py` if you touch the specs.
- By contributing, you agree your contributions are licensed under Apache 2.0 (code and specs) and CC BY 4.0 (documentation).

## Conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
