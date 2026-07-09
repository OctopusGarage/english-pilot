# Agent Runtime Design

EnglishPilot has two different execution modes:

- In Claude Code or Codex interactive sessions, the host agent should use EnglishPilot through MCP naturally.
- In external message channels such as Feishu, WeChat, or a future CLI chat command, EnglishPilot must explicitly choose which local agent process handles the conversation.

## Current Decision

Use both MCP and CLI, but for different seams.

- MCP is the preferred interface for an already-running AI agent. It exposes EnglishPilot as tools the agent can call when useful.
- CLI is the preferred interface for hooks, installers, channel daemons, health checks, and any integration that needs to spawn a local process.
- Skill guidance is useful as host-specific behavior guidance, but it should not be the primary machine interface for state-changing EnglishPilot operations.

## External Agent Runtime

The first version implements a small `AgentRunner` module instead of letting Feishu, WeChat, or CLI message handlers spawn agents directly.

Current interface shape:

```ts
export type AgentBackend = 'claude' | 'codex';

export interface AgentRunRequest {
  backend: AgentBackend;
  prompt: string;
  cwd?: string;
  dryRun?: boolean;
  timeoutMs?: number;
  sessionId?: string;
  threadId?: string;
}

export interface AgentRunResult {
  backend: AgentBackend;
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  sessionId?: string;
  threadId?: string;
}
```

The channel flow should be:

1. Normalize the incoming message into text plus channel metadata.
2. Run EnglishPilot threshold analysis.
3. If over the threshold, reply with the copyable English rewrite and do not call the agent.
4. If allowed, optionally record a learning item.
5. If `externalAgentBackend` is configured, build a structured prompt and call `AgentRunner`.
6. Reply with the agent output.

## Backend Configuration

External channel configuration should require an explicit backend:

```bash
english-pilot config set externalAgentBackend claude
english-pilot config set externalAgentBackend codex
english-pilot config set externalAgentCwd /path/to/workspace
english-pilot config set externalAgentClaudeBinary claude
english-pilot config set externalAgentCodexBinary codex
english-pilot config set externalAgentCodexSandbox workspace-write
english-pilot agent doctor --json
english-pilot agent run --text "Reply to this message." --backend claude --dry-run --json
```

Channel-specific overrides can be added later:

```bash
english-pilot config set feishuAgentBackend claude
english-pilot config set wechatAgentBackend codex
```

The first implementation should keep one global external backend unless real usage shows channel-specific behavior is needed.

## Claude Adapter

Use Claude Code in print mode:

```bash
claude -p --output-format stream-json --verbose --permission-mode bypassPermissions
```

Send the prompt through stdin or a file, not raw shell interpolation.

The runner extracts `session_id` from Claude stream-json output and stores it as the active channel session. Later messages in the same channel scope and cwd pass it back with `--resume <sessionId>`.

## Codex Adapter

Use Codex in exec mode:

```bash
codex exec --json --sandbox workspace-write -c approval_policy=\"never\" -c shell_environment_policy.inherit=\"all\" --skip-git-repo-check -C <cwd> -
```

Send the prompt through stdin.

The runner extracts `thread_id` or `threadId` from Codex JSONL output and stores it as the active channel thread. Later messages in the same channel scope and cwd pass it back through `codex exec ... resume --json <threadId> -`.

## Voice Input

External channel voice input is normalized before threshold analysis:

- Feishu/Lark audio resources are downloaded with the message-resource API, then transcribed with the local Whisper provider.
- WeChat voice messages that include `voice_item.text` use that transcript directly.

The resulting text enters the same gate and AgentRunner path as a normal text message, with `inputKind: "voice"` in the prompt metadata.

## Prompt Shape

External channel prompts should be structured:

```xml
<english_pilot_context>
{
  "channel": "feishu",
  "senderId": "...",
  "chatId": "...",
  "messageId": "...",
  "thresholdDecision": "ALLOW_SILENT"
}
</english_pilot_context>

<user_input>
...
</user_input>
```

This follows the reference bridge pattern from `lark-coding-agent-bridge`: channel metadata and user input are separate sections, and angle brackets inside JSON are escaped before insertion.

## Why Not MCP Only

MCP is excellent once Claude Code or Codex is already the running host. It is not enough for Feishu, WeChat, or a CLI chat entrypoint because those surfaces need EnglishPilot to start and supervise the agent process.

MCP should remain the agent-facing capability interface. The external runtime should be a process-facing CLI adapter.

## Why Not Skill Only

Skills are good for teaching an agent when and how to use EnglishPilot, especially low-friction guidance after a task. They are not a reliable primary integration contract because:

- they cannot enforce hook-level blocking;
- they cannot be called by Feishu or WeChat without an agent process already running;
- they are harder to test as a deterministic machine interface;
- they do not replace CLI/MCP for persistent local state and diagnostics.

Use skills as guidance, MCP as the in-agent tool surface, and CLI as the process/control surface.
