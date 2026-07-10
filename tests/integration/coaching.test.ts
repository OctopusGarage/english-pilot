import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/adapters/cli.js';

describe('inline coaching policy', () => {
  let previousHome: string | undefined;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-coaching-'));
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

  it('adds one coaching note for the first mixed-language check', () => {
    const result = runCli([
      'check',
      '--text',
      'I want to create a new project because this workflow should help me practice English while we 创建一个新的项目流程 for review.',
      '--json',
    ]);

    expect(JSON.parse(result.stdout)).toMatchObject({
      decision: 'ALLOW_WITH_COACHING',
      coachingNote: expect.stringContaining('English note:'),
    });
  });

  it('adds a teaching note for short Chinese fragments and awkward English in force mode', () => {
    runCli(['config', 'use', 'force']);

    const result = runCli(['check', '--text', 'what is the weather about 广州', '--json']);
    const output = JSON.parse(result.stdout);

    expect(output).toMatchObject({
      decision: 'ALLOW_WITH_COACHING',
      ignoredNonEnglishFragments: ['广州'],
      coachingNote: expect.stringContaining("What's the weather like in Guangzhou?"),
    });
    expect(output.coachingNote).toContain('Why:');
    expect(output.coachingNote).toContain('IPA:');
  });

  it('reports non-blocking coach mode in agent-facing coaching context', () => {
    runCli(['config', 'use', 'coach']);

    const result = runCli(['coach', 'context', '--json']);
    const context = JSON.parse(result.stdout);

    expect(context).toMatchObject({
      guidance: expect.stringContaining('Coach mode is enabled'),
      policy: {
        gateMode: 'coach',
        intensity: 'force',
      },
      decision: {
        shouldOfferInlineCoaching: true,
      },
    });
  });

  it('suppresses coaching notes during the cooldown window', () => {
    runCli([
      'check',
      '--text',
      'I want to create a new project because this workflow should help me practice English while we 创建一个新的项目流程 for review.',
      '--json',
    ]);
    const second = runCli(['check', '--text', 'I want to 设计优化整个流程 for this flow.', '--json']);

    expect(JSON.parse(second.stdout).coachingNote).toBeUndefined();
  });

  it('does not add inline coaching when intensity is low', () => {
    runCli(['config', 'set', 'coachingIntensity', 'low']);
    const result = runCli([
      'check',
      '--text',
      'I want to create a new project because this workflow should help me practice English while we 创建一个新的项目流程 for review.',
      '--json',
    ]);

    expect(JSON.parse(result.stdout).coachingNote).toBeUndefined();
  });

  it('respects the daily inline coaching cap', () => {
    runCli(['config', 'set', 'coachingCooldownMinutes', '0']);
    runCli(['config', 'set', 'maxInlineCoachingPerDay', '1']);
    runCli([
      'check',
      '--text',
      'I want to create a new project because this workflow should help me practice English while we 创建一个新的项目流程 for review.',
      '--json',
    ]);

    const second = runCli(['check', '--text', 'I want to 设计优化整个流程 for this flow.', '--json']);

    expect(JSON.parse(second.stdout).coachingNote).toBeUndefined();
  });

  it('reports structured coaching context for the next inline note', () => {
    runCli(['config', 'set', 'coachingCooldownMinutes', '30']);
    runCli(['config', 'set', 'maxInlineCoachingPerDay', '1']);
    runCli([
      'check',
      '--text',
      'I want to create a new project because this workflow should help me practice English while we 创建一个新的项目流程 for review.',
      '--json',
    ]);

    const result = runCli(['coach', 'context', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      policy: {
        gateMode: 'enforce',
        intensity: 'medium',
        cooldownMinutes: 30,
        maxInlineCoachingPerDay: 1,
      },
      today: {
        coachingShown: 1,
        remaining: 0,
      },
      cooldown: {
        active: true,
      },
      decision: {
        shouldOfferInlineCoaching: false,
        reason: 'daily-cap-reached',
      },
    });
  });
});
