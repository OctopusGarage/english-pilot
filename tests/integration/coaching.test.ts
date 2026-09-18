import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/adapters/cli.js';
import { buildCoachingContext } from '../../src/core/coaching-context.js';
import { defaultConfig } from '../../src/core/policy.js';

describe('inline coaching policy', () => {
  let previousHome: string | undefined;
  let previousBackend: string | undefined;
  let previousPython: string | undefined;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    previousBackend = process.env.ENGLISH_PILOT_REWRITE_BACKEND;
    previousPython = process.env.ARGOS_TRANSLATE_PYTHON;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-coaching-'));
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

  it('does not expose a fallback rewrite when local translator output fails the quality gate', () => {
    const fakePython = join(home, 'fake-python');
    writeFileSync(fakePython, '#!/bin/sh\ncat >/dev/null\nprintf "I want you to contact English. Down."\n', 'utf8');
    chmodSync(fakePython, 0o755);
    process.env.ENGLISH_PILOT_REWRITE_BACKEND = 'argos';
    process.env.ARGOS_TRANSLATE_PYTHON = fakePython;

    const result = runCli(['check', '--text', '帮我联系英语', '--json']);
    const output = JSON.parse(result.stdout);

    expect(output.decision).toBe('BLOCK');
    expect(output.rewrite).toBeUndefined();
  });

  it('does not add an inline coaching note when no displayable rewrite is available', () => {
    runCli(['config', 'use', 'coach']);
    const fakePython = join(home, 'fake-python');
    writeFileSync(fakePython, '#!/bin/sh\ncat >/dev/null\nprintf "I want you to contact English. Down."\n', 'utf8');
    chmodSync(fakePython, 0o755);
    process.env.ENGLISH_PILOT_REWRITE_BACKEND = 'argos';
    process.env.ARGOS_TRANSLATE_PYTHON = fakePython;

    const result = runCli(['check', '--text', 'I want to 和你对话来练习英语 in this chat.', '--json']);
    const output = JSON.parse(result.stdout);

    expect(output.decision).toBe('ALLOW_WITH_COACHING');
    expect(output.coachingNote).toBeUndefined();
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

  it('adds software-engineering guidance to assistant-facing coaching context', () => {
    runCli(['config', 'use', 'force']);

    const result = runCli(['coach', 'context', '--json']);
    const context = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(context).toMatchObject({
      domainReference: {
        style: 'software-engineering',
        examples: expect.arrayContaining([
          'append an English note at the end',
          'make the failure path explicit',
          'this change belongs at the module boundary',
        ]),
      },
    });
    expect(context.finalResponseInstruction).toContain('For programming-task conversations');
    expect(context.finalResponseInstruction).toContain('software-engineering English');
  });

  it('uses rich assistant note guidance by default', () => {
    const context = buildCoachingContext({
      config: { ...defaultConfig, coachingIntensity: 'force' },
      promptEvents: [],
      now: new Date('2026-09-04T00:00:00.000Z'),
    });

    expect(context.finalResponseInstruction).toContain('Rich English Note');
    expect(context.finalResponseInstruction).toContain('Useful patterns:');
    expect(context.finalResponseInstruction).toContain('Collocations: startup issue');
    expect(context.finalResponseInstruction).not.toContain('one concise note');
    expect(context.finalResponseInstruction).not.toContain('compact');
    expect(context.cadence).not.toContain('keep the note compact');
    expect(context.policy.assistantEnglishNoteDepth).toBe('rich');
  });

  it('uses compact assistant note guidance when configured', () => {
    const context = buildCoachingContext({
      config: { ...defaultConfig, assistantEnglishNoteDepth: 'compact', coachingIntensity: 'force' },
      promptEvents: [],
      now: new Date('2026-09-04T00:00:00.000Z'),
    });

    expect(context.finalResponseInstruction).toContain('1-3 short lines');
    expect(context.finalResponseInstruction).toContain('English note: "original phrase" -> "more natural English"');
    expect(context.finalResponseInstruction).not.toContain('Useful patterns:');
    expect(context.policy.assistantEnglishNoteDepth).toBe('compact');
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

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
