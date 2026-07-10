# ADR 0001: Use MCP As The Agent-Facing Capability Surface

## Status

Accepted

## Context

EnglishPilot needs to expose language analysis, rewrite, coaching context, review queues, prompt history, English notes history, diagnostics, integration helpers, and voice helpers to AI agents. Earlier planning considered skills plus CLI, but the current project does not need a separate skill surface.

## Decision

Use MCP as the primary agent-facing interface. Keep CLI commands for human operation, hooks, daemon/service control, installation, and scriptable diagnostics.

History-based teaching is split deliberately: MCP tools return deterministic local history and learning briefs, while the host agent generates the recap, lesson, speech, or review plan requested by the user.

## Consequences

- AI agents can discover and call structured tools instead of parsing CLI text.
- The MCP tool module is an important architecture seam and should remain a deep module with grouped internal handlers.
- Skills can be added later only if there is a strong host-specific workflow that MCP cannot express cleanly.
