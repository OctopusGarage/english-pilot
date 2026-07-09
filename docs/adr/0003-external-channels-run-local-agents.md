# ADR 0003: External Channels Run Configured Local Agents

## Status

Accepted

## Context

Feishu and WeChat messages should be able to continue work through Claude or Codex. The channel should preserve conversation continuity, support `/new`, and route voice transcripts through the same flow.

## Decision

External channels run a configured local agent backend: `claude -p` for Claude or `codex exec` for Codex. The channel runtime persists the returned Claude session id or Codex thread id per conversation scope.

## Consequences

- Users must configure `externalAgentBackend` and optionally `externalAgentCwd` before channel messages invoke an agent.
- `/new` clears the stored external agent session for the current channel scope.
- Agent invocation details belong behind the external agent module interface; channel adapters should not know command-line details.
