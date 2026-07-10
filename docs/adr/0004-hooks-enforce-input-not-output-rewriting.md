# ADR 0004: Hooks Enforce Input And Record Completed Output Notes

## Status

Accepted

## Context

EnglishPilot defaults to blocking prompts that exceed the configured non-English threshold, but it also supports a non-blocking coach mode for users who want analysis, suggestions, and review recording without interrupting the current task. It also wants final-response coaching notes when prompts are allowed but teachable. Claude Code and Codex both provide submit-time hooks for input blocking and Stop hooks after a response finishes.

## Decision

Use submit hooks for deterministic input blocking when `gateMode=enforce`. When `gateMode=coach`, run the same submit-time analysis but downgrade over-threshold results to coaching and review recording instead of blocking. Use MCP plus host guidance to ask the agent to append a compact final-response `English note`. Use Stop hooks only to parse the completed assistant message and record the last parseable note into the review queue; do not use Stop hooks to rewrite the completed response.

## Consequences

- The language gate remains reliable in enforce mode even when the model ignores coaching guidance.
- Coach mode is intentionally advisory: it preserves learning records and suggestions without preventing the main task from running.
- Coaching-note consistency still depends on host instructions, MCP availability, and force-mode guidance.
- Completed notes are persisted when they follow the supported `English note: original -> suggested`, `Why`, and optional `IPA` shape.
- Tests should verify deterministic submit-hook blocking separately from Stop-hook note recording.
