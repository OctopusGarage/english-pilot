import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearAgentSession,
  getAgentSession,
  saveAgentSessionFromResult,
} from '../../src/agent/session-store.js';
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
});

function runResult(ids: { sessionId: string }): ExternalAgentRunResult {
  return {
    operation: 'external-agent-run',
    backend: 'claude',
    command: 'claude',
    args: [],
    cwd: '/tmp/project',
    promptStdin: 'Hello',
    dryRun: false,
    exitCode: 0,
    stdout: '',
    stderr: '',
    sessionId: ids.sessionId,
  };
}
