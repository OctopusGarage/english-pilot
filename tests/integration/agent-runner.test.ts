import { afterEach, describe, expect, it, vi } from 'vitest';
import type { spawn as spawnFunction } from 'node:child_process';
import {
  buildExternalAgentInvocation,
  extractExternalAgentReplyText,
  formatExternalAgentRunResult,
  runExternalAgent,
} from '../../src/agent/runner.js';
import { defaultConfig } from '../../src/core/policy.js';

describe('external agent runner', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('can disable Codex shell environment inheritance for isolated runs', () => {
    const invocation = buildExternalAgentInvocation({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'codex',
      },
      prompt: 'Enrich this translation.',
      cwd: '/tmp/translation-enrichment',
      codexShellEnvironmentPolicy: 'none',
    });

    expect(invocation.args).toContain('shell_environment_policy.inherit="none"');
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

  it('turns a process spawn error into a user-visible failed run result', async () => {
    const result = await runExternalAgent({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'claude',
      },
      prompt: 'Hello',
      spawnProcess: fakeSpawnError(new Error('claude executable not found')),
    });

    expect(result).toMatchObject({
      operation: 'external-agent-run',
      dryRun: false,
      exitCode: 1,
      stderr: 'claude executable not found\n',
    });
  });

  it('notifies termination when process creation throws before a child exists', async () => {
    let callbackCount = 0;

    await expect(
      runExternalAgent({
        config: {
          ...defaultConfig,
          externalAgentBackend: 'codex',
        },
        prompt: 'Hello',
        onChildTermination: () => {
          callbackCount += 1;
        },
        spawnProcess: () => {
          throw new Error('invalid codex binary');
        },
      }),
    ).rejects.toThrow('invalid codex binary');

    expect(callbackCount).toBe(1);
  });

  it('reports a timed-out agent process and terminates it', async () => {
    let signal: NodeJS.Signals | undefined;
    const result = await runExternalAgent({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'claude',
      },
      prompt: 'Hello',
      timeoutMs: 5,
      spawnProcess: fakeSpawnWithoutClose((killSignal) => {
        signal = killSignal;
      }),
    });

    expect(result).toMatchObject({
      exitCode: null,
      signal: 'SIGTERM',
      stderr: 'External agent timed out after 5ms.\n',
    });
    expect(signal).toBe('SIGTERM');
  });

  it('escalates a child that ignores SIGTERM and resolves after SIGKILL', async () => {
    vi.useFakeTimers();
    const signals: NodeJS.Signals[] = [];
    let callbackCount = 0;
    const resultPromise = runExternalAgent({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'claude',
      },
      prompt: 'Hello',
      timeoutMs: 5,
      waitForChildCloseAfterTermination: true,
      onChildTermination: () => {
        callbackCount += 1;
      },
      spawnProcess: fakeSpawnWithoutClose((signal) => {
        signals.push(signal);
      }, true),
    });

    await vi.advanceTimersByTimeAsync(105);
    const result = await resultPromise;

    expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
    expect(result.signal).toBe('SIGKILL');
    expect(callbackCount).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not leak the termination grace timer when SIGTERM closes synchronously', async () => {
    vi.useFakeTimers();
    const resultPromise = runExternalAgent({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'claude',
      },
      prompt: 'Hello',
      timeoutMs: 5,
      waitForChildCloseAfterTermination: true,
      spawnProcess: fakeSpawn([], undefined, true, false),
    });
    await vi.advanceTimersByTimeAsync(5);
    const result = await resultPromise;

    expect(result.signal).toBe('SIGTERM');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resolves a final SIGKILL-not-sent state when the child is already gone', async () => {
    vi.useFakeTimers();
    let callbackCount = 0;
    const resultPromise = runExternalAgent({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'claude',
      },
      prompt: 'Hello',
      timeoutMs: 5,
      waitForChildCloseAfterTermination: true,
      onChildTermination: () => {
        callbackCount += 1;
      },
      spawnProcess: fakeSpawnWithoutClose(() => undefined, false, true),
    });

    await vi.advanceTimersByTimeAsync(105);
    const result = await resultPromise;

    expect(result).toMatchObject({
      signal: 'SIGKILL',
      terminationFailure: 'SIGKILL_NOT_SENT',
    });
    expect(callbackCount).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('formats command, output, and stderr for a human-readable run report', () => {
    const output = formatExternalAgentRunResult({
      operation: 'external-agent-run',
      backend: 'claude',
      command: 'claude',
      args: ['-p', 'message with spaces'],
      cwd: '/tmp/workspace',
      promptStdin: 'Hello',
      dryRun: false,
      exitCode: 1,
      stdout: 'partial response',
      stderr: 'failed',
    });

    expect(output).toContain("Command: claude -p 'message with spaces'");
    expect(output).toContain('Exit code: 1');
    expect(output).toContain('partial response');
    expect(output).toContain('stderr:\nfailed');
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

  it('terminates an agent when bounded output exceeds the configured limit', async () => {
    let killedWith: NodeJS.Signals | undefined;
    const result = await runExternalAgent({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'codex',
      },
      prompt: 'Hello',
      maxOutputBytes: 8,
      spawnProcess: fakeSpawn(['123456789'], (signal) => {
        killedWith = signal;
      }),
    });

    expect(result).toMatchObject({
      exitCode: null,
      outputLimitExceeded: true,
      signal: 'SIGTERM',
    });
    expect(killedWith).toBe('SIGTERM');
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(8);
  });

  it('keeps bounded multibyte output valid UTF-8 and within the cap', async () => {
    const result = await runExternalAgent({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'codex',
      },
      prompt: 'Hello',
      maxOutputBytes: 4,
      spawnProcess: fakeSpawn(['ab中']),
    });

    expect(result.outputLimitExceeded).toBe(true);
    expect(result.stdout).toBe('ab');
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(4);
    expect(result.stdout).not.toContain('\uFFFD');
  });

  it('keeps timeout diagnostics within the output cap', async () => {
    const result = await runExternalAgent({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'codex',
      },
      prompt: 'Hello',
      maxOutputBytes: 4,
      timeoutMs: 10,
      spawnProcess: fakeSpawn([], undefined, false, false),
    });

    expect(result.signal).toBe('SIGTERM');
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(4);
    expect(Buffer.byteLength(result.stderr, 'utf8')).toBeLessThanOrEqual(4);
  });

  it('can wait for a terminated child to close before resolving', async () => {
    const result = await runExternalAgent({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'codex',
      },
      prompt: 'Hello',
      maxOutputBytes: 4,
      waitForChildCloseAfterTermination: true,
      spawnProcess: fakeSpawn(['123456789'], undefined, true),
    });

    expect(result.outputLimitExceeded).toBe(true);
    expect(result.signal).toBe('SIGTERM');
  });

  it('passes an explicit spawn environment without inheriting the parent environment', async () => {
    let spawnOptions: { env?: NodeJS.ProcessEnv } | undefined;
    const result = await runExternalAgent({
      config: {
        ...defaultConfig,
        externalAgentBackend: 'codex',
      },
      prompt: 'Hello',
      spawnEnv: {
        PATH: '/usr/bin',
        HOME: '/tmp/home',
      },
      spawnProcess: fakeSpawn([], undefined, false, true, (options) => {
        spawnOptions = options;
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(spawnOptions?.env).toEqual({
      PATH: '/usr/bin',
      HOME: '/tmp/home',
    });
  });

  it('does not duplicate identical Claude assistant and result text from JSONL output', () => {
    const text = [
      '**Natural phrasing:**',
      '',
      'What is the weather like in Guangzhou?',
      '',
      '**English note:** "what is the weather about 广州" -> "What is the weather like in Guangzhou?"',
      '**Why this is natural:** Use "What is the weather like in + place?" for local weather.',
      'IPA: weather /ˈweðər/',
    ].join('\n');
    const result = extractExternalAgentReplyText({
      operation: 'external-agent-run',
      backend: 'claude',
      command: 'claude',
      args: ['-p'],
      cwd: '/tmp/workspace',
      promptStdin: 'prompt',
      dryRun: false,
      exitCode: 0,
      stdout: [
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } }),
        JSON.stringify({ type: 'result', result: text }),
      ].join('\n'),
      stderr: '',
    });

    expect(result).toBe(text);
  });

  it('returns the final Codex agent message instead of progress chatter', () => {
    const finalText = [
      'A natural way to ask is: "What is the weather like in Guangzhou?"',
      '',
      'English note: "what is the weather about 广州" -> "What is the weather like in Guangzhou?"',
      'Why: Use "What is the weather like in + place?" when asking about local weather.',
      'IPA: weather /ˈweðər/',
    ].join('\n');
    const result = extractExternalAgentReplyText({
      operation: 'external-agent-run',
      backend: 'codex',
      command: 'codex',
      args: ['exec'],
      cwd: '/tmp/workspace',
      promptStdin: 'prompt',
      dryRun: false,
      exitCode: 0,
      stdout: [
        JSON.stringify({
          type: 'item.completed',
          item: { type: 'agent_message', text: 'I will inspect tools first.' },
        }),
        JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: finalText } }),
      ].join('\n'),
      stderr: '',
    });

    expect(result).toBe(finalText);
  });
});

