import { describe, expect, it } from 'vitest';
import { buildExternalAgentInvocation, runExternalAgent } from '../src/agent/runner.js';
import { defaultConfig } from '../src/core/policy.js';

describe('external agent runner', () => {
  it('builds a Claude prompt invocation that sends the prompt through stdin', () => {
    const invocation = buildExternalAgentInvocation({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'claude',
        externalAgentClaudeBinary: '/usr/local/bin/claude',
      },
      prompt: 'Help me review this English message.',
      cwd: '/tmp/workspace',
    });

    expect(invocation).toMatchObject({
      backend: 'claude',
      command: '/usr/local/bin/claude',
      cwd: '/tmp/workspace',
      promptStdin: 'Help me review this English message.',
    });
    expect(invocation.args).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'bypassPermissions',
    ]);
  });

  it('builds a Claude resume invocation when a session id is provided', () => {
    const invocation = buildExternalAgentInvocation({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'claude',
      },
      prompt: 'Continue this Feishu conversation.',
      cwd: '/tmp/workspace',
      sessionId: 'claude-session-1',
    });

    expect(invocation.args).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'bypassPermissions',
      '--resume',
      'claude-session-1',
    ]);
  });

  it('builds a Codex exec invocation with an explicit cwd and sandbox', () => {
    const invocation = buildExternalAgentInvocation({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'codex',
        externalAgentCodexBinary: '/opt/homebrew/bin/codex',
        externalAgentCodexSandbox: 'danger-full-access',
      },
      prompt: 'Summarize this Feishu message.',
      cwd: '/tmp/channel-project',
    });

    expect(invocation).toMatchObject({
      backend: 'codex',
      command: '/opt/homebrew/bin/codex',
      cwd: '/tmp/channel-project',
      promptStdin: 'Summarize this Feishu message.',
    });
    expect(invocation.args).toEqual([
      'exec',
      '--json',
      '--sandbox',
      'danger-full-access',
      '-c',
      'approval_policy="never"',
      '-c',
      'shell_environment_policy.inherit="all"',
      '--skip-git-repo-check',
      '-C',
      '/tmp/channel-project',
      '-',
    ]);
  });

  it('builds a Codex resume invocation when a thread id is provided', () => {
    const invocation = buildExternalAgentInvocation({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'codex',
      },
      prompt: 'Continue this WeChat conversation.',
      cwd: '/tmp/channel-project',
      threadId: 'codex-thread-1',
    });

    expect(invocation.args).toEqual([
      'exec',
      '--sandbox',
      'workspace-write',
      '-c',
      'approval_policy="never"',
      '-c',
      'shell_environment_policy.inherit="all"',
      '--skip-git-repo-check',
      '-C',
      '/tmp/channel-project',
      'resume',
      '--json',
      'codex-thread-1',
      '-',
    ]);
  });

  it('rejects external agent execution until a backend is configured', async () => {
    await expect(
      runExternalAgent({
        config: defaultConfig,
        prompt: 'Hello',
        dryRun: true,
      }),
    ).rejects.toThrow('Set externalAgentBackend to claude or codex');
  });

  it('returns invocation details without spawning a process in dry-run mode', async () => {
    const result = await runExternalAgent({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'claude',
      },
      prompt: 'Hello',
      dryRun: true,
      cwd: '/tmp/workspace',
    });

    expect(result).toMatchObject({
      operation: 'external-agent-run',
      backend: 'claude',
      dryRun: true,
      command: 'claude',
      cwd: '/tmp/workspace',
      exitCode: 0,
    });
    expect(result.args).toContain('-p');
    expect(result.stdout).toBe('');
  });

  it('extracts Claude session ids and Codex thread ids from JSONL output', async () => {
    const claude = await runExternalAgent({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'claude',
      },
      prompt: 'Hello',
      spawnProcess: fakeSpawn([
        `${JSON.stringify({ type: 'system', subtype: 'init', session_id: 'claude-session-2' })}\n`,
        `${JSON.stringify({ type: 'result', session_id: 'claude-session-2', result: 'Done' })}\n`,
      ]),
    });
    const codex = await runExternalAgent({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'codex',
      },
      prompt: 'Hello',
      spawnProcess: fakeSpawn([
        `${JSON.stringify({ type: 'system', thread_id: 'codex-thread-2' })}\n`,
        `${JSON.stringify({ type: 'done', threadId: 'codex-thread-2' })}\n`,
      ]),
    });

    expect(claude).toMatchObject({
      sessionId: 'claude-session-2',
    });
    expect(claude).not.toHaveProperty('threadId');
    expect(codex).toMatchObject({
      threadId: 'codex-thread-2',
    });
    expect(codex).not.toHaveProperty('sessionId');
  });
});

function fakeSpawn(stdoutChunks: string[]) {
  return () => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const stdoutListeners = new Map<string, Array<(chunk: Buffer) => void>>();
    const stderrListeners = new Map<string, Array<(chunk: Buffer) => void>>();
    const child = {
      stdout: {
        on: (event: string, listener: (chunk: Buffer) => void) => {
          stdoutListeners.set(event, [...(stdoutListeners.get(event) ?? []), listener]);
        },
      },
      stderr: {
        on: (event: string, listener: (chunk: Buffer) => void) => {
          stderrListeners.set(event, [...(stderrListeners.get(event) ?? []), listener]);
        },
      },
      stdin: {
        end: () => {
          queueMicrotask(() => {
            for (const chunk of stdoutChunks) {
              for (const listener of stdoutListeners.get('data') ?? []) listener(Buffer.from(chunk));
            }
            for (const listener of listeners.get('close') ?? []) listener(0, null);
          });
        },
      },
      kill: () => true,
      on: (event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      },
    };
    return child as never;
  };
}
