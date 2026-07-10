@RTK.md

## Project Shortcuts

See `docs/eval-and-quality.md` for the maintained smoke, AI-agent eval, CI, and
Claude Code command reference. Keep this file as the short operational routing
guide for agents.

When the user asks for `/smoke-eval`, `smoke eval`, or a quick EnglishPilot
local eval, run the deterministic smoke suite instead of inventing a manual
check:

```bash
npm run build && npm run smoke:json
npm run smoke:mcp-stdio
```

Read the JSON and report the overall `passed` value plus each case id. If a case
fails, run the narrow related test before inspecting code:

- Gate/coaching: `npm test -- --run tests/eval/smoke-eval.test.ts tests/unit/analyze.test.ts tests/integration/coaching.test.ts`
- Feishu/WeChat channel coaching: `npm test -- --run tests/eval/smoke-eval.test.ts tests/integration/feishu-channel.test.ts tests/integration/wechat-channel.test.ts`
- Agent dry-run: `npm test -- --run tests/eval/smoke-eval.test.ts tests/integration/agent-runner.test.ts`
- MCP stdio: `npm run build && npm run smoke:mcp-stdio`

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

Use `--case history-lesson` when the change touches learning history, review
briefs, or generated teaching output. Use `--backend claude` when the user asks
for Claude. Add `--dry-run` when the user wants command construction only.
Unlike smoke eval, non-dry-run agent eval can invoke a real local Claude/Codex
process and may depend on account, network, and model behavior.

When the user asks for a full eval suite, broad regression eval, or whether the
system still works end-to-end after a code change, run:

```bash
scripts/eval-suite.sh --backend both
```

Use `--real-agent` only when the user explicitly asks to invoke real local
Claude/Codex. The default suite runs deterministic smoke, MCP stdio smoke, and
Claude/Codex dry-run agent evals for all catalogued eval cases.

When the user asks to update a remote installed machine, use
`/update-remote-install` or run:

```bash
scripts/update-remote-install.sh <user@host> <version>
```

For the known Intel Mac test machine, the usual target is
`ys-aquria@mac2015.local`. Do not install under a different remote user just
because that user can SSH in; EnglishPilot runtime state is user-scoped under
`~/.english-pilot`.
