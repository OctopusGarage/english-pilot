# ADR 0002: External Channels Use Long Connections

## Status

Accepted

## Context

The project originally explored webhook-style integrations. The desired product shape is quick setup, QR-assisted account onboarding where possible, and ongoing chat through Feishu and WeChat without manually wiring webhook callbacks.

## Decision

Use long-connection channel adapters for Feishu/Lark and WeChat. Remove webhook-oriented behavior from the supported architecture.

## Consequences

- The daemon owns channel lifecycles, reconnect behavior, session refresh, and local control status.
- Feishu and WeChat are adapters at the channel runtime seam.
- Channel tests should focus on normalized message behavior and runtime outcomes, not webhook handoff compatibility.
