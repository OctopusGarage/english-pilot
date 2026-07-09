# ADR 0002: External Channels Use Long Connections

## Status

Accepted

## Context

The desired product shape is quick setup, QR-assisted account onboarding where possible, and ongoing chat through Feishu and WeChat from one local daemon.

## Decision

Use long-connection channel adapters for Feishu/Lark and WeChat. The daemon owns channel lifecycle, inbound normalization, reply policy, session continuity, and local-agent execution.

## Consequences

- The daemon owns channel lifecycles, reconnect behavior, session refresh, and local control status.
- Feishu and WeChat are adapters at the channel runtime seam.
- Channel tests should focus on normalized message behavior, reply policy, session continuity, and runtime outcomes.
