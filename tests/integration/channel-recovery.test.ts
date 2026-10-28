import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearAgentSession, getAgentSession, saveAgentSessionFromResult } from '../../src/agent/session-store.js';
import type { ExternalAgentRunResult, runExternalAgent } from '../../src/agent/runner.js';
import { runExternalChannelConversation } from '../../src/channels/conversation-runtime.js';

describe('channel failure recovery', () => {
  let home: string;
  let previousHome: string | undefined;
  const scope = 'wechat:test-account:test-user:dm';

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-recovery-'));
    process.env.ENGLISH_PILOT_HOME = home;
    writeFileSync(
      join(home, 'config.json'),
      JSON.stringify({ externalAgentBackend: 'claude', externalAgentCwd: home }),
    );
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.ENGLISH_PILOT_HOME;
    else process.env.ENGLISH_PILOT_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  });

  function result(overrides: Partial<ExternalAgentRunResult> = {}): ExternalAgentRunResult {
    return {
      operation: 'external-agent-run',
      backend: 'claude',
      command: 'claude',
      args: [],
      cwd: home,
      promptStdin: 'test',
      dryRun: false,
      exitCode: 0,
      stdout: 'Recovered reply',
      stderr: '',
      sessionId: 'new-session',
      ...overrides,
    };
  }

  function missingSession(): ExternalAgentRunResult {
    return result({ exitCode: 1, stdout: '', stderr: 'No conversation found with session ID: stale-session\n' });
  }

  function conversation(runAgent: typeof runExternalAgent, channel: 'wechat' | 'feishu' = 'wechat') {
    const sent: string[] = [];
    const pending = runExternalChannelConversation({
      channel,
      scope,
      text: 'Please answer this request.',
      inputKind: 'text',
      metadata: {},
      messageLabel: 'test',
      processingAckText: 'receiving',
      monitorText: () => ({ decision: 'ALLOW_SILENT', shouldReply: false, recorded: false }),
      sendText: async (text) => {
        sent.push(text);
        return { sent: true };
      },
      runAgent,
    });
    return { sent, pending };
  }

  it.each(['wechat', 'feishu'] as const)(
    'recovers a missing Claude session within the same %s request',
    async (channel) => {
      saveAgentSessionFromResult(scope, result({ sessionId: 'stale-session' }));
      const calls: Parameters<typeof runExternalAgent>[0][] = [];
      const { sent, pending } = conversation(async (options) => {
        calls.push(options);
        return options.sessionId ? missingSession() : result();
      }, channel);

      expect(await pending).toMatchObject({ replied: true });
      expect(sent).toEqual(['receiving', 'Recovered reply']);
      expect(calls.map((call) => call.sessionId)).toEqual(['stale-session', undefined]);
      expect(calls[1]?.prompt).toBe(calls[0]?.prompt);
      expect(getAgentSession(scope, 'claude', home)?.sessionId).toBe('new-session');
    },
  );

  it('stops after one recovery attempt and sends a failure reply', async () => {
    saveAgentSessionFromResult(scope, result({ sessionId: 'stale-session' }));
    let calls = 0;
    const { sent, pending } = conversation(async () => {
      calls++;
      return missingSession();
    });
    expect(await pending).toMatchObject({ replied: true, reason: 'agent-failed' });
    expect(calls).toBe(2);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain('could not complete');
    expect(sent[1]).not.toContain('stale-session');
    expect(getAgentSession(scope, 'claude', home)).toBeUndefined();
  });

  it.each(['authentication failed', 'External agent timed out after 120000ms.'])(
    'reports %s without replaying the request',
    async (stderr) => {
      saveAgentSessionFromResult(scope, result({ sessionId: 'stale-session' }));
      let calls = 0;
      const { sent, pending } = conversation(async () => {
        calls++;
        return result({ exitCode: 1, stderr, stdout: '' });
      });
      expect(await pending).toMatchObject({ replied: true, reason: 'agent-failed' });
      expect(calls).toBe(1);
      expect(sent[1]).toContain('could not complete');
    },
  );

  it('reports a runner exception instead of leaving only the acknowledgement', async () => {
    const { sent, pending } = conversation(async () => {
      throw new Error('private backend detail');
    });
    expect(await pending).toMatchObject({ replied: true, reason: 'agent-failed' });
    expect(sent[1]).toContain('could not complete');
    expect(sent[1]).not.toContain('private backend detail');
  });

  it('reports an empty agent result instead of leaving only the acknowledgement', async () => {
    const { sent, pending } = conversation(async () => result({ stdout: '' }));
    expect(await pending).toMatchObject({ replied: true, reason: 'agent-failed' });
    expect(sent[1]).toContain('could not complete');
  });

  it('does not retry an old request after /new invalidates its pending turn', async () => {
    saveAgentSessionFromResult(scope, result({ sessionId: 'stale-session' }));
    let finish!: (value: ExternalAgentRunResult) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let calls = 0;
    const { pending } = conversation(async () => {
      calls++;
      started();
      return new Promise<ExternalAgentRunResult>((resolve) => {
        finish = resolve;
      });
    });
    await ready;
    clearAgentSession(scope);
    saveAgentSessionFromResult(scope, result({ sessionId: 'replacement-session' }));
    finish(missingSession());
    await pending;
    expect(calls).toBe(1);
    expect(getAgentSession(scope, 'claude', home)?.sessionId).toBe('replacement-session');
  });
});
