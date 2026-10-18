# Open Memory Format (OMF) v0.1 (draft)

**Goal:** a user should be able to take everything their personal agent knows about them and move it to a different agent. If memory is portable, no agent owns its users.

No common format for portable agent memory exists today (see [Standards](../../docs/03-standards.md#gaps-no-open-standard-covers-yet)). OMF is a starting proposal.

## Design Rules

1. **Every fact has provenance.** Was it stated by the user, inferred, imported, or supplied by a third party? Inferred facts carry a confidence score.
2. **Every fact has a consent scope.** Scopes such as `travel.preferences` or `calendar.work:read` say which agents and people may use it.
3. **Facts expire.** Inferences should not live forever; `expires_at` is encouraged for anything not stated by the user.
4. **Facts are superseded, not silently edited.** New facts list the IDs they replace, so history stays auditable.
5. **Secrets are never exported.** Grants carry opaque vault references and scopes only. Card numbers, passwords, and tokens stay in the issuing system.
6. **People and their permissions travel with you.** The `people` section records relationships and the scopes each person's agent may access, including an optional A2A Agent Card URL.

## Files

- [`schema.json`](schema.json): JSON Schema (draft 2020-12).
- [`examples/traveler.json`](examples/traveler.json): a valid example export.

## Validate

```bash
pip install jsonschema
python tools/validate.py
```

## Scope Vocabulary (draft)

| Scope | Meaning |
| --- | --- |
| `calendar:read`, `calendar.work:read` | Read all or work-only calendar events |
| `email.inbox:read` | Read inbox contents |
| `travel.preferences` | Seat, airline, hotel, and ground-transport preferences |
| `payments:write` | Initiate payments within mandates |
| `health` | Health information; treat as `special_category` sensitivity |
| `location` | Current or historical location |
| `contacts` | People and relationships |

Proposals to extend the vocabulary are welcome via issues labeled `spec:omf`.

## Open Questions

- Should OMF define a signed export envelope so a receiving agent can verify the source?
- How should conflicting facts from two agents be merged on import?
- Should there be a standard deletion receipt format, so users can prove an agent erased their data?
