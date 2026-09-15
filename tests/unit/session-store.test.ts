import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearAgentSession, getAgentSession, saveAgentSessionFromResult } from '../../src/agent/session-store.js';
import type { ExternalAgentRunResult } from '../../src/agent/runner.js';

describe('agent session store', () => {
  let previousHome: string | undefined;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-session-store-'));
    process.env.ENGLISH_PILOT_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.ENGLISH_PILOT_HOME;
    else process.env.ENGLISH_PILOT_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  });

  it('persists and retrieves a backend-specific conversation id by scope and cwd', () => {
    const saved = saveAgentSessionFromResult('feishu:chat-1', runResult({ sessionId: ' claude-1 ' }));

    expect(saved).toMatchObject({
      scope: 'feishu:chat-1',
      backend: 'claude',
      cwd: '/tmp/project',
      sessionId: 'claude-1',
    });
    expect(getAgentSession('feishu:chat-1', 'claude', '/tmp/project')).toMatchObject({ sessionId: 'claude-1' });
    expect(getAgentSession('feishu:chat-1', 'codex', '/tmp/project')).toBeUndefined();
    expect(getAgentSession('feishu:chat-1', 'claude', '/tmp/other')).toBeUndefined();
    expect(clearAgentSession('feishu:chat-1')).toBe(true);
    expect(clearAgentSession('feishu:chat-1')).toBe(false);
  });

  it('keeps sessions for the same scope isolated by backend and cwd', () => {
    saveAgentSessionFromResult('feishu:chat-1', runResult({ sessionId: 'claude-1', cwd: '/tmp/project-a' }));
    saveAgentSessionFromResult('feishu:chat-1', runResult({ threadId: 'codex-1', cwd: '/tmp/project-a' }));
    saveAgentSessionFromResult('feishu:chat-1', runResult({ sessionId: 'claude-2', cwd: '/tmp/project-b' }));

    expect(getAgentSession('feishu:chat-1', 'claude', '/tmp/project-a')).toMatchObject({
      sessionId: 'claude-1',
    });
    expect(getAgentSession('feishu:chat-1', 'codex', '/tmp/project-a')).toMatchObject({
      threadId: 'codex-1',
    });
    expect(getAgentSession('feishu:chat-1', 'claude', '/tmp/project-b')).toMatchObject({
      sessionId: 'claude-2',
    });
  });

  it('ignores malformed persisted entries instead of restoring unsafe session state', () => {
    writeFileSync(
      join(home, 'agent-sessions.json'),
      JSON.stringify({
        invalid: { scope: 'wrong-scope', backend: 'claude', cwd: '/tmp/project', sessionId: 'session-1' },
        broken: { scope: 'broken', backend: 'codex', cwd: '/tmp/project' },
      }),
    );

    expect(getAgentSession('invalid', 'claude', '/tmp/project')).toBeUndefined();
    expect(getAgentSession('broken', 'codex', '/tmp/project')).toBeUndefined();
  });

  it('tightens permissions when updating an existing session store file', () => {
    const path = join(home, 'agent-sessions.json');
    writeFileSync(path, '{}\n', 'utf8');
    chmodSync(path, 0o644);

    saveAgentSessionFromResult('feishu:chat-1', runResult({ sessionId: 'claude-1' }));

    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});

function runResult(ids: { sessionId?: string; threadId?: string; cwd?: string }): ExternalAgentRunResult {
  const backend = ids.threadId ? 'codex' : 'claude';
  return {
    operation: 'external-agent-run',
    backend,
    command: backend,
    args: [],
    cwd: ids.cwd ?? '/tmp/project',
    promptStdin: 'Hello',
    dryRun: false,
    exitCode: 0,
    stdout: '',
    stderr: '',
    ...(ids.sessionId ? { sessionId: ids.sessionId } : {}),
    ...(ids.threadId ? { threadId: ids.threadId } : {}),
  };
}
