import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli, runCliAsync } from '../../src/adapters/cli.js';

describe('runCli', () => {
  let previousHome: string | undefined;
  let previousRewriteBackend: string | undefined;
  let previousArgosPython: string | undefined;
  let previousRewriteTimeout: string | undefined;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    previousRewriteBackend = process.env.ENGLISH_PILOT_REWRITE_BACKEND;
    previousArgosPython = process.env.ARGOS_TRANSLATE_PYTHON;
    previousRewriteTimeout = process.env.ENGLISH_PILOT_REWRITE_TIMEOUT_MS;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-cli-'));
    process.env.ENGLISH_PILOT_HOME = home;
    delete process.env.ENGLISH_PILOT_REWRITE_BACKEND;
    delete process.env.ARGOS_TRANSLATE_PYTHON;
    delete process.env.ENGLISH_PILOT_REWRITE_TIMEOUT_MS;
  });

  afterEach(() => {
    if (previousHome === undefined) {
      delete process.env.ENGLISH_PILOT_HOME;
    } else {
      process.env.ENGLISH_PILOT_HOME = previousHome;
    }
    restoreEnv({
      ENGLISH_PILOT_REWRITE_BACKEND: previousRewriteBackend,
      ARGOS_TRANSLATE_PYTHON: previousArgosPython,
      ENGLISH_PILOT_REWRITE_TIMEOUT_MS: previousRewriteTimeout,
    });
    rmSync(home, { recursive: true, force: true });
  });

  it('prints current roadmap and integration helper usage in help', () => {
    const result = runCli(['help']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      'english-pilot roadmap [--target feishu|wechat|cloud-stt] [--write] [--dir <path>] [--json]',
    );
    expect(result.stdout).toContain(
      'english-pilot handoff external-validation [--target feishu|wechat|cloud-stt] [--write|--verify] [--dir <path>] [--json]',
    );
    expect(result.stdout).toContain('english-pilot voice stt-assessment-history [--provider-name <name>] [--json]');
    expect(result.stdout).toContain(
      'english-pilot agent run --text "..." [--backend claude|codex] [--cwd <path>] [--dry-run] [--json]',
    );
  });

  it('dry-runs a Claude external agent invocation from the CLI', async () => {
    const result = await runCliAsync([
      'agent',
      'run',
      '--text',
      'Reply to this channel message.',
      '--backend',
      'claude',
      '--cwd',
      '/tmp/channel-project',
      '--dry-run',
      '--json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      operation: 'external-agent-run',
      backend: 'claude',
      dryRun: true,
      command: 'claude',
      cwd: '/tmp/channel-project',
      promptStdin: 'Reply to this channel message.',
    });
    expect(JSON.parse(result.stdout).args).toContain('-p');
  });

  it('dry-runs a Codex external agent invocation from the CLI', async () => {
    const result = await runCliAsync([
      'agent',
      'run',
      '--text',
      'Reply to this WeChat message.',
      '--backend',
      'codex',
      '--cwd',
      '/tmp/channel-project',
      '--dry-run',
      '--json',
    ]);

    const payload = JSON.parse(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(payload).toMatchObject({
      operation: 'external-agent-run',
      backend: 'codex',
      dryRun: true,
      command: 'codex',
      cwd: '/tmp/channel-project',
      promptStdin: 'Reply to this WeChat message.',
    });
    expect(payload.args).toEqual(expect.arrayContaining(['exec', '--json', '-C', '/tmp/channel-project', '-']));
  });

  it('prints and writes a reusable MCP client config', () => {
    const json = runCli(['mcp', 'config', '--json']);
    const write = runCli(['mcp', 'config', '--write', '--json']);
    const writtenPath = join(home, 'mcp.json');

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout)).toMatchObject({
      mcpServers: {
        'english-pilot': {
          command: 'english-pilot',
          args: ['serve', '--mcp'],
        },
      },
    });

    expect(write.exitCode).toBe(0);
    expect(write.stderr).toBe('');
    expect(JSON.parse(write.stdout)).toMatchObject({
      written: true,
      path: writtenPath,
      config: {
        mcpServers: {
          'english-pilot': {
            command: 'english-pilot',
            args: ['serve', '--mcp'],
          },
        },
      },
    });
    expect(JSON.parse(readFileSync(writtenPath, 'utf8'))).toMatchObject(JSON.parse(json.stdout));
  });

  it('requires an external agent backend for CLI channel execution', async () => {
    const result = await runCliAsync(['agent', 'run', '--text', 'Reply to this message.', '--dry-run', '--json']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Set externalAgentBackend to claude or codex');
  });

  it('returns no output for an allowed Claude hook prompt', () => {
    const result = runCli(
      ['hook', 'claude', '--stdin'],
      JSON.stringify({
        prompt: 'I want to create a new project.',
      }),
    );

    expect(result).toEqual({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });
  });

  it('supports Codex hook prompts with the same blocking response shape', () => {
    const result = runCli(
      ['hook', 'codex', '--stdin'],
      JSON.stringify({
        prompt: '我想创建一个 new project，用来辅助英语学习。',
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      decision: 'block',
    });
    expect(result.stdout).toContain('Please rewrite it in English.');
  });

  it('lets over-threshold Codex hook prompts pass in coach mode while recording a review item', () => {
    runCli(['config', 'use', 'coach']);

    const result = runCli(
      ['hook', 'codex', '--stdin'],
      JSON.stringify({
        prompt: '我想创建一个 new project，用来辅助英语学习。',
      }),
    );
    const stats = runCli(['stats', '--json']);
    const review = runCli(['review', '--json']);

    expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(JSON.parse(stats.stdout)).toMatchObject({
      promptEvents: 1,
      blockedPrompts: 0,
    });
    expect(JSON.parse(review.stdout)).toContainEqual(
      expect.objectContaining({
        original: '我想创建一个 new project，用来辅助英语学习。',
        suggested: expect.stringContaining('I want to create a new project'),
      }),
    );
  });

  it('records Claude hook prompt events', () => {
    runCli(
      ['hook', 'claude', '--stdin'],
      JSON.stringify({
        prompt: 'I want to create a new project.',
      }),
    );

    const stats = runCli(['stats', '--json']);

    expect(JSON.parse(stats.stdout)).toMatchObject({
      promptEvents: 1,
      blockedPrompts: 0,
    });
  });

  it('records Codex hook prompt events', () => {
    runCli(
      ['hook', 'codex', '--stdin'],
      JSON.stringify({
        prompt: 'I want to create a new project.',
      }),
    );

    const stats = runCli(['stats', '--json']);

    expect(JSON.parse(stats.stdout)).toMatchObject({
      promptEvents: 1,
      blockedPrompts: 0,
    });
  });

  it('returns Claude block JSON for a blocked Claude hook prompt', () => {
    const result = runCli(
      ['hook', 'claude', '--stdin'],
      JSON.stringify({
        prompt: '我想创建一个 new project，用来辅助英语学习。',
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      decision: 'block',
    });
    expect(result.stdout).toContain('Please rewrite it in English.');
    expect(result.stdout).toContain('I want to create a new project to help me learn and use English');
    expect(result.stdout).not.toContain('next version');
  });

  it('returns a copyable English rewrite for an inaccessible URL prompt', () => {
    const result = runCli(
      ['hook', 'codex', '--stdin'],
      JSON.stringify({
        prompt: '访问不了：  http://localhost:60806',
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      decision: 'block',
      reason: expect.stringContaining('I cannot access http://localhost:60806.'),
    });
    expect(result.stdout).not.toContain('Please rewrite this mainly in English while preserving the original intent.');
  });

  it('uses configured local rewrite translation in hook feedback', () => {
    const fakePython = join(home, 'fake-python');
    writeFileSync(
      fakePython,
      '#!/bin/sh\ncat >/dev/null\nprintf "You already have lightweight translation configured, right? Can I use it directly now?"\n',
      'utf8',
    );
    chmodSync(fakePython, 0o755);
    runCli(['config', 'set', 'rewriteBackend', 'argos']);
    runCli(['config', 'set', 'argosPython', fakePython]);
    const result = runCli(
      ['hook', 'codex', '--stdin'],
      JSON.stringify({
        prompt: '你已经配置了轻量翻译了是吧，现在可以直接用了是吧',
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      decision: 'block',
      reason: expect.stringContaining('You already have lightweight translation configured'),
    });
  });

  it('lists learning intensity config profiles', () => {
    const result = runCli(['config', 'profiles', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      profiles: [
        {
          id: 'beginner',
          gateMode: 'enforce',
          maxChineseRatio: 0.5,
          coachingIntensity: 'low',
        },
        {
          id: 'balanced',
          gateMode: 'enforce',
          maxChineseRatio: 0.3,
          coachingIntensity: 'medium',
        },
        {
          id: 'strict',
          gateMode: 'enforce',
          maxChineseRatio: 0.1,
          coachingIntensity: 'high',
        },
        {
          id: 'force',
          gateMode: 'enforce',
          maxChineseRatio: 0.1,
          coachingIntensity: 'force',
        },
        {
          id: 'coach',
          gateMode: 'coach',
          maxChineseRatio: 0.3,
          coachingIntensity: 'force',
        },
      ],
    });
  });

  it('applies a learning intensity config profile without replacing unrelated settings', () => {
    runCli(['config', 'set', 'rewriteBackend', 'argos']);
    runCli(['config', 'set', 'argosPython', '/tmp/local-argos-python']);

    const result = runCli(['config', 'use', 'strict', '--json']);
    const config = runCli(['config', 'get']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      profile: {
        id: 'strict',
        gateMode: 'enforce',
        maxChineseRatio: 0.1,
        targetChineseRatio: 0.03,
        coachingIntensity: 'high',
      },
      config: {
        gateMode: 'enforce',
        maxChineseRatio: 0.1,
        targetChineseRatio: 0.03,
        coachingIntensity: 'high',
        rewriteBackend: 'argos',
        argosPython: '/tmp/local-argos-python',
      },
    });
    expect(JSON.parse(config.stdout)).toMatchObject({
      gateMode: 'enforce',
      maxChineseRatio: 0.1,
      targetChineseRatio: 0.03,
      coachingIntensity: 'high',
      rewriteBackend: 'argos',
      argosPython: '/tmp/local-argos-python',
    });
  });

  it('reports the active learning intensity config profile status', () => {
    runCli(['config', 'use', 'strict', '--json']);

    const matched = runCli(['config', 'profile-status', '--json']);
    runCli(['config', 'set', 'maxInlineCoachingPerDay', '10']);
    const customized = runCli(['config', 'profile-status', '--json']);

    expect(matched.exitCode).toBe(0);
    expect(matched.stderr).toBe('');
    expect(JSON.parse(matched.stdout)).toMatchObject({
      activeProfile: {
        id: 'strict',
      },
      nearestProfile: {
        id: 'strict',
      },
      differences: [],
    });
    expect(JSON.parse(customized.stdout)).toMatchObject({
      activeProfile: null,
      nearestProfile: {
        id: 'strict',
      },
      differences: [
        {
          key: 'maxInlineCoachingPerDay',
          actual: 10,
          expected: 12,
        },
      ],
    });
  });

  it('asks for more prompt history before suggesting ratio progression changes', () => {
    runCli(['check', '--text', 'I want to create a new project.', '--json']);

    const result = runCli(['config', 'progression-suggestion', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: 'manual',
      minimumEvents: 5,
      eventCount: 1,
      recommendation: {
        action: 'collect_more_data',
        profile: null,
        command: null,
      },
    });
  });

  it('suggests the strict profile after consistently English prompts', () => {
    for (let index = 0; index < 5; index += 1) {
      runCli(['check', '--text', `I want to keep this workflow in English number ${index}.`, '--json']);
    }

    const result = runCli(['config', 'progression-suggestion', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      eventCount: 5,
      blockedPrompts: 0,
      averageNonEnglishRatio: 0,
      recommendation: {
        action: 'tighten',
        profile: {
          id: 'strict',
        },
        command: 'english-pilot config use strict',
      },
    });
  });

  it('suggests the beginner profile after frequent blocked prompts', () => {
    runCli(['config', 'use', 'strict', '--json']);
    for (let index = 0; index < 5; index += 1) {
      runCli(['check', '--text', `你好，继续处理这个任务 ${index}`, '--json']);
    }

    const result = runCli(['config', 'progression-suggestion', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      eventCount: 5,
      blockedPrompts: 5,
      recommendation: {
        action: 'relax',
        profile: {
          id: 'beginner',
        },
        command: 'english-pilot config use beginner',
      },
    });
  });

  it('does not apply ratio progression suggestions while mode is manual', () => {
    for (let index = 0; index < 5; index += 1) {
      runCli(['check', '--text', `I want to keep this workflow in English number ${index}.`, '--json']);
    }

    const result = runCli(['config', 'progression-apply', '--yes', '--json']);
    const profileStatus = runCli(['config', 'profile-status', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      dryRun: false,
      applied: false,
      blocker: 'ratioProgression is manual',
      suggestion: {
        recommendation: {
          action: 'tighten',
          profile: {
            id: 'strict',
          },
        },
      },
    });
    expect(JSON.parse(profileStatus.stdout)).toMatchObject({
      activeProfile: {
        id: 'balanced',
      },
    });
  });

  it('applies ratio progression suggestions only when scheduled mode and --yes are used', () => {
    runCli(['config', 'set', 'ratioProgression', 'scheduled']);
    for (let index = 0; index < 5; index += 1) {
      runCli(['check', '--text', `I want to keep this workflow in English number ${index}.`, '--json']);
    }

    const preview = runCli(['config', 'progression-apply', '--json']);
    const applied = runCli(['config', 'progression-apply', '--yes', '--json']);
    const config = runCli(['config', 'get']);

    expect(preview.exitCode).toBe(0);
    expect(JSON.parse(preview.stdout)).toMatchObject({
      dryRun: true,
      applied: false,
      targetProfile: {
        id: 'strict',
      },
    });
    expect(applied.exitCode).toBe(0);
    expect(applied.stderr).toBe('');
    expect(JSON.parse(applied.stdout)).toMatchObject({
      dryRun: false,
      applied: true,
      targetProfile: {
        id: 'strict',
      },
      config: {
        maxChineseRatio: 0.1,
        targetChineseRatio: 0.03,
        coachingIntensity: 'high',
        ratioProgression: 'scheduled',
      },
    });
    expect(JSON.parse(config.stdout)).toMatchObject({
      maxChineseRatio: 0.1,
      targetChineseRatio: 0.03,
      coachingIntensity: 'high',
      ratioProgression: 'scheduled',
    });
  });

  it('reports invalid Claude hook JSON as a CLI error', () => {
    const result = runCli(['hook', 'claude', '--stdin'], '{not json');

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Invalid Claude hook JSON');
  });

  it('returns an English rewrite for blocked check output', () => {
    const result = runCli(['check', '--text', '我想创建一个 new project，用来辅助英语学习。', '--json']);

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      decision: 'BLOCK',
      rewrite: expect.stringContaining('create a new project'),
    });
  });

  it('reports first-version capability status', () => {
    const json = runCli(['status', '--json']);
    const human = runCli(['status']);

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout)).toMatchObject({
      name: 'EnglishPilot',
      version: '0.1.0',
      supported: {
        hooks: expect.arrayContaining(['claude', 'codex']),
        cli: expect.arrayContaining([
          'check',
          'hook',
          'roadmap',
          'roadmap --target',
          'voice stt-contract',
          'voice stt-validate',
          'voice stt-assessment-history',
          'voice stt-wrapper-template',
          'voice transcribe',
          'voice practice',
          'integrations send-readiness',
          'integrations send',
          'integrations send --require-validation',
          'integrations account-guide',
          'integrations validation-history',
          'integrations message-coaching --record',
          'integrations event-coaching',
          'integrations deliver',
          'doctor',
        ]),
        mcp: expect.arrayContaining([
          'english_status',
          'english_roadmap',
          'english_voice_stt_contract',
          'english_voice_stt_validate',
          'english_voice_stt_wrapper_template',
          'english_voice_transcribe',
          'english_voice_practice_from_audio',
          'english_integration_send_readiness',
          'english_integration_account_guide',
          'english_integration_validation_history',
          'english_integration_event_coaching',
          'english_integration_deliver',
        ]),
        integrations: expect.arrayContaining([
          'Feishu/Lark QR onboarding',
          'Feishu/Lark long-connection message coaching',
          'Feishu/Lark allowlisted sender monitoring',
          'Feishu/Lark external AgentRunner handoff',
          'Feishu/Lark conversation session resume',
          'Feishu/Lark voice-to-agent transcription',
          'WeChat QR-login onboarding',
          'WeChat long-connection message coaching',
          'WeChat allowlisted sender monitoring',
          'WeChat external AgentRunner handoff',
          'WeChat conversation thread resume',
          'WeChat voice transcript-to-agent routing',
          'WeChat long-connection reconnect and session refresh guidance',
          'WeChat account-validation-gated sender',
        ]),
        voice: [],
      },
      deferred: expect.arrayContaining([
        expect.stringContaining('Obsidian/Markdown review export'),
        expect.stringContaining('General Voice/STT practice'),
      ]),
      planned: expect.arrayContaining(['Provider-specific cloud STT contract if generic-json is insufficient']),
      openDecisions: [],
    });
    expect(JSON.parse(json.stdout).openDecisions).not.toContain('Feishu/Lark delivery mode');
    expect(JSON.parse(json.stdout).openDecisions).not.toContain('WeChat delivery mode');
    expect(JSON.parse(json.stdout).openDecisions).not.toContain('credential storage policy');
    expect(JSON.parse(json.stdout).openDecisions).not.toContain('cloud speech-to-text provider');
    expect(human.stdout).toContain('Supported');
    expect(human.stdout).toContain('voice practice');
    expect(human.stdout).toContain('Planned');
    expect(human.stdout).toContain('Open decisions');
  });

  it('includes cloud STT provider assessment history in doctor diagnostics', () => {
    runCli([
      'voice',
      'stt-assess-provider',
      '--provider-name',
      'acme-stt',
      '--response-json',
      '{"payload":{"alternatives":[]}}',
      '--record',
      '--json',
    ]);

    const json = runCli(['doctor', '--json']);
    const human = runCli(['doctor']);

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout)).toMatchObject({
      ok: true,
      voiceSttAssessments: {
        records: [
          {
            providerName: 'acme-stt',
            genericJsonCompatible: false,
            providerSpecificContractNeeded: true,
          },
        ],
      },
    });
    expect(human.stdout).toContain('Voice STT assessments: 1 recorded');
    expect(human.stdout).toContain('latest acme-stt needs provider-specific contract');
  });

  it('writes doctor diagnostics as Markdown when requested', () => {
    const directory = join(home, 'doctor-export');
    const result = runCli(['doctor', '--write', '--dir', directory, '--json']);
    const outputPath = join(directory, 'english-pilot-doctor.md');

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      export: {
        written: true,
        path: outputPath,
      },
    });
    const markdown = readFileSync(outputPath, 'utf8');
    expect(markdown).toContain('# EnglishPilot Doctor Report');
    expect(markdown).toContain('## Voice');
    expect(markdown).toContain('Voice STT assessments');
  });

  it('includes a provider-specific STT contract draft in cloud-STT bundles after incompatible assessment evidence exists', () => {
    writeFileSync(
      join(home, 'voice-stt-assessments.jsonl'),
      `${JSON.stringify({
        id: 'voice_stt_assessment_20260708000000_abc123',
        createdAt: '2026-07-08T00:00:00.000Z',
        operation: 'voice-stt-provider-assessment',
        providerName: 'acme-stt',
        genericJsonCompatible: false,
        providerSpecificContractNeeded: true,
        validation: {
          provider: 'generic-json',
          valid: false,
          blockers: ['Response must include transcript, text, or segments[].text.'],
        },
      })}\n`,
      'utf8',
    );
    const directory = join(home, 'cloud-stt-provider-draft-bundle');

    const result = runCli([
      'handoff',
      'external-validation',
      '--target',
      'cloud-stt',
      '--write',
      '--dir',
      directory,
      '--json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      operation: 'external-validation-handoff-bundle',
      target: 'cloud-stt',
      written: true,
      files: expect.arrayContaining([
        { kind: 'voice-stt-provider-contract-draft', path: join(directory, 'voice-stt', 'provider-contract-draft.md') },
        {
          kind: 'voice-stt-provider-contract-draft-json',
          path: join(directory, 'voice-stt', 'provider-contract-draft.json'),
        },
      ]),
    });
    expect(JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'))).toMatchObject({
      files: expect.arrayContaining([
        {
          kind: 'voice-stt-provider-contract-draft-json',
          path: join(directory, 'voice-stt', 'provider-contract-draft.json'),
        },
      ]),
    });
    expect(
      JSON.parse(readFileSync(join(directory, 'voice-stt', 'provider-contract-draft.json'), 'utf8')),
    ).toMatchObject({
      operation: 'voice-stt-provider-contract-draft',
      providerName: 'acme-stt',
      status: 'ready-to-design',
      providerSpecificContractNeeded: true,
    });
    expect(readFileSync(join(directory, 'voice-stt', 'provider-contract-draft.md'), 'utf8')).toContain(
      'Provider-specific STT contract draft: acme-stt',
    );
    expect(readFileSync(join(directory, 'README.md'), 'utf8')).toContain('voice-stt/provider-contract-draft.json');
    const verification = runCli([
      'handoff',
      'external-validation',
      '--target',
      'cloud-stt',
      '--verify',
      '--dir',
      directory,
      '--json',
    ]);
    expect(verification.exitCode).toBe(0);
    expect(JSON.parse(verification.stdout)).toMatchObject({
      ok: true,
      problems: [],
    });
  });

  it('writes remaining roadmap items as a Markdown handoff when requested', () => {
    const directory = join(home, 'roadmap-export');
    const result = runCli(['roadmap', '--write', '--dir', directory, '--json']);
    const outputPath = join(directory, 'english-pilot-roadmap.md');

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      items: expect.any(Array),
      export: {
        written: true,
        path: outputPath,
      },
    });
    const markdown = readFileSync(outputPath, 'utf8');
    expect(markdown).toContain('# EnglishPilot Roadmap Handoff');
    expect(markdown).toContain('## wechat-long-connection-hardening');
    expect(markdown).toContain('- QR-login account setup verified on a real WeChat account');
    expect(markdown).toContain('english-pilot wechat start --dry-run --json');
    expect(markdown).toContain('## provider-specific-cloud-stt-contract');
  });

  it('writes the next roadmap actions as a Markdown handoff', () => {
    const directory = join(home, 'roadmap-next-export');
    const result = runCli(['roadmap', 'next', '--target', 'wechat', '--write', '--dir', directory, '--json']);
    const outputPath = join(directory, 'wechat-roadmap-next.md');

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      items: [
        {
          id: 'wechat-long-connection-hardening',
          nextCommand: 'english-pilot wechat setup',
          prerequisites: [
            'Run english-pilot wechat setup and scan the QR code.',
            'Run english-pilot wechat doctor --json to confirm the saved account is usable.',
            'Run english-pilot wechat start --dry-run --json before starting the long-connection process.',
          ],
          preflightCommands: [
            'english-pilot integrations account-guide --target wechat --json',
            'english-pilot wechat doctor --json',
            'english-pilot wechat start --dry-run --json',
          ],
          readinessChecks: [],
        },
      ],
      export: {
        written: true,
        path: outputPath,
      },
    });
    const markdown = readFileSync(outputPath, 'utf8');
    expect(markdown).toContain('# EnglishPilot Roadmap Next Actions');
    expect(markdown).toContain('## wechat-long-connection-hardening');
    expect(markdown).toContain('- Next evidence: saved WeChat QR-login account');
    expect(markdown).toContain('### Prerequisites');
    expect(markdown).toContain('- Run english-pilot wechat setup and scan the QR code.');
    expect(markdown).toContain('### Preflight Commands');
    expect(markdown).toContain('english-pilot integrations account-guide --target wechat --json');
    expect(markdown).toContain('### Readiness Checks');
    expect(markdown).toContain('- none');
    expect(markdown).toContain('english-pilot wechat setup');
  });

  it('returns cloud STT readiness checks in the next roadmap action', () => {
    const previous = {
      CLOUD_STT_PROVIDER: process.env.CLOUD_STT_PROVIDER,
      CLOUD_STT_API_KEY: process.env.CLOUD_STT_API_KEY,
      CLOUD_STT_ENDPOINT: process.env.CLOUD_STT_ENDPOINT,
    };
    process.env.CLOUD_STT_PROVIDER = 'generic-json';
    process.env.CLOUD_STT_API_KEY = 'cloud-stt-secret-value';
    delete process.env.CLOUD_STT_ENDPOINT;

    try {
      const json = runCli(['roadmap', 'next', '--target', 'cloud-stt', '--json']);
      const human = runCli(['roadmap', 'next', '--target', 'cloud-stt']);

      expect(json.exitCode).toBe(0);
      expect(json.stderr).toBe('');
      expect(JSON.parse(json.stdout)).toMatchObject({
        items: [
          {
            id: 'provider-specific-cloud-stt-contract',
            relatedTarget: 'cloud-stt',
            status: 'conditional',
            preflightCommands: [
              'english-pilot voice preflight --provider cloud-stt --json',
              'english-pilot voice stt-contract --json',
              'english-pilot voice stt-wrapper-template --json',
            ],
            readinessChecks: [
              { name: 'CLOUD_STT_PROVIDER', present: true },
              { name: 'CLOUD_STT_API_KEY', present: true },
              { name: 'CLOUD_STT_ENDPOINT', present: false },
            ],
          },
        ],
      });
      expect(json.stdout).not.toContain('cloud-stt-secret-value');
      expect(human.exitCode).toBe(0);
      expect(human.stderr).toBe('');
      expect(human.stdout).toContain('Preflight commands:');
      expect(human.stdout).toContain('- english-pilot voice preflight --provider cloud-stt --json');
      expect(human.stdout).toContain('- english-pilot voice stt-contract --json');
      expect(human.stdout).toContain('Readiness checks:');
      expect(human.stdout).toContain('- CLOUD_STT_PROVIDER: present');
      expect(human.stdout).toContain('- CLOUD_STT_ENDPOINT: missing');
      expect(human.stdout).not.toContain('cloud-stt-secret-value');
    } finally {
      restoreEnv(previous);
    }
  });

  it('records cloud STT provider assessment evidence for provider-specific contracts', () => {
    const assessment = runCli([
      'voice',
      'stt-assess-provider',
      '--provider-name',
      'acme-stt',
      '--response-json',
      '{"payload":{"alternatives":[]}}',
      '--record',
      '--json',
    ]);
    const roadmap = runCli(['roadmap', '--json']);
    const cloudSttItem = JSON.parse(roadmap.stdout).items.find(
      (item: { id: string }) => item.id === 'provider-specific-cloud-stt-contract',
    );

    expect(assessment.exitCode).toBe(0);
    expect(assessment.stderr).toBe('');
    expect(JSON.parse(assessment.stdout)).toMatchObject({
      operation: 'voice-stt-provider-assessment',
      providerName: 'acme-stt',
      genericJsonCompatible: false,
      providerSpecificContractNeeded: true,
      recorded: true,
      record: {
        providerName: 'acme-stt',
        genericJsonCompatible: false,
      },
      validation: {
        valid: false,
        blockers: expect.arrayContaining(['Response must include transcript, text, or segments[].text.']),
      },
    });
    expect(cloudSttItem).toMatchObject({
      id: 'provider-specific-cloud-stt-contract',
      status: 'evidence_ready',
      evidenceFound: expect.arrayContaining(['recorded generic-json incompatibility assessment for acme-stt']),
      nextCommands: expect.arrayContaining([
        'english-pilot voice stt-provider-contract-draft --provider-name acme-stt --json',
      ]),
      providerAssessment: {
        providerName: 'acme-stt',
        genericJsonCompatible: false,
      },
    });
  });

  it('records cloud STT provider assessment evidence from a response JSON file', () => {
    const responsePath = join(home, 'acme-stt-response.json');
    writeFileSync(responsePath, JSON.stringify({ payload: { alternatives: [] } }), 'utf8');

    const assessment = runCli([
      'voice',
      'stt-assess-provider',
      '--provider-name',
      'acme-stt',
      '--response-json-file',
      responsePath,
      '--record',
      '--json',
    ]);

    expect(assessment.exitCode).toBe(0);
    expect(assessment.stderr).toBe('');
    expect(JSON.parse(assessment.stdout)).toMatchObject({
      operation: 'voice-stt-provider-assessment',
      providerName: 'acme-stt',
      genericJsonCompatible: false,
      providerSpecificContractNeeded: true,
      recorded: true,
    });
    expect(JSON.parse(readFileSync(join(home, 'voice-stt-assessments.jsonl'), 'utf8'))).toMatchObject({
      providerName: 'acme-stt',
      genericJsonCompatible: false,
    });
  });

  it('lists recorded cloud STT provider assessment evidence', () => {
    runCli([
      'voice',
      'stt-assess-provider',
      '--provider-name',
      'compatible-stt',
      '--response-json',
      '{"text":"I want to create a new project."}',
      '--record',
      '--json',
    ]);
    runCli([
      'voice',
      'stt-assess-provider',
      '--provider-name',
      'acme-stt',
      '--response-json',
      '{"payload":{"alternatives":[]}}',
      '--record',
      '--json',
    ]);

    const all = runCli(['voice', 'stt-assessment-history', '--json']);
    const filtered = runCli(['voice', 'stt-assessment-history', '--provider-name', 'acme-stt', '--json']);
    const human = runCli(['voice', 'stt-assessment-history', '--provider-name', 'acme-stt']);

    expect(all.exitCode).toBe(0);
    expect(all.stderr).toBe('');
    expect(JSON.parse(all.stdout)).toMatchObject({
      records: [
        { providerName: 'compatible-stt', genericJsonCompatible: true },
        { providerName: 'acme-stt', genericJsonCompatible: false },
      ],
    });
    expect(JSON.parse(filtered.stdout)).toMatchObject({
      records: [
        {
          providerName: 'acme-stt',
          providerSpecificContractNeeded: true,
          validation: {
            blockers: expect.arrayContaining(['Response must include transcript, text, or segments[].text.']),
          },
        },
      ],
    });
    expect(human.stdout).toContain('Voice STT provider assessment history');
    expect(human.stdout).toContain('acme-stt');
    expect(human.stdout).not.toContain('compatible-stt');
  });

  it('drafts a provider-specific STT contract plan from assessment evidence', () => {
    const missing = runCli(['voice', 'stt-provider-contract-draft', '--provider-name', 'acme-stt', '--json']);

    expect(missing.exitCode).toBe(0);
    expect(missing.stderr).toBe('');
    expect(JSON.parse(missing.stdout)).toMatchObject({
      operation: 'voice-stt-provider-contract-draft',
      providerName: 'acme-stt',
      status: 'needs-assessment',
      providerSpecificContractNeeded: null,
      missingEvidence: expect.arrayContaining(['recorded generic-json incompatibility assessment for acme-stt']),
      nextCommands: expect.arrayContaining([
        'english-pilot voice stt-assess-provider --provider-name acme-stt --response-json <json> --record --json',
      ]),
    });

    runCli([
      'voice',
      'stt-assess-provider',
      '--provider-name',
      'acme-stt',
      '--response-json',
      '{"payload":{"alternatives":[]}}',
      '--record',
      '--json',
    ]);

    const ready = runCli(['voice', 'stt-provider-contract-draft', '--provider-name', 'acme-stt', '--json']);
    const human = runCli(['voice', 'stt-provider-contract-draft', '--provider-name', 'acme-stt']);

    expect(ready.exitCode).toBe(0);
    expect(ready.stderr).toBe('');
    expect(JSON.parse(ready.stdout)).toMatchObject({
      providerName: 'acme-stt',
      status: 'ready-to-design',
      providerSpecificContractNeeded: true,
      evidence: {
        providerName: 'acme-stt',
        blockers: expect.arrayContaining(['Response must include transcript, text, or segments[].text.']),
      },
      draft: {
        adapterStrategy: expect.stringContaining('normalize acme-stt responses into generic-json'),
        acceptanceCriteria: expect.arrayContaining([
          'english-pilot voice stt-validate --response-json <normalized-json> --json returns valid: true',
        ]),
      },
      nextCommands: expect.arrayContaining([
        'english-pilot voice stt-wrapper-template --json',
        'english-pilot voice stt-contract --json',
      ]),
    });
    expect(human.stdout).toContain('Provider-specific STT contract draft: acme-stt');
    expect(human.stdout).toContain('Status: ready-to-design');
  });

  it('extracts and records a structured lesson from coach --record', () => {
    const result = runCli([
      'coach',
      '--text',
      '这个 threshold 后续支持调整强度, and the workflow should feel sophisticated.',
      '--record',
      '--json',
    ]);
    const review = runCli(['review', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      lesson: {
        worthRecording: true,
        keyPhrases: expect.arrayContaining([expect.stringContaining('threshold')]),
        ipa: expect.arrayContaining([{ word: 'threshold', ipa: '/ˈθreʃhoʊld/' }]),
      },
      recorded: true,
    });
    expect(JSON.parse(review.stdout)).toMatchObject([
      {
        scene: 'configuration discussion',
        ipa: expect.arrayContaining([{ word: 'sophisticated', ipa: '/səˈfɪstɪkeɪtɪd/' }]),
      },
    ]);
  });

  it('lists practical English method templates for common work scenes', () => {
    const json = runCli(['coach', 'templates', '--json']);
    const human = runCli(['coach', 'templates']);

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout)).toMatchObject({
      templates: expect.arrayContaining([
        expect.objectContaining({
          id: 'ask-for-help',
          scene: 'asking for help',
          pattern: 'Could you help me + verb phrase?',
          example: 'Could you help me debug this hook failure?',
          ipa: expect.arrayContaining([{ word: 'debug', ipa: '/ˌdiːˈbʌɡ/' }]),
        }),
        expect.objectContaining({
          id: 'report-a-blocker',
          scene: 'reporting a blocker',
          pattern: 'I am blocked by + noun phrase.',
        }),
      ]),
    });
    expect(human.stdout).toContain('asking for help');
    expect(human.stdout).toContain('Could you help me debug this hook failure?');
    expect(human.stdout).toContain('debug /ˌdiːˈbʌɡ/');
  });

  it('filters English method templates by scene id', () => {
    const result = runCli(['coach', 'templates', '--scene', 'debugging', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      templates: [
        expect.objectContaining({
          id: 'debugging',
          scene: 'debugging',
          example: 'I reproduced the issue with the Codex hook and found that the command path is missing.',
        }),
      ],
    });
  });

  it('records one method template into the review queue', () => {
    const result = runCli(['coach', 'templates', '--scene', 'debugging', '--record', '--json']);
    const review = runCli(['review', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      templates: [
        expect.objectContaining({
          id: 'debugging',
        }),
      ],
      recorded: true,
      item: {
        original: 'Method template: debugging',
        suggested: 'I reproduced the issue with the Codex hook and found that the command path is missing.',
        scene: 'debugging',
        tags: expect.arrayContaining(['method-template', 'debugging', 'diagnosis']),
        pattern: 'I reproduced + issue, and found that + cause.',
        ipa: expect.arrayContaining([{ word: 'reproduced', ipa: '/ˌriːprəˈduːst/' }]),
      },
    });
    expect(JSON.parse(review.stdout)).toMatchObject([
      {
        original: 'Method template: debugging',
        suggested: 'I reproduced the issue with the Codex hook and found that the command path is missing.',
      },
    ]);
  });

  it('returns daily retrieval prompts for recorded learning items', () => {
    runCli([
      'coach',
      '--text',
      '这个 threshold 后续支持调整强度, and the workflow should feel sophisticated.',
      '--record',
      '--json',
    ]);

    const result = runCli(['daily', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      items: [
        {
          reviewPrompt: expect.stringContaining('How would you say'),
          suggested: expect.stringContaining('threshold'),
        },
      ],
    });
  });

  it('checks a daily review answer against the target expression', () => {
    runCli(['coach', 'templates', '--scene', 'debugging', '--record', '--json']);
    const [item] = JSON.parse(runCli(['review', '--json']).stdout);

    const result = runCli(['daily', 'check', item.id, '--answer', 'I reproduced the issue with Codex hook.', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      item: {
        id: item.id,
        suggested: 'I reproduced the issue with the Codex hook and found that the command path is missing.',
      },
      check: {
        exact: false,
        missingWords: expect.arrayContaining(['and', 'found', 'that', 'command', 'path', 'is', 'missing']),
        extraWords: [],
        feedback: expect.stringContaining('Missing words'),
      },
    });
  });

  it('lists supported integration targets and their implemented capabilities', () => {
    const json = runCli(['integrations', 'targets', '--json']);
    const human = runCli(['integrations', 'targets']);

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout)).toEqual({
      targets: [
        {
          id: 'obsidian',
          label: 'Obsidian Markdown',
          status: 'deferred',
          capabilities: ['review-export', 'daily-review-delivery'],
        },
        {
          id: 'feishu',
          label: 'Feishu/Lark',
          status: 'supported',
          capabilities: ['long-connection', 'qr-onboarding', 'message-coaching', 'reply-coaching', 'review-items'],
        },
        {
          id: 'wechat',
          label: 'WeChat',
          status: 'supported',
          capabilities: [
            'long-connection',
            'qr-onboarding',
            'message-coaching',
            'reply-coaching',
            'review-items',
            'daily-review-delivery',
          ],
        },
        {
          id: 'voice',
          label: 'Voice Practice',
          status: 'deferred',
          capabilities: ['speech-input', 'pronunciation-feedback', 'review-items'],
        },
      ],
    });
    expect(human.stdout).toContain('obsidian - Obsidian Markdown (deferred)');
    expect(human.stdout).toContain('feishu - Feishu/Lark (supported)');
    expect(human.stdout).toContain('wechat - WeChat (supported)');
    expect(human.stdout).toContain('voice - Voice Practice (deferred)');
  });

  it('reports the first-version integration credential policy', () => {
    const json = runCli(['integrations', 'credential-policy', '--target', 'feishu', '--json']);
    const human = runCli(['integrations', 'credential-policy', '--target', 'feishu']);

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout)).toEqual({
      target: {
        id: 'feishu',
        label: 'Feishu/Lark',
        status: 'supported',
        capabilities: ['long-connection', 'qr-onboarding', 'message-coaching', 'reply-coaching', 'review-items'],
      },
      policy: 'environment',
      storage: 'process-env',
      network: false,
      requiredCredentials: ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_ALLOWED_OPEN_IDS'],
      secretHandling:
        'EnglishPilot reads credentials from environment variables and does not persist integration secrets.',
    });
    expect(human.stdout).toContain('Credential policy: environment');
    expect(human.stdout).toContain('FEISHU_APP_ID');
  });

  it('reports the first-version integration delivery mode policy', () => {
    const json = runCli(['integrations', 'delivery-mode', '--target', 'wechat', '--json']);
    const human = runCli(['integrations', 'delivery-mode', '--target', 'wechat']);

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout)).toEqual({
      target: {
        id: 'wechat',
        label: 'WeChat',
        status: 'supported',
        capabilities: [
          'long-connection',
          'qr-onboarding',
          'message-coaching',
          'reply-coaching',
          'review-items',
          'daily-review-delivery',
        ],
      },
      mode: 'long-connection-bot',
      status: 'supported',
      network: false,
      rationale:
        'WeChat uses the dedicated QR-login long-connection channel. Run `english-pilot wechat setup`, then `english-pilot wechat start`.',
    });
    expect(human.stdout).toContain('Delivery mode: long-connection-bot');
    expect(human.stdout).toContain('english-pilot wechat setup');
  });

  it('builds a channel-neutral daily review payload for supported message integrations', () => {
    runCli([
      'coach',
      '--text',
      '这个 threshold 后续支持调整强度, and the workflow should feel sophisticated.',
      '--record',
      '--json',
    ]);
    const [item] = JSON.parse(runCli(['review', '--json']).stdout);

    const result = runCli(['integrations', 'daily-pack', '--target', 'feishu', '--date', item.nextReviewAt, '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      target: {
        id: 'feishu',
        status: 'supported',
      },
      delivery: {
        supported: false,
        mode: 'payload-only',
      },
      pack: {
        date: item.nextReviewAt,
        itemCount: 1,
        title: `EnglishPilot Daily Review - ${item.nextReviewAt}`,
        markdown: expect.stringContaining('Answer:'),
      },
    });
  });

  it('prints a Feishu/Lark daily review delivery dry run without sending', () => {
    runCli([
      'coach',
      '--text',
      '这个 threshold 后续支持调整强度, and the workflow should feel sophisticated.',
      '--record',
      '--json',
    ]);
    const [item] = JSON.parse(runCli(['review', '--json']).stdout);

    const result = runCli(['integrations', 'dry-run', '--target', 'feishu', '--date', item.nextReviewAt, '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      target: {
        id: 'feishu',
        label: 'Feishu/Lark',
        status: 'supported',
      },
      operation: 'daily-review-delivery',
      wouldSend: false,
      requiresCredentials: ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_ALLOWED_OPEN_IDS'],
      payload: {
        delivery: {
          supported: false,
          mode: 'payload-only',
        },
        pack: {
          date: item.nextReviewAt,
          itemCount: 1,
          markdown: expect.stringContaining('EnglishPilot Daily Review'),
        },
      },
    });
  });

  it('builds a channel-neutral message coaching payload for supported message integrations', () => {
    const result = runCli([
      'integrations',
      'message-coaching',
      '--target',
      'feishu',
      '--text',
      '我想创建一个 new project，用来辅助英语学习。',
      '--json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      target: {
        id: 'feishu',
        status: 'supported',
      },
      delivery: {
        supported: true,
        mode: 'channel',
      },
      message: {
        text: '我想创建一个 new project，用来辅助英语学习。',
        analysis: {
          decision: 'BLOCK',
        },
        rewrite: expect.stringContaining('create a new project'),
        shouldRecord: true,
        lesson: {
          suggested: expect.stringContaining('create a new project'),
        },
      },
    });
  });

  it('records a Feishu/Lark message coaching lesson for later review when requested', () => {
    const result = runCli([
      'integrations',
      'message-coaching',
      '--target',
      'feishu',
      '--text',
      '我想创建一个 new project，用来辅助英语学习。',
      '--record',
      '--json',
    ]);
    const review = runCli(['review', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      recorded: true,
      item: {
        original: '我想创建一个 new project，用来辅助英语学习。',
        suggested: expect.stringContaining('create a new project'),
        scene: 'AI workflow discussion',
        tags: expect.arrayContaining(['integration-message', 'feishu']),
      },
    });
    expect(JSON.parse(review.stdout)).toEqual([
      expect.objectContaining({
        original: '我想创建一个 new project，用来辅助英语学习。',
        suggested: expect.stringContaining('create a new project'),
        tags: expect.arrayContaining(['integration-message', 'feishu']),
      }),
    ]);
  });

  it('delivers a daily review pack to Obsidian Markdown files without network access', () => {
    runCli([
      'coach',
      '--text',
      '这个 threshold 后续支持调整强度, and the workflow should feel sophisticated.',
      '--record',
      '--json',
    ]);
    const [item] = JSON.parse(runCli(['review', '--json']).stdout);
    const outputDir = join(home, 'obsidian-delivery');

    const result = runCli([
      'integrations',
      'deliver',
      '--target',
      'obsidian',
      '--date',
      item.nextReviewAt,
      '--dir',
      outputDir,
      '--write',
      '--json',
    ]);
    const json = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(json).toMatchObject({
      target: {
        id: 'obsidian',
        status: 'deferred',
      },
      operation: 'daily-review-delivery',
      delivered: true,
      wouldSend: false,
      network: false,
      path: join(outputDir, `${item.nextReviewAt}.md`),
      payload: {
        pack: {
          itemCount: 1,
          markdown: expect.stringContaining('EnglishPilot Daily Review'),
        },
      },
    });
    expect(existsSync(json.path)).toBe(true);
    expect(readFileSync(json.path, 'utf8')).toContain(
      'Answer: This threshold should support adjustable intensity later',
    );
  });

  it('previews Obsidian daily review delivery without writing files by default', () => {
    runCli([
      'coach',
      '--text',
      '这个 threshold 后续支持调整强度, and the workflow should feel sophisticated.',
      '--record',
      '--json',
    ]);
    const [item] = JSON.parse(runCli(['review', '--json']).stdout);
    const outputDir = join(home, 'obsidian-preview');

    const result = runCli([
      'integrations',
      'deliver',
      '--target',
      'obsidian',
      '--date',
      item.nextReviewAt,
      '--dir',
      outputDir,
      '--json',
    ]);
    const json = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(json).toMatchObject({
      target: {
        id: 'obsidian',
        status: 'deferred',
      },
      operation: 'daily-review-delivery',
      delivered: false,
      wouldSend: false,
      network: false,
      path: join(outputDir, `${item.nextReviewAt}.md`),
      payload: {
        pack: {
          itemCount: 1,
          markdown: expect.stringContaining('EnglishPilot Daily Review'),
        },
      },
    });
    expect(existsSync(json.path)).toBe(false);
  });

  it('reports missing Feishu/Lark integration credentials without sending', () => {
    const previous = {
      FEISHU_APP_ID: process.env.FEISHU_APP_ID,
      FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET,
      FEISHU_ALLOWED_OPEN_IDS: process.env.FEISHU_ALLOWED_OPEN_IDS,
    };
    delete process.env.FEISHU_APP_ID;
    delete process.env.FEISHU_APP_SECRET;
    delete process.env.FEISHU_ALLOWED_OPEN_IDS;

    try {
      const result = runCli(['integrations', 'preflight', '--target', 'feishu', '--json']);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toEqual({
        target: {
          id: 'feishu',
          label: 'Feishu/Lark',
          status: 'supported',
          capabilities: ['long-connection', 'qr-onboarding', 'message-coaching', 'reply-coaching', 'review-items'],
        },
        ready: false,
        network: false,
        requiredCredentials: [
          { name: 'FEISHU_APP_ID', present: false },
          { name: 'FEISHU_APP_SECRET', present: false },
          { name: 'FEISHU_ALLOWED_OPEN_IDS', present: false },
        ],
        missing: ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_ALLOWED_OPEN_IDS'],
      });
    } finally {
      restoreEnv(previous);
    }
  });

  it('records a voice practice lesson for later review', () => {
    const result = runCli([
      'voice',
      'record',
      '--transcript',
      'I want create new project',
      '--target',
      'I want to create a new project.',
      '--feedback',
      'Add "to" before create and pronounce project with first-syllable stress.',
      '--json',
    ]);
    const [item] = JSON.parse(runCli(['review', '--json']).stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      item: {
        original: 'I want create new project',
        suggested: 'I want to create a new project.',
        scene: 'voice practice',
        tags: expect.arrayContaining(['voice-practice']),
        pattern: expect.stringContaining('Add "to" before create'),
        ipa: expect.arrayContaining([
          { word: 'create', ipa: '/kriˈeɪt/' },
          { word: 'project', ipa: '/ˈprɑːdʒekt/' },
        ]),
      },
    });
    expect(item).toMatchObject({
      scene: 'voice practice',
      tags: expect.arrayContaining(['voice-practice']),
      suggested: 'I want to create a new project.',
    });
  });

  it('suggests voice practice feedback when explicit feedback is omitted', () => {
    const result = runCli([
      'voice',
      'record',
      '--transcript',
      'I want create new project',
      '--target',
      'I want to create a new project.',
      '--json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      item: {
        pattern: expect.stringContaining('Missing words: to, a'),
      },
    });
    expect(JSON.parse(result.stdout).item.pattern).toContain('Grammar focus: use "want to + verb"');
    expect(JSON.parse(result.stdout).item.pattern).toContain('Article focus: use "a" before a singular countable noun');
    expect(JSON.parse(result.stdout).item.pattern).toContain(
      'Pronunciation focus: create /kriˈeɪt/, project /ˈprɑːdʒekt/',
    );
  });

  it('lists voice input providers for current and future speech workflows', () => {
    const json = runCli(['voice', 'providers', '--json']);
    const human = runCli(['voice', 'providers']);

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout)).toEqual({
      providers: [
        {
          id: 'manual',
          label: 'Manual Transcript',
          status: 'supported',
          input: 'text',
          capabilities: ['transcript-review', 'pronunciation-feedback'],
        },
        {
          id: 'local-whisper',
          label: 'Local Whisper',
          status: 'supported',
          input: 'audio',
          capabilities: ['speech-to-text', 'pronunciation-feedback'],
        },
        {
          id: 'cloud-stt',
          label: 'Cloud Speech-to-Text',
          status: 'supported',
          input: 'audio',
          capabilities: ['speech-to-text', 'pronunciation-feedback'],
        },
      ],
    });
    expect(human.stdout).toContain('manual - Manual Transcript (supported)');
    expect(human.stdout).toContain('local-whisper - Local Whisper (supported)');
    expect(human.stdout).toContain('cloud-stt - Cloud Speech-to-Text (supported)');
  });

  it('reports the first-version speech-to-text provider policy', () => {
    const json = runCli(['voice', 'stt-policy', '--json']);
    const human = runCli(['voice', 'stt-policy']);

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout)).toEqual({
      defaultProvider: 'local-whisper',
      cloudProviderDecision: 'generic-json',
      network: false,
      supported: [
        {
          provider: 'manual',
          role: 'manual transcript review',
          status: 'supported',
          requiredConfiguration: [],
        },
        {
          provider: 'local-whisper',
          role: 'offline speech-to-text',
          status: 'supported',
          requiredConfiguration: ['WHISPER_COMMAND'],
        },
        {
          provider: 'cloud-stt',
          role: 'generic JSON cloud speech-to-text',
          status: 'supported',
          requiredConfiguration: ['CLOUD_STT_PROVIDER', 'CLOUD_STT_API_KEY', 'CLOUD_STT_ENDPOINT'],
        },
      ],
      planned: [],
    });
    expect(human.stdout).toContain('Default STT provider: local-whisper');
    expect(human.stdout).toContain('Cloud STT decision: generic-json');
  });

  it('reports the generic JSON speech-to-text contract', () => {
    const json = runCli(['voice', 'stt-contract', '--json']);
    const human = runCli(['voice', 'stt-contract']);

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout)).toMatchObject({
      provider: 'generic-json',
      request: {
        method: 'POST',
        headers: expect.arrayContaining(['Authorization: Bearer $CLOUD_STT_API_KEY', 'Content-Type: application/json']),
        body: {
          provider: 'generic-json',
          audioBase64: '<base64 wav/mp3/m4a bytes>',
        },
      },
      acceptedResponseFields: expect.arrayContaining([
        expect.objectContaining({ name: 'text' }),
        expect.objectContaining({ name: 'transcript' }),
        expect.objectContaining({ name: 'words[].word' }),
        expect.objectContaining({ name: 'words[].phonemes[].phoneme' }),
      ]),
      normalizedOutput: expect.arrayContaining([
        'transcript',
        'words[].startSeconds',
        'words[].endSeconds',
        'words[].confidence',
        'words[].phonemes[]',
      ]),
      exampleResponse: {
        transcript: 'I want to create a new project.',
        words: [
          expect.objectContaining({
            word: 'project',
            phonemes: expect.arrayContaining([expect.objectContaining({ phoneme: 'pr' })]),
          }),
        ],
      },
    });
    expect(human.stdout).toContain('Generic JSON STT contract');
    expect(human.stdout).toContain('Authorization: Bearer $CLOUD_STT_API_KEY');
    expect(human.stdout).toContain('words[].phonemes[].phoneme');
  });

  it('reports a local speech-to-text wrapper template', () => {
    const json = runCli(['voice', 'stt-wrapper-template', '--json']);
    const human = runCli(['voice', 'stt-wrapper-template']);

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout)).toMatchObject({
      runtime: 'python',
      fileName: 'english-pilot-stt-wrapper.py',
      contract: 'generic-json',
      environment: {
        upstreamCommand: 'UPSTREAM_STT_COMMAND',
        englishPilotCommand: 'WHISPER_COMMAND',
      },
      usage: expect.arrayContaining([
        'chmod +x english-pilot-stt-wrapper.py',
        'export WHISPER_COMMAND=/absolute/path/to/english-pilot-stt-wrapper.py',
      ]),
      template: expect.stringContaining('#!/usr/bin/env python3'),
    });
    expect(JSON.parse(json.stdout).template).toContain('UPSTREAM_STT_COMMAND');
    expect(JSON.parse(json.stdout).template).toContain('"transcript"');
    expect(JSON.parse(json.stdout).template).toContain('json.dumps');
    expect(human.stdout).toContain('english-pilot-stt-wrapper.py');
    expect(human.stdout).toContain('export WHISPER_COMMAND=/absolute/path/to/english-pilot-stt-wrapper.py');
  });

  it('validates a generic JSON speech-to-text response', () => {
    const json = runCli([
      'voice',
      'stt-validate',
      '--response-json',
      JSON.stringify({
        transcript: 'I want to create a new project.',
        words: [
          {
            word: 'project',
            start: 1.2,
            end: 1.8,
            confidence: 0.86,
            phonemes: [{ phoneme: 'pr', start: 1.2, end: 1.32, confidence: 0.82 }],
          },
        ],
      }),
      '--json',
    ]);
    const human = runCli([
      'voice',
      'stt-validate',
      '--response-json',
      JSON.stringify({ text: 'I want to create a new project.' }),
    ]);

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout)).toMatchObject({
      provider: 'generic-json',
      valid: true,
      parsed: {
        transcript: 'I want to create a new project.',
        wordCount: 1,
        phonemeCount: 1,
        words: [
          {
            word: 'project',
            startSeconds: 1.2,
            endSeconds: 1.8,
            confidence: 0.86,
            phonemes: [{ phoneme: 'pr', confidence: 0.82 }],
          },
        ],
      },
      blockers: [],
    });
    expect(human.stdout).toContain('STT response valid: yes');
    expect(human.stdout).toContain('Transcript: I want to create a new project.');
  });

  it('validates a generic JSON speech-to-text response from a file', () => {
    const responsePath = join(home, 'generic-stt-response.json');
    writeFileSync(responsePath, JSON.stringify({ text: 'I want to create a new project.' }), 'utf8');

    const result = runCli(['voice', 'stt-validate', '--response-json-file', responsePath, '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      provider: 'generic-json',
      valid: true,
      parsed: {
        transcript: 'I want to create a new project.',
      },
    });
  });

  it('reports blockers for an invalid generic JSON speech-to-text response', () => {
    const result = runCli([
      'voice',
      'stt-validate',
      '--response-json',
      JSON.stringify({ words: [{ word: 'project' }] }),
      '--json',
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      valid: false,
      parsed: {
        transcript: '',
        wordCount: 1,
      },
      blockers: ['Response must include transcript, text, or segments[].text.'],
    });
  });

  it('transcribes audio with a configured local Whisper command', () => {
    const previous = {
      WHISPER_COMMAND: process.env.WHISPER_COMMAND,
    };
    const fakeWhisper = join(home, 'fake-whisper');
    const audioPath = join(home, 'sample.wav');
    writeFileSync(fakeWhisper, '#!/bin/sh\nprintf "I want to create a new project from %s\\n" "$1"\n', 'utf8');
    chmodSync(fakeWhisper, 0o755);
    writeFileSync(audioPath, 'fake audio', 'utf8');
    process.env.WHISPER_COMMAND = fakeWhisper;

    try {
      const result = runCli(['voice', 'transcribe', '--provider', 'local-whisper', '--audio', audioPath, '--json']);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toMatchObject({
        provider: {
          id: 'local-whisper',
          status: 'supported',
        },
        audioPath,
        transcript: `I want to create a new project from ${audioPath}`,
        network: false,
      });
    } finally {
      restoreEnv(previous);
    }
  });

  it('parses local Whisper word timing and confidence JSON output', () => {
    const previous = {
      WHISPER_COMMAND: process.env.WHISPER_COMMAND,
    };
    const fakeWhisper = join(home, 'fake-whisper-json');
    const audioPath = join(home, 'sample.wav');
    writeFileSync(
      fakeWhisper,
      [
        '#!/bin/sh',
        'printf \'{"text":"I want create new project","words":[{"word":"I","start":0,"end":0.1,"confidence":0.99},{"word":"create","start":0.4,"end":0.8,"confidence":0.52}]}\\n\'',
        '',
      ].join('\n'),
      'utf8',
    );
    chmodSync(fakeWhisper, 0o755);
    writeFileSync(audioPath, 'fake audio', 'utf8');
    process.env.WHISPER_COMMAND = fakeWhisper;

    try {
      const result = runCli(['voice', 'transcribe', '--provider', 'local-whisper', '--audio', audioPath, '--json']);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toMatchObject({
        transcript: 'I want create new project',
        words: [
          { word: 'I', startSeconds: 0, endSeconds: 0.1, confidence: 0.99 },
          { word: 'create', startSeconds: 0.4, endSeconds: 0.8, confidence: 0.52 },
        ],
      });
    } finally {
      restoreEnv(previous);
    }
  });

  it('transcribes audio with the generic JSON cloud STT provider', async () => {
    const audioPath = join(home, 'sample.wav');
    writeFileSync(audioPath, 'fake audio', 'utf8');
    const calls: Array<{ url: string; init: { method?: string; headers?: Record<string, string>; body?: string } }> =
      [];

    const result = await runCliAsync(
      ['voice', 'transcribe', '--provider', 'cloud-stt', '--audio', audioPath, '--json'],
      '',
      {
        env: {
          ...process.env,
          CLOUD_STT_PROVIDER: 'generic-json',
          CLOUD_STT_API_KEY: 'cloud-key',
          CLOUD_STT_ENDPOINT: 'https://stt.example.test/transcribe',
        },
        fetch: async (url, init) => {
          calls.push({ url, init: init as { method?: string; headers?: Record<string, string>; body?: string } });
          return jsonResponse({
            transcript: 'I want create new project',
            words: [{ word: 'create', confidence: 0.52 }],
          });
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      provider: {
        id: 'cloud-stt',
        status: 'supported',
      },
      audioPath,
      transcript: 'I want create new project',
      network: true,
      cloud: {
        provider: 'generic-json',
        endpoint: 'https://stt.example.test/transcribe',
        storedSecrets: false,
      },
      words: [{ word: 'create', confidence: 0.52 }],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://stt.example.test/transcribe');
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer cloud-key' });
    expect(JSON.parse(calls[0].init.body ?? '{}')).toMatchObject({
      provider: 'generic-json',
      audioBase64: Buffer.from('fake audio').toString('base64'),
    });
    expect(result.stdout).not.toContain('cloud-key');
  });

  it('records voice practice from generic JSON cloud STT transcription', async () => {
    const audioPath = join(home, 'sample.wav');
    writeFileSync(audioPath, 'fake audio', 'utf8');

    const result = await runCliAsync(
      [
        'voice',
        'practice',
        '--provider',
        'cloud-stt',
        '--audio',
        audioPath,
        '--target',
        'I want to create a new project.',
        '--json',
      ],
      '',
      {
        env: {
          ...process.env,
          CLOUD_STT_PROVIDER: 'generic-json',
          CLOUD_STT_API_KEY: 'cloud-key',
          CLOUD_STT_ENDPOINT: 'https://stt.example.test/transcribe',
        },
        fetch: async () =>
          jsonResponse({
            text: 'I want create new project',
            words: [{ word: 'create', confidence: 0.52 }],
          }),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      transcription: {
        provider: {
          id: 'cloud-stt',
        },
        network: true,
        transcript: 'I want create new project',
      },
      item: {
        scene: 'voice practice',
        pattern: expect.stringContaining('Pronunciation scoring: average confidence 52%'),
      },
    });
  });

  it('records a voice practice lesson directly from local Whisper audio transcription', () => {
    const previous = {
      WHISPER_COMMAND: process.env.WHISPER_COMMAND,
    };
    const fakeWhisper = join(home, 'fake-whisper');
    const audioPath = join(home, 'sample.wav');
    writeFileSync(fakeWhisper, '#!/bin/sh\nprintf "I want create new project\\n"\n', 'utf8');
    chmodSync(fakeWhisper, 0o755);
    writeFileSync(audioPath, 'fake audio', 'utf8');
    process.env.WHISPER_COMMAND = fakeWhisper;

    try {
      const result = runCli([
        'voice',
        'practice',
        '--provider',
        'local-whisper',
        '--audio',
        audioPath,
        '--target',
        'I want to create a new project.',
        '--feedback',
        'Add "to" before create.',
        '--json',
      ]);
      const [item] = JSON.parse(runCli(['review', '--json']).stdout);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toMatchObject({
        transcription: {
          provider: {
            id: 'local-whisper',
          },
          audioPath,
          transcript: 'I want create new project',
          network: false,
        },
        item: {
          original: 'I want create new project',
          suggested: 'I want to create a new project.',
          scene: 'voice practice',
          tags: expect.arrayContaining(['voice-practice']),
          pattern: expect.stringContaining('Add "to" before create'),
        },
      });
      expect(item).toMatchObject({
        original: 'I want create new project',
        suggested: 'I want to create a new project.',
        scene: 'voice practice',
      });
    } finally {
      restoreEnv(previous);
    }
  });

  it('suggests feedback for voice practice from audio when explicit feedback is omitted', () => {
    const previous = {
      WHISPER_COMMAND: process.env.WHISPER_COMMAND,
    };
    const fakeWhisper = join(home, 'fake-whisper');
    const audioPath = join(home, 'sample.wav');
    writeFileSync(fakeWhisper, '#!/bin/sh\nprintf "I want create new project\\n"\n', 'utf8');
    chmodSync(fakeWhisper, 0o755);
    writeFileSync(audioPath, 'fake audio', 'utf8');
    process.env.WHISPER_COMMAND = fakeWhisper;

    try {
      const result = runCli([
        'voice',
        'practice',
        '--provider',
        'local-whisper',
        '--audio',
        audioPath,
        '--target',
        'I want to create a new project.',
        '--json',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toMatchObject({
        item: {
          pattern: expect.stringContaining('Missing words: to, a'),
        },
      });
      expect(JSON.parse(result.stdout).item.pattern).toContain('Grammar focus: use "want to + verb"');
      expect(JSON.parse(result.stdout).item.pattern).toContain(
        'Article focus: use "a" before a singular countable noun',
      );
      expect(JSON.parse(result.stdout).item.pattern).toContain(
        'Pronunciation focus: create /kriˈeɪt/, project /ˈprɑːdʒekt/',
      );
    } finally {
      restoreEnv(previous);
    }
  });

  it('adds word-level pronunciation scoring when local Whisper returns confidence', () => {
    const previous = {
      WHISPER_COMMAND: process.env.WHISPER_COMMAND,
    };
    const fakeWhisper = join(home, 'fake-whisper-score');
    const audioPath = join(home, 'sample.wav');
    writeFileSync(
      fakeWhisper,
      [
        '#!/bin/sh',
        'printf \'{"text":"I want create new project","words":[{"word":"I","confidence":0.98},{"word":"want","confidence":0.9},{"word":"create","confidence":0.52},{"word":"new","confidence":0.88},{"word":"project","confidence":0.7}]}\\n\'',
        '',
      ].join('\n'),
      'utf8',
    );
    chmodSync(fakeWhisper, 0o755);
    writeFileSync(audioPath, 'fake audio', 'utf8');
    process.env.WHISPER_COMMAND = fakeWhisper;

    try {
      const result = runCli([
        'voice',
        'practice',
        '--provider',
        'local-whisper',
        '--audio',
        audioPath,
        '--target',
        'I want to create a new project.',
        '--json',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toMatchObject({
        transcription: {
          words: expect.arrayContaining([{ word: 'create', confidence: 0.52 }]),
        },
        item: {
          pattern: expect.stringContaining('Pronunciation scoring: average confidence 80%'),
        },
      });
      expect(JSON.parse(result.stdout).item.pattern).toContain('Low-confidence words: create, project');
    } finally {
      restoreEnv(previous);
    }
  });

  it('adds phoneme-level pronunciation scoring when local Whisper returns phoneme JSON', () => {
    const previous = {
      WHISPER_COMMAND: process.env.WHISPER_COMMAND,
    };
    const fakeWhisper = join(home, 'fake-whisper-phonemes');
    const audioPath = join(home, 'sample.wav');
    writeFileSync(
      fakeWhisper,
      [
        '#!/bin/sh',
        'printf \'{"text":"I want create new project","words":[{"word":"create","confidence":0.82,"phonemes":[{"phoneme":"k","start":0.4,"end":0.45,"confidence":0.93},{"phoneme":"r","start":0.45,"end":0.5,"confidence":0.42}]},{"word":"project","confidence":0.76,"phonemes":[{"phoneme":"p","confidence":0.88},{"phoneme":"dʒ","confidence":0.64}]}]}\\n\'',
        '',
      ].join('\n'),
      'utf8',
    );
    chmodSync(fakeWhisper, 0o755);
    writeFileSync(audioPath, 'fake audio', 'utf8');
    process.env.WHISPER_COMMAND = fakeWhisper;

    try {
      const result = runCli([
        'voice',
        'practice',
        '--provider',
        'local-whisper',
        '--audio',
        audioPath,
        '--target',
        'I want to create a new project.',
        '--json',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      const json = JSON.parse(result.stdout);
      const create = json.transcription.words.find((word: { word: string }) => word.word === 'create');
      expect(create).toMatchObject({
        phonemes: [
          { phoneme: 'k', startSeconds: 0.4, endSeconds: 0.45, confidence: 0.93 },
          { phoneme: 'r', startSeconds: 0.45, endSeconds: 0.5, confidence: 0.42 },
        ],
      });
      expect(json.item.pattern).toContain('Phoneme scoring: average confidence 72%');
      expect(json.item.pattern).toContain('Low-confidence phonemes: create/r, project/dʒ');
      expect(json.item.pattern).toContain('Phoneme timing is available for precise articulation review.');
    } finally {
      restoreEnv(previous);
    }
  });

  it('reports manual voice provider preflight as ready without network checks', () => {
    const result = runCli(['voice', 'preflight', '--provider', 'manual', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      provider: {
        id: 'manual',
        label: 'Manual Transcript',
        status: 'supported',
        input: 'text',
        capabilities: ['transcript-review', 'pronunciation-feedback'],
      },
      ready: true,
      network: false,
      requiredConfiguration: [],
      missing: [],
    });
  });

  it('reports a missing local Whisper command as not ready', () => {
    const previous = {
      WHISPER_COMMAND: process.env.WHISPER_COMMAND,
    };
    const missingWhisper = join(home, 'missing-whisper');
    process.env.WHISPER_COMMAND = missingWhisper;

    try {
      const result = runCli(['voice', 'preflight', '--provider', 'local-whisper', '--json']);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toMatchObject({
        provider: {
          id: 'local-whisper',
        },
        ready: false,
        network: false,
        missing: [],
        errors: [expect.stringContaining('does not exist')],
      });
    } finally {
      restoreEnv(previous);
    }
  });

  it('prints a Claude installer dry run without writing files', () => {
    const result = runCli(['install', 'claude', '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Dry run: would install Claude hook');
    expect(result.stdout).toContain('hook claude --stdin');
  });

  it('uses an absolute node command for Claude hooks when installed from a local built script', () => {
    const previousArgv = [...process.argv];
    const scriptPath = join(home, 'dist with spaces', 'english-pilot.js');
    mkdirSync(join(home, 'dist with spaces'), { recursive: true });
    writeFileSync(scriptPath, '', 'utf8');
    process.argv[1] = scriptPath;

    try {
      const result = runCli(['install', 'claude', '--dry-run']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`"${process.execPath}" --no-warnings "${scriptPath}" hook claude --stdin`);
      expect(result.stdout).toContain(`"command": "${process.execPath}"`);
    } finally {
      process.argv = previousArgv;
    }
  });

  it('prints a Codex installer dry run without writing files', () => {
    const result = runCli(['install', 'codex', '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Dry run: would install Codex hook');
    expect(result.stdout).toContain('UserPromptSubmit');
    expect(result.stdout).toContain('english-pilot hook codex --stdin');
  });

  it('uses an absolute node command for Codex hooks when installed from a local built script', () => {
    const previousArgv = [...process.argv];
    const scriptPath = join(home, 'dist with spaces', 'english-pilot.js');
    mkdirSync(join(home, 'dist with spaces'), { recursive: true });
    writeFileSync(scriptPath, '', 'utf8');
    process.argv[1] = scriptPath;

    try {
      const result = runCli(['install', 'codex', '--dry-run']);
      const jsonStart = result.stdout.indexOf('{');
      const jsonEnd = result.stdout.indexOf('\n\n# BEGIN EnglishPilot MCP');
      const dryRunConfig = JSON.parse(result.stdout.slice(jsonStart, jsonEnd));
      const command = dryRunConfig.hooks.UserPromptSubmit[0].hooks[0].command;

      expect(result.exitCode).toBe(0);
      expect(command).toBe(`"${process.execPath}" --no-warnings "${scriptPath}" hook codex --stdin`);
    } finally {
      process.argv = previousArgv;
    }
  });
});

function restoreEnv(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}