function fakeSpawn(
  stdoutChunks: string[],
  onKill?: (signal: NodeJS.Signals) => void,
  closeOnKill = false,
  closeOnStdin = true,
  onSpawn?: (options: { env?: NodeJS.ProcessEnv }) => void,
) {
  return ((_command: string, _args: string[], options: { env?: NodeJS.ProcessEnv }) => {
    onSpawn?.(options);
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
          if (!closeOnStdin) return;
          queueMicrotask(() => {
            for (const chunk of stdoutChunks) {
              for (const listener of stdoutListeners.get('data') ?? []) listener(Buffer.from(chunk));
            }
            for (const listener of listeners.get('close') ?? []) listener(0, null);
          });
        },
      },
      kill: (signal: NodeJS.Signals) => {
        onKill?.(signal);
        if (closeOnKill) {
          for (const listener of listeners.get('close') ?? []) listener(null, 'SIGTERM');
        }
        return true;
      },
      on: (event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      },
    };
    return child as never;
  }) as unknown as typeof spawnFunction;
}

function fakeSpawnError(error: Error) {
  return () => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const child = {
      stdout: { on: () => undefined },
      stderr: { on: () => undefined },
      stdin: {
        end: () => {
          queueMicrotask(() => {
            for (const listener of listeners.get('error') ?? []) listener(error);
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

function fakeSpawnWithoutClose(
  onKill: (signal: NodeJS.Signals) => void,
  closeOnSigkill = false,
  sigkillReturnsFalse = false,
) {
  return () => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const child = {
      stdout: { on: () => undefined },
      stderr: { on: () => undefined },
      stdin: { end: () => undefined },
      kill: (signal: NodeJS.Signals) => {
        onKill(signal);
        if (closeOnSigkill && signal === 'SIGKILL') {
          for (const listener of listeners.get('close') ?? []) listener(null, 'SIGKILL');
        }
        return !(sigkillReturnsFalse && signal === 'SIGKILL');
      },
      on: (event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      },
    };
    return child as never;
  };
}
