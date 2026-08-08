# EnglishPilot Contributor Guide

Read [`AGENTS.md`](AGENTS.md) first. It is the short operational guide; the
maintained validation reference is [`docs/eval-and-quality.md`](docs/eval-and-quality.md).

## Architecture boundaries

- Keep language policy and coaching decisions in `src/core/`; adapters, CLI,
  MCP, and channel code should delegate to that shared policy.
- Keep external-channel lifecycle and delivery concerns in `src/channels/` and
  `src/daemon/`; do not duplicate gate or coaching logic there.
- Preserve the local-first design. Do not introduce direct model-provider APIs;
  agent work remains behind the existing local Claude/Codex runner boundary.

## Validation

- Choose the smallest relevant check from `docs/eval-and-quality.md`.
- Run real Claude or Codex evaluations only when explicitly requested. The
  deterministic smoke and dry-run agent evaluations do not invoke a provider.
- Use `RTK.md` for the repository's shell-command convention.
