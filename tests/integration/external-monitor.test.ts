import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/adapters/cli.js';
import { monitorExternalChannelText } from '../../src/channels/external-monitor.js';

describe('external channel monitor', () => {
  let previousHome: string | undefined;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-external-monitor-'));
    process.env.ENGLISH_PILOT_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) {
      delete process.env.ENGLISH_PILOT_HOME;
    } else {
      process.env.ENGLISH_PILOT_HOME = previousHome;
    }
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
});
