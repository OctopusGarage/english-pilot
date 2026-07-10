# Eval and Quality Gates

This document explains how EnglishPilot validates behavior during development
and CI. It is intentionally separate from the README so normal users do not need
to read project-maintenance details.

## Validation Model

EnglishPilot uses three layers of checks:

- Unit and integration tests cover individual modules and contracts.
- `project-health` runs the broad engineering gate for the whole repository.
- Smoke and agent evals verify representative end-to-end product behavior.

Smoke and agent evals are not a replacement for the full test suite. They cover
the most important user-visible paths:

- language gate blocks prompts above the configured Chinese/non-English ratio;
- blocked prompts include a copyable English rewrite;
- force mode produces coaching for awkward mixed-language prompts;
- Feishu and WeChat channel prompts include `<english_pilot_coaching>`;
- the local voice/STT gateway can parse a fake `WHISPER_COMMAND` transcript;
- a real MCP stdio process exposes history and voice tools to an MCP client;
- Codex dry-run command construction is resume-safe and does not invoke Codex;
- Claude/Codex agent eval fixtures preserve the required English note format
  and can turn learning history into a lesson with IPA and a practice speech.

Full-module confidence comes from `npm run project-health`, not from manually
enumerating every module in smoke eval.

## Local Commands

Test code is separated by intent:

- `tests/unit/` covers core deterministic functions with minimal I/O.
- `tests/integration/` covers CLI, MCP, storage, installer, daemon, and channel seams.
- `tests/eval/` covers the published eval command behavior and eval fixtures.

Runtime eval implementation stays under `src/eval/` because `english-pilot eval ...`
is a published CLI feature. Shell orchestration stays under `scripts/`, for example
`scripts/eval-suite.sh`.

Run a focused test layer:

```bash
npm run test:unit
npm run test:integration
npm run test:eval
```

Run the full deterministic local eval suite:

```bash
npm run eval:suite
```

This is equivalent to:

```bash
scripts/eval-suite.sh --backend both
```

By default it runs:

- `npm run build`;
- deterministic smoke eval;
- MCP stdio smoke against the built CLI;
- Claude agent evals in dry-run mode;
- Codex agent evals in dry-run mode.

Dry-run agent evals validate command construction and prompt preservation. They
do not call real Claude or Codex.

Run a narrower smoke check:

```bash
npm run build
npm run smoke:json
npm run smoke:mcp-stdio
```

Print reusable Claude/Codex prompt fixtures:

```bash
node dist/src/bin/english-pilot.js eval prompts
```

Run one dry-run agent eval:

```bash
npm run build
npm run eval:agent:codex:dry
npm run eval:agent:claude:dry
npm run eval:agent:codex:history:dry
npm run eval:agent:claude:history:dry
```

Available agent eval cases:

- `channel-weather` verifies that a normal channel reply preserves the compact
  `English note`, rationale, and IPA coaching contract.
- `history-lesson` verifies that a learning brief can be turned into a concise
  teaching summary, corrected expressions, IPA, and a short practice speech.

Run a real local agent eval only when the selected CLI is installed, logged in,
and the user explicitly wants model behavior checked:

```bash
scripts/eval-suite.sh --backend codex --real-agent
scripts/eval-suite.sh --backend claude --real-agent
```

Real-agent eval can depend on account state, network, model behavior, and local
CLI versions, so it is intentionally opt-in.

## Project Health

Run the full local quality gate before larger changes:

```bash
npm run project-health
```

It runs:

- ESLint;
- shellcheck for shell scripts;
- portable fixture checks;
- TypeScript typecheck;
- Vitest coverage;
- build;
- deterministic smoke eval;
- MCP stdio smoke;
- dependency-cruiser;
- knip.

Run the stricter pre-release gate:

```bash
npm run verify
```

`verify` adds full-history gitleaks and npm audit before `project-health`.

## Portable Fixtures

`npm run portable-fixtures` blocks personal machine paths and local-only fixture
names from entering source, tests, docs, or eval fixtures.

The script prefers `rg` when available and falls back to `git grep`, so it works
on clean GitHub-hosted runners without extra package installation.

## Claude Code Shortcuts

The repo includes Claude Code commands under `.claude/commands/`:

- `/smoke-eval` runs the deterministic smoke eval.
- `/smoke-eval --prompts` prints the reusable prompt fixtures.
- `/agent-eval codex --dry-run` checks Codex invocation construction.
- `/agent-eval claude --dry-run` checks Claude invocation construction.
- `/agent-eval codex history-lesson --dry-run` checks learning-history lesson
  prompt preservation.
- `/agent-eval codex` or `/agent-eval claude` invokes a real local agent.
- `/eval-suite` runs deterministic smoke plus Claude/Codex dry-run agent evals.
- `/eval-suite codex --real-agent` runs the suite against real Codex only.

Agents should choose the smallest useful check:

- after language-gate or coaching changes, run smoke eval;
- after MCP config/tool registration changes, run `npm run smoke:mcp-stdio`;
- after AgentRunner or external-channel prompt changes, run eval suite;
- after history/review/brief changes, run `/agent-eval <backend> history-lesson --dry-run`;
- before release or broad refactors, run `project-health`;
- use real-agent eval only for explicit model-behavior verification.

## GitHub Actions

The repository has a dedicated `Eval` workflow:

- push and pull request runs execute the deterministic eval suite in dry-run
  mode;
- manual `workflow_dispatch` allows choosing `both`, `claude`, or `codex`;
- manual `real_agent=true` exists for self-hosted or prepared runners, but is
  not expected to work on a stock GitHub-hosted runner.

Other quality workflows:

- `CI` runs the normal test/build gates on Ubuntu and macOS.
- `Project Health` runs the full project-health gate and uploads coverage.
- `Gitleaks` scans for secrets.
- `CodeQL` runs static security analysis.

## Interpreting Results

When reporting eval results, include:

- overall `passed`;
- each smoke case id and pass/fail state;
- backend, dry-run state, and assertion result for each agent eval;
- whether a real Claude/Codex process was invoked.

If a smoke or agent eval fails, first run the narrow deterministic tests named
by the Claude command output before editing code.
