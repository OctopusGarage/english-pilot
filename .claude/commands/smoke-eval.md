---
description: Run EnglishPilot deterministic smoke eval
argument-hint: '[--prompts | --json]'
allowed-tools: Bash, Read
---

Run the local EnglishPilot smoke eval for this repo. This command is a thin
Claude shortcut over the deterministic CLI eval; do not duplicate eval logic in
the prompt.

For opt-in real Claude/Codex behavior checks, use `/agent-eval` instead.

Argument: `$ARGUMENTS`

Do this:

1. Run `npm run build` so the `dist` CLI matches the current source.
2. If `$ARGUMENTS` contains `--prompts`, run:

   ```bash
   node dist/src/bin/english-pilot.js eval prompts
   ```

   Then summarize the Claude/Codex prompt fixtures and stop.

3. Otherwise run:

   ```bash
   npm run smoke:json
   ```

4. Parse the JSON output. Report:

   - overall `passed`
   - each case id and pass/fail state
   - failed case details if any

5. If a case fails, do not guess. Run the narrow related test first, then inspect
   the failing path:

   - gate cases: `npm test -- --run tests/smoke-eval.test.ts tests/analyze.test.ts tests/coaching.test.ts`
   - channel coaching cases: `npm test -- --run tests/smoke-eval.test.ts tests/feishu-channel.test.ts tests/wechat-channel.test.ts`
   - agent dry-run cases: `npm test -- --run tests/smoke-eval.test.ts tests/agent-runner.test.ts`

6. Keep the final report concise. Mention that the smoke eval uses a temporary
   EnglishPilot home directory and does not call real Claude, Codex, Feishu, or
   WeChat.
