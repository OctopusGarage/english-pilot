---
description: Run EnglishPilot full local eval suite
argument-hint: '[claude|codex|both] [--real-agent]'
allowed-tools: Bash, Read
---

Run the reusable EnglishPilot eval suite. Prefer this command when a change
touches language gate, coaching, external channel prompting, AgentRunner,
session resume, CLI eval, or release/install behavior.

Reference: `docs/eval-and-quality.md`.

Argument: `$ARGUMENTS`

Backend selection:

- If `$ARGUMENTS` contains `claude`, use `--backend claude`.
- If `$ARGUMENTS` contains `codex`, use `--backend codex`.
- Otherwise use `--backend both`.

Agent mode:

- Default is dry-run agent eval. It does not invoke real Claude/Codex.
- If `$ARGUMENTS` contains `--real-agent`, pass `--real-agent`. Only do this
  when the user explicitly asked for real local agent behavior and the local
  agent is logged in.

Do this:

1. Run:

   ```bash
   scripts/eval-suite.sh --backend <claude|codex|both>
   ```

   Add `--real-agent` only when requested.

2. Report:

   - deterministic smoke eval `passed`
   - MCP stdio smoke `passed`
   - each smoke case id and pass/fail state
   - each agent eval backend, case id, dry-run state, and assertion pass/fail state

3. If something fails, run the narrow related tests before editing:

   ```bash
   npm test -- --run tests/eval/smoke-eval.test.ts tests/integration/agent-runner.test.ts
   ```

4. Keep the report concise. State clearly whether real Claude/Codex was invoked.
