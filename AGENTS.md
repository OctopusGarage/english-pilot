@RTK.md

## Project Shortcuts

When the user asks for `/smoke-eval`, `smoke eval`, or a quick EnglishPilot
local eval, run the deterministic smoke suite instead of inventing a manual
check:

```bash
npm run build && npm run smoke:json
```

Read the JSON and report the overall `passed` value plus each case id. If a case
fails, run the narrow related test before inspecting code:

- Gate/coaching: `npm test -- --run tests/smoke-eval.test.ts tests/analyze.test.ts tests/coaching.test.ts`
- Feishu/WeChat channel coaching: `npm test -- --run tests/smoke-eval.test.ts tests/feishu-channel.test.ts tests/wechat-channel.test.ts`
- Agent dry-run: `npm test -- --run tests/smoke-eval.test.ts tests/agent-runner.test.ts`

For prompt fixtures that can be pasted into Claude or Codex, run:

```bash
node dist/src/bin/english-pilot.js eval prompts
```

The smoke eval uses a temporary EnglishPilot home directory. It must not require
real channel credentials, network calls, or real Claude/Codex execution.

When the user asks for `/agent-eval`, `AI eval`, or to verify that Claude/Codex
actually follows the English note instruction, run the opt-in agent eval:

```bash
npm run build
node dist/src/bin/english-pilot.js eval agent --backend codex --case channel-weather --json
```

Use `--backend claude` when the user asks for Claude. Add `--dry-run` when the
user wants command construction only. Unlike smoke eval, non-dry-run agent eval
can invoke a real local Claude/Codex process and may depend on account, network,
and model behavior.
