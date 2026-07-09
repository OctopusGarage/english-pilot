# ADR 0004: Hooks Enforce Input, Not Completed Output Rewriting

## Status

Accepted

## Context

EnglishPilot must block prompts that exceed the configured non-English threshold. It also wants final-response coaching notes when prompts are allowed but teachable. Codex and Claude hooks can intercept submitted prompts, but command hooks cannot directly edit an already completed assistant response.

## Decision

Use hooks for deterministic input blocking. Use MCP plus host guidance for final-response coaching notes. A future turn-end hook may detect a missing coaching note and ask for follow-up behavior, but it should not be modeled as direct output rewriting.

## Consequences

- The language gate remains reliable even when the model ignores coaching guidance.
- Coaching-note consistency depends on host instructions, MCP availability, and force-mode guidance.
- Tests should verify deterministic hook behavior separately from host-guidance text.
