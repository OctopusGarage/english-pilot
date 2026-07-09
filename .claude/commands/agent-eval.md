---
description: Run EnglishPilot AI-backed agent eval with Claude or Codex
argument-hint: 'claude|codex [--dry-run]'
allowed-tools: Bash, Read
---

Run the opt-in AI-backed EnglishPilot eval. Unlike `/smoke-eval`, this command
can call a real local Claude or Codex process unless `--dry-run` is present.

Argument: `$ARGUMENTS`

Backend selection:

- If `$ARGUMENTS` contains `claude`, use `--backend claude`.
- If `$ARGUMENTS` contains `codex`, use `--backend codex`.
- If neither is present, ask the user which backend to run. Do not guess.

Do this:

1. Run `npm run build`.
2. Run:

   ```bash
   node dist/src/bin/english-pilot.js eval agent --backend <claude|codex> --case channel-weather --json
   ```

   Add `--dry-run` when `$ARGUMENTS` contains `--dry-run`.

3. Parse the JSON and report:

   - overall `passed`
   - backend and case id
   - each assertion id and pass/fail state
   - failed assertion details

4. If the eval fails, run the narrow deterministic checks before editing code:

   ```bash
   npm test -- --run tests/smoke-eval.test.ts tests/agent-runner.test.ts
   ```

5. Keep the report concise. State clearly whether a real model was invoked or
   whether this was a dry run.
