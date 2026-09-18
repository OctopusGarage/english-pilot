import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/adapters/cli.js';
import { monitorExternalChannelText } from '../../src/channels/external-monitor.js';

describe('external channel monitor', () => {
  let previousHome: string | undefined;
  let previousBackend: string | undefined;
  let previousPython: string | undefined;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    previousBackend = process.env.ENGLISH_PILOT_REWRITE_BACKEND;
    previousPython = process.env.ARGOS_TRANSLATE_PYTHON;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-external-monitor-'));
    process.env.ENGLISH_PILOT_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) {
      delete process.env.ENGLISH_PILOT_HOME;
    } else {
      process.env.ENGLISH_PILOT_HOME = previousHome;
    }
    restoreEnv('ENGLISH_PILOT_REWRITE_BACKEND', previousBackend);
    restoreEnv('ARGOS_TRANSLATE_PYTHON', previousPython);
    rmSync(home, { recursive: true, force: true });
  });

  it('does not ask the agent for coaching on English-only messages in coach mode', () => {
    runCli(['config', 'use', 'coach']);

    const result = monitorExternalChannelText({
      text: "I'm tired today",
      replyMode: 'always',
      source: 'wechat-channel',
      channelTag: 'wechat',
      coachingScene: 'WeChat chat coaching',
      quoteStyle: 'plain',
    });

    expect(result).toMatchObject({
      decision: 'ALLOW_SILENT',
      recorded: false,
    });
    expect(result.agentCoachingInstruction).toBeUndefined();
  });

  it('does not present or record a fallback when a blocked channel message has no displayable rewrite', () => {
    const fakePython = join(home, 'fake-python');
    writeFileSync(fakePython, '#!/bin/sh\ncat >/dev/null\nprintf "I want you to contact English. Down."\n', 'utf8');
    chmodSync(fakePython, 0o755);
    process.env.ENGLISH_PILOT_REWRITE_BACKEND = 'argos';
    process.env.ARGOS_TRANSLATE_PYTHON = fakePython;

    const result = monitorExternalChannelText({
      text: '帮我联系英语',
      replyMode: 'violation',
      source: 'wechat-channel',
      channelTag: 'wechat',
      coachingScene: 'WeChat chat coaching',
      quoteStyle: 'plain',
    });

    expect(result).toMatchObject({
      decision: 'BLOCK',
      shouldReply: true,
      recorded: false,
    });
    expect(result.rewrite).toBeUndefined();
    expect(result.replyText).not.toContain('Please rewrite this mainly in English');
    expect(result.replyText).toContain('I could not produce a reliable English rewrite automatically.');
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
