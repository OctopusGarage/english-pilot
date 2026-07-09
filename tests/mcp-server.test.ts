import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/adapters/cli.js';
import { handleMcpToolCall, handleMcpToolCallAsync, listMcpTools } from '../src/adapters/mcp-server.js';

describe('MCP tools', () => {
  let previousHome: string | undefined;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-mcp-'));
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

  it('lists the first-version MCP tool names', () => {
    expect(listMcpTools()).toEqual([
      'english_analyze_text',
      'english_status',
      'english_roadmap',
      'english_roadmap_next',
      'english_roadmap_env_template',
      'english_external_validation_bundle',
      'english_external_validation_bundle_verify',
      'english_config_profiles',
      'english_config_use',
      'english_config_profile_status',
      'english_config_progression_suggestion',
      'english_config_progression_apply',
      'english_rewrite_text',
      'english_pronounce_text',
      'english_method_templates',
      'english_extract_lesson',
      'english_record_learning_item',
      'english_record_method_template',
      'english_review_queue',
      'english_review_due',
      'english_review_upcoming',
      'english_daily_review',
      'english_daily_check',
      'english_daily_pack',
      'english_mark_review',
      'english_update_review_item',
      'english_remove_review_item',
      'english_review_cleanup',
      'english_integration_targets',
      'english_integration_credential_policy',
      'english_integration_delivery_mode',
      'english_integration_daily_pack',
      'english_integration_dry_run',
      'english_integration_preflight',
      'english_integration_send_readiness',
      'english_integration_send',
      'english_integration_account_guide',
      'english_integration_account_validate',
      'english_integration_validation_history',
      'english_integration_message_coaching',
      'english_integration_event_coaching',
      'english_integration_deliver',
      'english_record_voice_practice',
      'english_doctor',
      'english_voice_providers',
      'english_voice_stt_policy',
      'english_voice_stt_contract',
      'english_voice_stt_validate',
      'english_voice_stt_assess_provider',
      'english_voice_stt_assessment_history',
      'english_voice_stt_provider_contract_draft',
      'english_voice_stt_wrapper_template',
      'english_voice_preflight',
      'english_voice_transcribe',
      'english_voice_practice_from_audio',
      'english_coaching_context',
    ]);
  });

  it('analyzes text', () => {
    const result = handleMcpToolCall('english_analyze_text', {
      text: '我想创建一个 new project，用来辅助英语学习。',
    });

    expect(result).toMatchObject({
      decision: 'BLOCK',
    });
  });

  it('returns project capability status through MCP', () => {
    const result = handleMcpToolCall('english_status', {});

    expect(result).toMatchObject({
      name: 'EnglishPilot',
      supported: {
        cli: expect.arrayContaining(['handoff external-validation', 'handoff external-validation --verify']),
        mcp: expect.arrayContaining([
          'english_status',
          'english_roadmap',
          'english_external_validation_bundle_verify',
          'english_config_profiles',
          'english_config_use',
          'english_config_profile_status',
          'english_config_progression_suggestion',
          'english_config_progression_apply',
          'english_voice_practice_from_audio',
          'english_integration_deliver',
        ]),
        integrations: expect.arrayContaining(['Environment-variable credential policy']),
      },
      deferred: expect.arrayContaining([
        expect.stringContaining('Obsidian/Markdown review export'),
        expect.stringContaining('General Voice/STT practice'),
      ]),
      planned: expect.arrayContaining(['Provider-specific cloud STT contract if generic-json is insufficient']),
      openDecisions: [],
    });
    expect(result.openDecisions as string[]).not.toContain('WeChat delivery mode');
    expect(result.openDecisions as string[]).not.toContain('WeChat delivery mode');
    expect(result.openDecisions as string[]).not.toContain('credential storage policy');
    expect(result.openDecisions as string[]).not.toContain('cloud speech-to-text provider');
  });

  it('returns the next roadmap action through MCP', () => {
    const previous = {
      CLOUD_STT_PROVIDER: process.env.CLOUD_STT_PROVIDER,
      CLOUD_STT_API_KEY: process.env.CLOUD_STT_API_KEY,
      CLOUD_STT_ENDPOINT: process.env.CLOUD_STT_ENDPOINT,
    };
    process.env.CLOUD_STT_PROVIDER = 'generic-json';
    process.env.CLOUD_STT_API_KEY = 'mcp-cloud-stt-secret-value';
    delete process.env.CLOUD_STT_ENDPOINT;

    try {
      const result = handleMcpToolCall('english_roadmap_next', { target: 'cloud-stt' });

      expect(result).toMatchObject({
        items: [
          {
            id: 'provider-specific-cloud-stt-contract',
            relatedTarget: 'cloud-stt',
            status: 'conditional',
            nextEvidence: 'provider sample response fails generic-json validation',
            nextCommand:
              'english-pilot voice stt-assess-provider --provider-name <name> --response-json-file <sample.json> --record --json',
            reason: 'Records a concrete provider sample that cannot satisfy the generic-json STT response contract.',
            prerequisites: [
              'Choose a concrete provider name for --provider-name <name>.',
              'Save the provider sample response JSON to <sample.json>.',
              'Run voice stt-validate --response-json-file <sample.json> before recording evidence.',
            ],
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
      expect(JSON.stringify(result)).not.toContain('mcp-cloud-stt-secret-value');
    } finally {
      restoreEnv(previous);
    }
  });

  it('returns a roadmap env template through MCP', () => {
    const result = handleMcpToolCall('english_roadmap_env_template', { target: 'wechat' });

    expect(result).toMatchObject({
      target: 'wechat',
      entries: [],
      shellExports: [],
    });
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });

  it('writes remaining roadmap items as a Markdown handoff through MCP when requested', () => {
    const directory = join(home, 'mcp-roadmap-export');
    const result = handleMcpToolCall('english_roadmap', {
      target: 'cloud-stt',
      write: true,
      directory,
    });
    const outputPath = join(directory, 'cloud-stt-roadmap.md');

    expect(result).toMatchObject({
      items: [
        {
          id: 'provider-specific-cloud-stt-contract',
          relatedTarget: 'cloud-stt',
        },
      ],
      export: {
        written: true,
        path: outputPath,
      },
    });
    const markdown = readFileSync(outputPath, 'utf8');
    expect(markdown).toContain('# EnglishPilot Roadmap Handoff');
    expect(markdown).toContain('## provider-specific-cloud-stt-contract');
    expect(markdown).toContain('concrete cloud STT provider sample response that cannot satisfy generic-json');
    expect(markdown).toContain('english-pilot voice stt-assessment-history --provider-name <name> --json');
  });

  it('writes a target-specific external validation handoff bundle through MCP', () => {
    const directory = join(home, 'mcp-cloud-stt-validation-bundle');
    const result = handleMcpToolCall('english_external_validation_bundle', {
      target: 'cloud-stt',
      write: true,
      directory,
    });

    expect(result).toMatchObject({
      operation: 'external-validation-handoff-bundle',
      target: 'cloud-stt',
      written: true,
      files: expect.arrayContaining([
        { kind: 'evidence-checklist', path: join(directory, 'evidence', 'evidence-checklist.md') },
        { kind: 'evidence-checklist-json', path: join(directory, 'evidence', 'evidence-checklist.json') },
        { kind: 'next-commands', path: join(directory, 'commands', 'next-commands.md') },
        { kind: 'next-commands-json', path: join(directory, 'commands', 'next-commands.json') },
        { kind: 'roadmap', path: join(directory, 'roadmap', 'cloud-stt-roadmap.md') },
        { kind: 'roadmap-json', path: join(directory, 'roadmap', 'cloud-stt-roadmap.json') },
        { kind: 'doctor', path: join(directory, 'diagnostics', 'english-pilot-doctor.md') },
        { kind: 'doctor-json', path: join(directory, 'diagnostics', 'english-pilot-doctor.json') },
        { kind: 'voice-stt-contract', path: join(directory, 'voice-stt', 'generic-json-contract.md') },
        { kind: 'voice-stt-contract-json', path: join(directory, 'voice-stt', 'generic-json-contract.json') },
        { kind: 'voice-stt-wrapper', path: join(directory, 'voice-stt', 'wrapper-template.md') },
        { kind: 'voice-stt-wrapper-json', path: join(directory, 'voice-stt', 'wrapper-template.json') },
        { kind: 'voice-stt-wrapper-template', path: join(directory, 'voice-stt', 'english-pilot-stt-wrapper.py') },
        { kind: 'voice-stt-assessment-history', path: join(directory, 'voice-stt', 'assessment-history.md') },
        { kind: 'voice-stt-assessment-history-json', path: join(directory, 'voice-stt', 'assessment-history.json') },
      ]),
    });
    expect(
      (result.files as Array<{ kind: string; path: string }>).some((file) => file.kind === 'integration-evidence'),
    ).toBe(false);
    expect(
      (result.files as Array<{ kind: string; path: string }>).some((file) => file.kind === 'integration-evidence-json'),
    ).toBe(false);
    expect(readFileSync(join(directory, 'README.md'), 'utf8')).toContain('Target: cloud-stt');
    expect(JSON.parse(readFileSync(join(directory, 'evidence', 'evidence-checklist.json'), 'utf8'))).toMatchObject({
      target: 'cloud-stt',
      items: [expect.objectContaining({ relatedTarget: 'cloud-stt' })],
    });
    expect(JSON.parse(readFileSync(join(directory, 'commands', 'next-commands.json'), 'utf8'))).toMatchObject({
      target: 'cloud-stt',
      commands: expect.arrayContaining([
        expect.objectContaining({
          relatedTarget: 'cloud-stt',
          command: 'english-pilot voice stt-contract --json',
        }),
      ]),
    });
    expect(readFileSync(join(directory, 'roadmap', 'cloud-stt-roadmap.md'), 'utf8')).toContain(
      'provider-specific-cloud-stt-contract',
    );
    expect(JSON.parse(readFileSync(join(directory, 'roadmap', 'cloud-stt-roadmap.json'), 'utf8'))).toMatchObject({
      items: [expect.objectContaining({ relatedTarget: 'cloud-stt' })],
    });
    expect(JSON.parse(readFileSync(join(directory, 'voice-stt', 'generic-json-contract.json'), 'utf8'))).toMatchObject({
      provider: 'generic-json',
    });
    expect(readFileSync(join(directory, 'voice-stt', 'generic-json-contract.md'), 'utf8')).toContain(
      'Generic JSON STT contract',
    );
    expect(JSON.parse(readFileSync(join(directory, 'voice-stt', 'wrapper-template.json'), 'utf8'))).toMatchObject({
      fileName: 'english-pilot-stt-wrapper.py',
      contract: 'generic-json',
    });
    expect(readFileSync(join(directory, 'voice-stt', 'wrapper-template.md'), 'utf8')).toContain(
      'STT wrapper template: english-pilot-stt-wrapper.py',
    );
    expect(readFileSync(join(directory, 'voice-stt', 'english-pilot-stt-wrapper.py'), 'utf8')).toContain(
      'UPSTREAM_STT_COMMAND',
    );
    expect(JSON.parse(readFileSync(join(directory, 'voice-stt', 'assessment-history.json'), 'utf8'))).toMatchObject({
      records: expect.any(Array),
    });
    expect(readFileSync(join(directory, 'voice-stt', 'assessment-history.md'), 'utf8')).toContain(
      'Voice STT provider assessment history',
    );
  });

  it('includes a provider-specific STT contract draft in cloud-STT bundles through MCP after incompatible assessment evidence exists', () => {
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
    const directory = join(home, 'mcp-cloud-stt-provider-draft-bundle');

    const result = handleMcpToolCall('english_external_validation_bundle', {
      target: 'cloud-stt',
      write: true,
      directory,
    });

    expect(result).toMatchObject({
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
    expect(
      handleMcpToolCall('english_external_validation_bundle_verify', {
        target: 'cloud-stt',
        directory,
      }),
    ).toMatchObject({
      ok: true,
      problems: [],
    });
  });

  it('verifies a cloud-STT provider draft handoff bundle through MCP without local assessment history outside the bundle', () => {
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
    const directory = join(home, 'mcp-portable-cloud-stt-provider-draft-bundle');
    handleMcpToolCall('english_external_validation_bundle', {
      target: 'cloud-stt',
      write: true,
      directory,
    });
    const verifyHome = mkdtempSync(join(tmpdir(), 'english-pilot-mcp-verify-'));
    try {
      process.env.ENGLISH_PILOT_HOME = verifyHome;
      expect(
        handleMcpToolCall('english_external_validation_bundle_verify', {
          target: 'cloud-stt',
          directory,
        }),
      ).toMatchObject({
        operation: 'external-validation-handoff-bundle-verify',
        ok: true,
        target: 'cloud-stt',
        directory,
        problems: [],
      });
    } finally {
      process.env.ENGLISH_PILOT_HOME = home;
      rmSync(verifyHome, { recursive: true, force: true });
    }
  });

  it('verifies a focused cloud-STT provider draft handoff bundle through MCP using the manifest target when target is omitted', () => {
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
    const directory = join(home, 'mcp-manifest-target-cloud-stt-provider-draft-bundle');
    handleMcpToolCall('english_external_validation_bundle', {
      target: 'cloud-stt',
      write: true,
      directory,
    });

    expect(
      handleMcpToolCall('english_external_validation_bundle_verify', {
        directory,
      }),
    ).toMatchObject({
      operation: 'external-validation-handoff-bundle-verify',
      ok: true,
      target: 'cloud-stt',
      directory,
      problems: [],
    });
  });

  it('verifies an external validation handoff bundle through MCP', () => {
    const directory = join(home, 'mcp-verify-validation-bundle');
    handleMcpToolCall('english_external_validation_bundle', {
      target: 'wechat',
      write: true,
      directory,
    });

    const result = handleMcpToolCall('english_external_validation_bundle_verify', {
      target: 'wechat',
      directory,
    });

    expect(result).toMatchObject({
      operation: 'external-validation-handoff-bundle-verify',
      ok: true,
      target: 'wechat',
      directory,
      missingFiles: [],
      problems: [],
    });
  });

  it('filters roadmap items by target through MCP', () => {
    const result = handleMcpToolCall('english_roadmap', {
      target: 'wechat',
    });

    expect(result).toMatchObject({
      items: [
        {
          id: 'wechat-long-connection-hardening',
          relatedTarget: 'wechat',
        },
      ],
    });
    expect(result.items).toHaveLength(1);
  });

  it('rewrites text', () => {
    const result = handleMcpToolCall('english_rewrite_text', {
      text: '我想创建一个 new project，用来辅助英语学习。',
    });

    expect(result).toMatchObject({
      rewrite: expect.stringContaining('create a new project'),
    });
  });

  it('returns learning intensity config profiles through MCP', () => {
    const result = handleMcpToolCall('english_config_profiles', {});

    expect(result).toMatchObject({
      profiles: [
        {
          id: 'beginner',
          maxChineseRatio: 0.5,
          coachingIntensity: 'low',
        },
        {
          id: 'balanced',
          maxChineseRatio: 0.3,
          coachingIntensity: 'medium',
        },
        {
          id: 'strict',
          maxChineseRatio: 0.1,
          coachingIntensity: 'high',
        },
        {
          id: 'force',
          maxChineseRatio: 0.1,
          coachingIntensity: 'force',
        },
      ],
    });
  });

  it('applies a learning intensity config profile through MCP without replacing unrelated settings', () => {
    runCli(['config', 'set', 'rewriteBackend', 'argos']);
    runCli(['config', 'set', 'argosPython', '/tmp/local-argos-python']);

    const result = handleMcpToolCall('english_config_use', {
      profile: 'beginner',
    });

    expect(result).toMatchObject({
      profile: {
        id: 'beginner',
        maxChineseRatio: 0.5,
        targetChineseRatio: 0.2,
        coachingIntensity: 'low',
      },
      config: {
        maxChineseRatio: 0.5,
        targetChineseRatio: 0.2,
        coachingIntensity: 'low',
        rewriteBackend: 'argos',
        argosPython: '/tmp/local-argos-python',
      },
    });
    expect(JSON.parse(runCli(['config', 'get']).stdout)).toMatchObject({
      maxChineseRatio: 0.5,
      targetChineseRatio: 0.2,
      coachingIntensity: 'low',
      rewriteBackend: 'argos',
      argosPython: '/tmp/local-argos-python',
    });
  });

  it('returns the active learning intensity config profile status through MCP', () => {
    handleMcpToolCall('english_config_use', {
      profile: 'balanced',
    });

    const matched = handleMcpToolCall('english_config_profile_status', {});
    runCli(['config', 'set', 'coachingCooldownMinutes', '5']);
    const customized = handleMcpToolCall('english_config_profile_status', {});

    expect(matched).toMatchObject({
      activeProfile: {
        id: 'balanced',
      },
      nearestProfile: {
        id: 'balanced',
      },
      differences: [],
    });
    expect(customized).toMatchObject({
      activeProfile: null,
      nearestProfile: {
        id: 'balanced',
      },
      differences: [
        {
          key: 'coachingCooldownMinutes',
          actual: 5,
          expected: 10,
        },
      ],
    });
  });

  it('returns ratio progression suggestions through MCP', () => {
    for (let index = 0; index < 5; index += 1) {
      runCli(['check', '--text', `I want to practice English in this workflow ${index}.`, '--json']);
    }

    const result = handleMcpToolCall('english_config_progression_suggestion', {});

    expect(result).toMatchObject({
      mode: 'manual',
      eventCount: 5,
      blockedPrompts: 0,
      recommendation: {
        action: 'tighten',
        profile: {
          id: 'strict',
        },
        command: 'english-pilot config use strict',
      },
    });
  });

  it('applies scheduled ratio progression suggestions through MCP', () => {
    runCli(['config', 'set', 'ratioProgression', 'scheduled']);
    for (let index = 0; index < 5; index += 1) {
      runCli(['check', '--text', `I want to practice English in this workflow ${index}.`, '--json']);
    }

    const preview = handleMcpToolCall('english_config_progression_apply', {});
    const applied = handleMcpToolCall('english_config_progression_apply', { apply: true });

    expect(preview).toMatchObject({
      dryRun: true,
      applied: false,
      targetProfile: {
        id: 'strict',
      },
    });
    expect(applied).toMatchObject({
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
  });

  it('extracts structured lesson fields', () => {
    const result = handleMcpToolCall('english_extract_lesson', {
      text: '这个 threshold 后续支持调整强度, and the workflow should feel sophisticated.',
    });

    expect(result).toMatchObject({
      worthRecording: true,
      keyPhrases: expect.arrayContaining([expect.stringContaining('threshold')]),
      ipa: expect.arrayContaining([{ word: 'threshold', ipa: '/ˈθreʃhoʊld/' }]),
    });
  });

  it('returns practical English method templates through MCP', () => {
    const result = handleMcpToolCall('english_method_templates', {});

    expect(result).toMatchObject({
      templates: expect.arrayContaining([
        expect.objectContaining({
          id: 'ask-for-help',
          scene: 'asking for help',
          pattern: 'Could you help me + verb phrase?',
          example: 'Could you help me debug this hook failure?',
        }),
      ]),
    });
  });

  it('filters method templates by scene id through MCP', () => {
    const result = handleMcpToolCall('english_method_templates', {
      scene: 'debugging',
    });

    expect(result).toEqual({
      templates: [
        expect.objectContaining({
          id: 'debugging',
          scene: 'debugging',
        }),
      ],
    });
  });

  it('records a method template into the review queue through MCP', () => {
    const result = handleMcpToolCall('english_record_method_template', {
      id: 'debugging',
    });
    const queue = handleMcpToolCall('english_review_queue', {});

    expect(result).toMatchObject({
      item: {
        original: 'Method template: debugging',
        suggested: 'I reproduced the issue with the Codex hook and found that the command path is missing.',
        scene: 'debugging',
        tags: expect.arrayContaining(['method-template', 'debugging']),
        pattern: 'I reproduced + issue, and found that + cause.',
      },
    });
    expect(queue).toMatchObject({
      items: [
        {
          original: 'Method template: debugging',
          suggested: 'I reproduced the issue with the Codex hook and found that the command path is missing.',
        },
      ],
    });
  });

  it('records and reviews learning items', () => {
    handleMcpToolCall('english_record_learning_item', {
      original: '这个看看怎么设计优化',
      suggested: 'Let us think through how to design and refine this.',
    });

    const queue = handleMcpToolCall('english_review_queue', {});

    expect(queue).toMatchObject({
      items: [
        {
          original: '这个看看怎么设计优化',
          suggested: 'Let us think through how to design and refine this.',
        },
      ],
    });
  });

  it('removes and cleans up review items through MCP', () => {
    const noisy = handleMcpToolCall('english_record_learning_item', {
      original: [
        'You are a spec compliance reviewer for Task 5 only. Do not edit files.',
        'Review /Users/kingsonwu/project and keep the sentence “从 L3 到 L4 的跨越”.',
        'Spec to check:',
        '- Run npm run check.',
        '- Report APPROVED or CHANGES_REQUESTED.',
      ].join('\n'),
      suggested: 'Please rewrite this mainly in English while preserving the original intent.',
    }) as { item: { id: string } };
    const useful = handleMcpToolCall('english_record_learning_item', {
      original: '我想创建一个 new project，用来辅助英语学习。',
      suggested: 'I want to create a new project to help me learn and use English during my normal AI conversations.',
    }) as { item: { id: string } };

    const preview = handleMcpToolCall('english_review_cleanup', {});
    const deleted = handleMcpToolCall('english_review_cleanup', { confirm: true });
    const removedUseful = handleMcpToolCall('english_remove_review_item', { id: useful.item.id });
    const queue = handleMcpToolCall('english_review_queue', {}) as { items: Array<{ id: string }> };

    expect(preview).toMatchObject({
      mode: 'preview',
      candidateCount: 1,
      candidates: [
        {
          id: noisy.item.id,
          reasons: expect.arrayContaining(['generic rewrite fallback', 'multi-section prompt']),
        },
      ],
    });
    expect(deleted).toMatchObject({
      mode: 'delete',
      removedCount: 1,
      removed: [noisy.item.id],
    });
    expect(removedUseful).toMatchObject({
      removed: true,
      item: {
        id: useful.item.id,
      },
    });
    expect(queue.items).toEqual([]);
  });

  it('updates review items through MCP', () => {
    const recorded = handleMcpToolCall('english_record_learning_item', {
      original: '参考~/programming/OctopusGarage/telegram-bridge 一样对齐处理',
      suggested: '~/programming/ActopusGarage/telegram-bridge.',
    }) as { item: { id: string } };

    const updated = handleMcpToolCall('english_update_review_item', {
      id: recorded.item.id,
      suggested: 'Align this implementation with ~/programming/OctopusGarage/telegram-bridge.',
      scene: 'implementation guidance',
      tags: ['implementation'],
    });

    expect(updated).toMatchObject({
      item: {
        id: recorded.item.id,
        original: '参考~/programming/OctopusGarage/telegram-bridge 一样对齐处理',
        suggested: 'Align this implementation with ~/programming/OctopusGarage/telegram-bridge.',
        scene: 'implementation guidance',
        tags: ['implementation'],
        ipa: expect.arrayContaining([
          { word: 'align', ipa: '/əˈlaɪn/' },
          { word: 'implementation', ipa: '/ˌɪmplɪmenˈteɪʃn/' },
        ]),
      },
    });
  });

  it('returns concise coaching context', () => {
    const context = handleMcpToolCall('english_coaching_context', {});

    expect(context).toMatchObject({
      guidance: expect.stringContaining('Do not derail'),
    });
    expect(context).toMatchObject({
      finalResponseInstruction: expect.stringContaining('English note:'),
      cadence: expect.stringContaining('cooldown'),
    });
  });

  it('returns structured coaching context with cooldown and cap state through MCP', () => {
    runCli(['config', 'set', 'coachingCooldownMinutes', '30']);
    runCli(['config', 'set', 'maxInlineCoachingPerDay', '1']);
    runCli([
      'check',
      '--text',
      'I want to create a new project because this workflow should help me practice English while we 创建一个新的项目流程 for review.',
      '--json',
    ]);

    const context = handleMcpToolCall('english_coaching_context', {});

    expect(context).toMatchObject({
      policy: {
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

  it('returns integration targets for supported channel adapters', () => {
    const result = handleMcpToolCall('english_integration_targets', {});

    expect(result).toEqual({
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
  });

  it('returns an integration daily review payload', () => {
    const recorded = handleMcpToolCall('english_record_learning_item', {
      original: '这个 threshold 后续支持调整强度',
      suggested: 'This threshold should support adjustable intensity later.',
    });
    const reviewDate = (recorded.item as { nextReviewAt: string }).nextReviewAt;

    const result = handleMcpToolCall('english_integration_daily_pack', {
      target: 'feishu',
      date: reviewDate,
    });

    expect(result).toMatchObject({
      target: {
        id: 'feishu',
        status: 'supported',
      },
      delivery: {
        supported: false,
        mode: 'payload-only',
      },
      pack: {
        date: reviewDate,
        itemCount: 1,
        markdown: expect.stringContaining('This threshold should support adjustable intensity later.'),
      },
    });
  });

  it('returns an integration dry run without sending', () => {
    const result = handleMcpToolCall('english_integration_dry_run', {
      target: 'wechat',
      date: '2026-07-08',
    });

    expect(result).toMatchObject({
      target: {
        id: 'wechat',
        status: 'supported',
      },
      operation: 'daily-review-delivery',
      wouldSend: false,
      requiresCredentials: [],
      messagePreview: {
        target: 'wechat',
        mode: 'long-connection',
        credentialPolicy: 'local-account',
        text: expect.stringContaining('EnglishPilot Daily Review'),
      },
      payload: {
        delivery: {
          supported: true,
          mode: 'message',
        },
      },
    });
  });

  it('returns integration credential policy through MCP', () => {
    const result = handleMcpToolCall('english_integration_credential_policy', {
      target: 'wechat',
    });

    expect(result).toEqual({
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
      policy: 'environment',
      storage: 'process-env',
      network: false,
      requiredCredentials: [],
      secretHandling:
        'EnglishPilot reads credentials from environment variables and does not persist integration secrets.',
    });
  });

  it('returns integration delivery mode through MCP', () => {
    const result = handleMcpToolCall('english_integration_delivery_mode', {
      target: 'feishu',
    });

    expect(result).toEqual({
      target: {
        id: 'feishu',
        label: 'Feishu/Lark',
        status: 'supported',
        capabilities: ['long-connection', 'qr-onboarding', 'message-coaching', 'reply-coaching', 'review-items'],
      },
      mode: 'long-connection-bot',
      status: 'supported',
      network: false,
      rationale:
        'Feishu/Lark uses the dedicated long-connection channel. Run `english-pilot feishu setup`, then `english-pilot feishu start`.',
    });
  });

  it('reports WeChat long-connection preflight through MCP without provider HTTP credentials', () => {
    const result = handleMcpToolCall('english_integration_preflight', {
      target: 'wechat',
    });

    expect(result).toEqual({
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
      ready: true,
      network: false,
      requiredCredentials: [],
      missing: [],
    });
  });

  it('reports WeChat send readiness through MCP without sending network messages', () => {
    const result = handleMcpToolCall('english_integration_send_readiness', {
      target: 'wechat',
      date: '2026-07-08',
      confirmSend: true,
    });

    expect(result).toMatchObject({
      target: {
        id: 'wechat',
        label: 'WeChat',
        status: 'supported',
      },
      operation: 'daily-review-delivery',
      ready: false,
      wouldSend: false,
      network: false,
      confirmSend: true,
      checks: expect.arrayContaining([
        { name: 'delivery-mode', ok: false, detail: 'long-connection-bot' },
        { name: 'credential-policy', ok: true, detail: 'environment' },
        { name: 'credentials', ok: true, detail: 'All required credentials are present.', missing: [] },
        {
          name: 'request-preview',
          ok: false,
          detail: 'WeChat uses `english-pilot wechat start`; HTTP request-preview sending is deprecated.',
        },
        { name: 'send-confirmation', ok: true, detail: 'Explicit send confirmation received.' },
      ]),
      blockers: [
        'long-connection-bot',
        'WeChat uses `english-pilot wechat start`; HTTP request-preview sending is deprecated.',
      ],
      dryRun: {
        wouldSend: false,
        messagePreview: {
          mode: 'long-connection',
          credentialPolicy: 'local-account',
        },
      },
    });
  });

  it('sends a WeChat daily review pack through MCP only with explicit send opt-in', async () => {
    const env = {
      ...process.env,
      WECHAT_ALLOWED_USERS: 'wxid_owner',
    };
    const calls: string[] = [];

    const result = await handleMcpToolCallAsync(
      'english_integration_send',
      {
        target: 'wechat',
        date: '2026-07-08',
        send: true,
      },
      {
        env,
        fetch: async (url) => {
          calls.push(url);
          if (url.startsWith('https://api.weixin.qq.com/cgi-bin/token?')) {
            return jsonResponse({ access_token: 'wechat-token', expires_in: 7200 });
          }
          return jsonResponse({ errcode: 0, errmsg: 'ok' });
        },
      },
    );

    expect(result).toMatchObject({
      target: {
        id: 'wechat',
      },
      wouldSend: false,
      network: false,
      ready: false,
      blockers: expect.arrayContaining(['long-connection-bot']),
    });
    expect(calls).toEqual([]);
  });

  it('blocks WeChat sends through MCP when account validation is required but missing', async () => {
    const env = {
      ...process.env,
      WECHAT_ALLOWED_USERS: 'wxid_owner',
    };
    const calls: string[] = [];

    const result = await handleMcpToolCallAsync(
      'english_integration_send',
      {
        target: 'wechat',
        date: '2026-07-08',
        send: true,
        requireValidation: true,
      },
      {
        env,
        fetch: async (url) => {
          calls.push(url);
          return jsonResponse({});
        },
      },
    );

    expect(result).toMatchObject({
      ready: false,
      target: {
        id: 'wechat',
      },
      blockers: expect.arrayContaining(['long-connection-bot']),
    });
    expect(calls).toEqual([]);
  });

  it('allows WeChat sends through MCP when required account validation history exists', async () => {
    const env = {
      ...process.env,
      WECHAT_ALLOWED_USERS: 'wxid_owner',
    };
    const calls: string[] = [];

    await handleMcpToolCallAsync(
      'english_integration_account_validate',
      {
        target: 'wechat',
        date: '2026-07-08',
        send: true,
        record: true,
      },
      {
        env,
        fetch: async (url) => {
          if (url.startsWith('https://api.weixin.qq.com/cgi-bin/token?')) {
            return jsonResponse({ access_token: 'wechat-token', expires_in: 7200 });
          }
          return jsonResponse({ errcode: 0, errmsg: 'ok' });
        },
      },
    );

    const result = await handleMcpToolCallAsync(
      'english_integration_send',
      {
        target: 'wechat',
        date: '2026-07-08',
        send: true,
        requireValidation: true,
      },
      {
        env,
        fetch: async (url) => {
          calls.push(url);
          if (url.startsWith('https://api.weixin.qq.com/cgi-bin/token?')) {
            return jsonResponse({ access_token: 'wechat-token', expires_in: 7200 });
          }
          return jsonResponse({ errcode: 0, errmsg: 'ok' });
        },
      },
    );

    expect(result).toMatchObject({
      target: {
        id: 'wechat',
      },
      ready: false,
      blockers: expect.arrayContaining(['long-connection-bot']),
    });
    expect(calls).toEqual([]);
  });

  it('returns a WeChat account validation guide through MCP', () => {
    const result = handleMcpToolCall('english_integration_account_guide', {
      target: 'wechat',
    });

    expect(result).toMatchObject({
      target: {
        id: 'wechat',
        label: 'WeChat',
      },
      deliveryMode: 'long-connection-bot',
      requiredCredentials: [],
      validationCommands: [
        'english-pilot wechat setup',
        'english-pilot wechat doctor --json',
        'english-pilot wechat start --dry-run --json',
        'english-pilot wechat start',
      ],
      troubleshooting: expect.arrayContaining([
        expect.objectContaining({
          symptom: 'doctor reports missing WECHAT_ACCOUNT',
        }),
        expect.objectContaining({
          fix: expect.stringContaining('WECHAT_ALLOWED_USERS'),
        }),
      ]),
    });
  });

  it('runs a WeChat account validation playbook through MCP with explicit send opt-in', async () => {
    const calls: string[] = [];

    const result = await handleMcpToolCallAsync(
      'english_integration_account_validate',
      {
        target: 'wechat',
        date: '2026-07-08',
        send: true,
      },
      {
        fetch: async (url) => {
          calls.push(url);
          return jsonResponse({ errcode: 0, errmsg: 'ok' });
        },
      },
    );

    expect(result).toMatchObject({
      target: {
        id: 'wechat',
      },
      operation: 'account-validation',
      validated: false,
      send: true,
      network: false,
      stages: [
        { name: 'preflight', ok: true },
        { name: 'dry-run', ok: true },
        { name: 'send-readiness', ok: false },
        { name: 'network-send', ok: false, skipped: true },
      ],
      blockers: expect.arrayContaining(['long-connection-bot']),
    });
    expect(calls).toEqual([]);
  });

  it('records and returns sanitized account validation history through MCP', async () => {
    const env = {
      ...process.env,
      WECHAT_ALLOWED_USERS: 'wxid_owner',
    };

    const result = await handleMcpToolCallAsync(
      'english_integration_account_validate',
      {
        target: 'wechat',
        date: '2026-07-08',
        send: true,
        record: true,
      },
      {
        env,
        fetch: async (url) => {
          if (url.startsWith('https://api.weixin.qq.com/cgi-bin/token?')) {
            return jsonResponse({ access_token: 'wechat-token', expires_in: 7200 });
          }
          return jsonResponse({ errcode: 0, errmsg: 'ok' });
        },
      },
    );
    const history = handleMcpToolCall('english_integration_validation_history', {
      target: 'wechat',
    });

    expect(result).toMatchObject({
      recorded: true,
      record: {
        target: {
          id: 'wechat',
          label: 'WeChat',
        },
        validated: false,
        send: true,
        network: false,
      },
    });
    expect(history).toMatchObject({
      records: [
        {
          target: {
            id: 'wechat',
          },
          validated: false,
          network: false,
        },
      ],
    });
    expect(JSON.stringify(history)).not.toContain('app-secret');
    expect(JSON.stringify(history)).not.toContain('wechat-token');
  });

  it('returns an integration message coaching payload through MCP', () => {
    const result = handleMcpToolCall('english_integration_message_coaching', {
      target: 'wechat',
      text: '我想创建一个 new project，用来辅助英语学习。',
    });

    expect(result).toMatchObject({
      target: {
        id: 'wechat',
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

  it('records a WeChat message coaching lesson through MCP when requested', () => {
    const result = handleMcpToolCall('english_integration_message_coaching', {
      target: 'wechat',
      text: '我想创建一个 new project，用来辅助英语学习。',
      record: true,
    });
    const queue = handleMcpToolCall('english_review_queue', {});

    expect(result).toMatchObject({
      recorded: true,
      item: {
        original: '我想创建一个 new project，用来辅助英语学习。',
        suggested: expect.stringContaining('create a new project'),
        scene: 'AI workflow discussion',
        tags: expect.arrayContaining(['integration-message', 'wechat']),
      },
    });
    expect(queue).toMatchObject({
      items: [
        {
          original: '我想创建一个 new project，用来辅助英语学习。',
          suggested: expect.stringContaining('create a new project'),
          tags: expect.arrayContaining(['integration-message', 'wechat']),
        },
      ],
    });
  });

  it('coaches and records a WeChat inbound message event through MCP', () => {
    const result = handleMcpToolCall('english_integration_event_coaching', {
      target: 'wechat',
      event: {
        MsgId: 'wechat-message-id',
        FromUserName: 'openid',
        Content: '我想创建一个 new project，用来辅助英语学习。',
      },
      record: true,
    });
    const queue = handleMcpToolCall('english_review_queue', {});

    expect(result).toMatchObject({
      event: {
        target: {
          id: 'wechat',
        },
        messageId: 'wechat-message-id',
        senderId: 'openid',
        text: '我想创建一个 new project，用来辅助英语学习。',
      },
      coaching: {
        message: {
          rewrite: expect.stringContaining('create a new project'),
        },
      },
      recorded: true,
      item: {
        tags: expect.arrayContaining(['integration-message', 'wechat']),
      },
    });
    expect(queue).toMatchObject({
      items: [
        {
          original: '我想创建一个 new project，用来辅助英语学习。',
          tags: expect.arrayContaining(['integration-message', 'wechat']),
        },
      ],
    });
  });

  it('delivers an Obsidian daily review file through MCP when explicitly requested', () => {
    const recorded = handleMcpToolCall('english_record_learning_item', {
      original: '这个 threshold 后续支持调整强度',
      suggested: 'This threshold should support adjustable intensity later.',
      scene: 'configuration discussion',
    });
    const date = (recorded.item as { nextReviewAt: string }).nextReviewAt;
    const directory = join(home, 'mcp-obsidian');

    const result = handleMcpToolCall('english_integration_deliver', {
      target: 'obsidian',
      date,
      directory,
      write: true,
    });
    const path = join(directory, `${date}.md`);

    expect(result).toMatchObject({
      target: {
        id: 'obsidian',
        status: 'deferred',
      },
      operation: 'daily-review-delivery',
      delivered: true,
      network: false,
      path,
      payload: {
        pack: {
          itemCount: 1,
          markdown: expect.stringContaining('This threshold should support adjustable intensity later.'),
        },
      },
    });
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toContain('Original: 这个 threshold 后续支持调整强度');
  });

  it('previews Obsidian daily review delivery through MCP without sending or writing', () => {
    const recorded = handleMcpToolCall('english_record_learning_item', {
      original: '这个 threshold 后续支持调整强度',
      suggested: 'This threshold should support adjustable intensity later.',
      scene: 'configuration discussion',
    });
    const date = (recorded.item as { nextReviewAt: string }).nextReviewAt;
    const directory = join(home, 'mcp-obsidian-preview');
    const path = join(directory, `${date}.md`);

    const result = handleMcpToolCall('english_integration_deliver', {
      target: 'obsidian',
      date,
      directory,
    });

    expect(result).toMatchObject({
      target: {
        id: 'obsidian',
        status: 'deferred',
      },
      operation: 'daily-review-delivery',
      delivered: false,
      wouldSend: false,
      network: false,
      path,
      payload: {
        pack: {
          itemCount: 1,
          markdown: expect.stringContaining('This threshold should support adjustable intensity later.'),
        },
      },
    });
    expect(existsSync(path)).toBe(false);
  });

  it('returns doctor diagnostics through MCP', () => {
    handleMcpToolCall('english_voice_stt_assess_provider', {
      providerName: 'acme-stt',
      response: {
        payload: {
          alternatives: [],
        },
      },
      record: true,
    });

    const result = handleMcpToolCall('english_doctor', {});

    expect(result).toMatchObject({
      ok: true,
      config: { ok: true },
      storage: { ok: true },
      rewrite: {
        backend: 'off',
        ready: true,
      },
      integrations: {
        feishu: {
          network: false,
          missing: expect.arrayContaining(['FEISHU_APP_ID']),
        },
        wechat: {
          network: false,
          missing: [],
        },
      },
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
  });

  it('writes doctor diagnostics through MCP when requested', () => {
    const directory = join(home, 'mcp-doctor-export');
    const result = handleMcpToolCall('english_doctor', {
      write: true,
      directory,
    });
    const outputPath = join(directory, 'english-pilot-doctor.md');

    expect(result).toMatchObject({
      ok: true,
      export: {
        written: true,
        path: outputPath,
      },
    });
    const markdown = readFileSync(outputPath, 'utf8');
    expect(markdown).toContain('# EnglishPilot Doctor Report');
    expect(markdown).toContain('## Voice');
  });

  it('records a voice practice item through MCP', () => {
    const result = handleMcpToolCall('english_record_voice_practice', {
      transcript: 'I want create new project',
      target: 'I want to create a new project.',
      feedback: 'Add "to" before create and pronounce project with first-syllable stress.',
    });
    const queue = handleMcpToolCall('english_review_queue', {});

    expect(result).toMatchObject({
      item: {
        original: 'I want create new project',
        suggested: 'I want to create a new project.',
        scene: 'voice practice',
        tags: expect.arrayContaining(['voice-practice']),
        ipa: expect.arrayContaining([
          { word: 'create', ipa: '/kriˈeɪt/' },
          { word: 'project', ipa: '/ˈprɑːdʒekt/' },
        ]),
      },
    });
    expect(queue).toMatchObject({
      items: [
        {
          scene: 'voice practice',
          suggested: 'I want to create a new project.',
        },
      ],
    });
  });

  it('suggests voice practice feedback through MCP when explicit feedback is omitted', () => {
    const result = handleMcpToolCall('english_record_voice_practice', {
      transcript: 'I want create new project',
      target: 'I want to create a new project.',
    });

    expect(result).toMatchObject({
      item: {
        pattern: expect.stringContaining('Missing words: to, a'),
      },
    });
    expect((result.item as { pattern: string }).pattern).toContain('Grammar focus: use "want to + verb"');
    expect((result.item as { pattern: string }).pattern).toContain(
      'Article focus: use "a" before a singular countable noun',
    );
    expect((result.item as { pattern: string }).pattern).toContain(
      'Pronunciation focus: create /kriˈeɪt/, project /ˈprɑːdʒekt/',
    );
  });

  it('returns voice input providers through MCP', () => {
    const result = handleMcpToolCall('english_voice_providers', {});

    expect(result).toEqual({
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
  });

  it('returns speech-to-text provider policy through MCP', () => {
    const result = handleMcpToolCall('english_voice_stt_policy', {});

    expect(result).toEqual({
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
  });

  it('returns the generic JSON speech-to-text contract through MCP', () => {
    const result = handleMcpToolCall('english_voice_stt_contract', {});

    expect(result).toMatchObject({
      provider: 'generic-json',
      request: {
        method: 'POST',
        headers: expect.arrayContaining(['Authorization: Bearer $CLOUD_STT_API_KEY']),
        body: {
          provider: 'generic-json',
          audioBase64: '<base64 wav/mp3/m4a bytes>',
        },
      },
      acceptedResponseFields: expect.arrayContaining([
        expect.objectContaining({ name: 'transcript' }),
        expect.objectContaining({ name: 'words[].confidence' }),
        expect.objectContaining({ name: 'phonemes[].word' }),
      ]),
      normalizedOutput: expect.arrayContaining(['transcript', 'words[].phonemes[]']),
    });
  });

  it('validates a generic JSON speech-to-text response through MCP', () => {
    const result = handleMcpToolCall('english_voice_stt_validate', {
      response: {
        transcript: 'I want to create a new project.',
        words: [
          {
            word: 'project',
            confidence: 0.86,
            phonemes: [{ phoneme: 'pr', confidence: 0.82 }],
          },
        ],
      },
    });

    expect(result).toMatchObject({
      provider: 'generic-json',
      valid: true,
      parsed: {
        transcript: 'I want to create a new project.',
        wordCount: 1,
        phonemeCount: 1,
      },
      blockers: [],
    });
  });

  it('records cloud STT provider assessment evidence through MCP', () => {
    const assessment = handleMcpToolCall('english_voice_stt_assess_provider', {
      providerName: 'acme-stt',
      response: {
        payload: {
          alternatives: [],
        },
      },
      record: true,
    });
    const roadmap = handleMcpToolCall('english_roadmap', {});
    const cloudSttItem = (roadmap.items as Array<Record<string, unknown>>).find(
      (item) => item.id === 'provider-specific-cloud-stt-contract',
    );

    expect(assessment).toMatchObject({
      operation: 'voice-stt-provider-assessment',
      providerName: 'acme-stt',
      genericJsonCompatible: false,
      providerSpecificContractNeeded: true,
      recorded: true,
      validation: {
        valid: false,
      },
    });
    expect(cloudSttItem).toMatchObject({
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

  it('lists recorded cloud STT provider assessment evidence through MCP', () => {
    handleMcpToolCall('english_voice_stt_assess_provider', {
      providerName: 'compatible-stt',
      response: {
        text: 'I want to create a new project.',
      },
      record: true,
    });
    handleMcpToolCall('english_voice_stt_assess_provider', {
      providerName: 'acme-stt',
      response: {
        payload: {
          alternatives: [],
        },
      },
      record: true,
    });

    const all = handleMcpToolCall('english_voice_stt_assessment_history', {});
    const filtered = handleMcpToolCall('english_voice_stt_assessment_history', {
      providerName: 'acme-stt',
    });

    expect(all).toMatchObject({
      records: [
        { providerName: 'compatible-stt', genericJsonCompatible: true },
        { providerName: 'acme-stt', genericJsonCompatible: false },
      ],
    });
    expect(filtered).toMatchObject({
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
  });

  it('drafts a provider-specific STT contract plan through MCP', () => {
    const missing = handleMcpToolCall('english_voice_stt_provider_contract_draft', {
      providerName: 'acme-stt',
    });
    handleMcpToolCall('english_voice_stt_assess_provider', {
      providerName: 'acme-stt',
      response: {
        payload: {
          alternatives: [],
        },
      },
      record: true,
    });
    const ready = handleMcpToolCall('english_voice_stt_provider_contract_draft', {
      providerName: 'acme-stt',
    });

    expect(missing).toMatchObject({
      operation: 'voice-stt-provider-contract-draft',
      providerName: 'acme-stt',
      status: 'needs-assessment',
      providerSpecificContractNeeded: null,
      missingEvidence: expect.arrayContaining(['recorded generic-json incompatibility assessment for acme-stt']),
    });
    expect(ready).toMatchObject({
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
    });
  });

  it('returns a local speech-to-text wrapper template through MCP', () => {
    const result = handleMcpToolCall('english_voice_stt_wrapper_template', {});

    expect(result).toMatchObject({
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
    expect(result.template as string).toContain('json.dumps');
  });

  it('reports supported local voice provider preflight through MCP', () => {
    const previous = {
      WHISPER_COMMAND: process.env.WHISPER_COMMAND,
    };
    delete process.env.WHISPER_COMMAND;

    try {
      const result = handleMcpToolCall('english_voice_preflight', {
        provider: 'local-whisper',
      });

      expect(result).toEqual({
        provider: {
          id: 'local-whisper',
          label: 'Local Whisper',
          status: 'supported',
          input: 'audio',
          capabilities: ['speech-to-text', 'pronunciation-feedback'],
        },
        ready: false,
        network: false,
        requiredConfiguration: [{ name: 'WHISPER_COMMAND', present: false }],
        missing: ['WHISPER_COMMAND'],
      });
    } finally {
      restoreEnv(previous);
    }
  });

  it('transcribes audio through generic JSON cloud STT over MCP', async () => {
    const audioPath = join(home, 'sample.wav');
    writeFileSync(audioPath, 'fake audio', 'utf8');
    const calls: string[] = [];

    const result = await handleMcpToolCallAsync(
      'english_voice_transcribe',
      {
        provider: 'cloud-stt',
        audioPath,
      },
      {
        env: {
          ...process.env,
          CLOUD_STT_PROVIDER: 'generic-json',
          CLOUD_STT_API_KEY: 'cloud-key',
          CLOUD_STT_ENDPOINT: 'https://stt.example.test/transcribe',
        },
        fetch: async (url) => {
          calls.push(url);
          return jsonResponse({
            transcript: 'I want create new project',
            words: [{ word: 'project', confidence: 0.7 }],
          });
        },
      },
    );

    expect(result).toMatchObject({
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
      words: [{ word: 'project', confidence: 0.7 }],
    });
    expect(calls).toEqual(['https://stt.example.test/transcribe']);
    expect(JSON.stringify(result)).not.toContain('cloud-key');
  });

  it('reports a non-executable local Whisper command through MCP preflight', () => {
    const previous = {
      WHISPER_COMMAND: process.env.WHISPER_COMMAND,
    };
    const fakeWhisper = join(home, 'fake-whisper');
    writeFileSync(fakeWhisper, '#!/bin/sh\nexit 0\n', 'utf8');
    process.env.WHISPER_COMMAND = fakeWhisper;

    try {
      const result = handleMcpToolCall('english_voice_preflight', {
        provider: 'local-whisper',
      });

      expect(result).toMatchObject({
        provider: {
          id: 'local-whisper',
        },
        ready: false,
        network: false,
        missing: [],
        errors: [expect.stringContaining('not executable')],
      });
    } finally {
      restoreEnv(previous);
    }
  });

  it('transcribes audio through the configured local Whisper command over MCP', () => {
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
      const result = handleMcpToolCall('english_voice_transcribe', {
        provider: 'local-whisper',
        audioPath,
      });

      expect(result).toMatchObject({
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

  it('returns word-level local Whisper JSON through MCP transcription', () => {
    const previous = {
      WHISPER_COMMAND: process.env.WHISPER_COMMAND,
    };
    const fakeWhisper = join(home, 'fake-whisper-json');
    const audioPath = join(home, 'sample.wav');
    writeFileSync(
      fakeWhisper,
      [
        '#!/bin/sh',
        'printf \'{"transcript":"I want create new project","words":[{"word":"create","start":0.4,"end":0.8,"confidence":0.52}]}\\n\'',
        '',
      ].join('\n'),
      'utf8',
    );
    chmodSync(fakeWhisper, 0o755);
    writeFileSync(audioPath, 'fake audio', 'utf8');
    process.env.WHISPER_COMMAND = fakeWhisper;

    try {
      const result = handleMcpToolCall('english_voice_transcribe', {
        provider: 'local-whisper',
        audioPath,
      });

      expect(result).toMatchObject({
        transcript: 'I want create new project',
        words: [{ word: 'create', startSeconds: 0.4, endSeconds: 0.8, confidence: 0.52 }],
      });
    } finally {
      restoreEnv(previous);
    }
  });

  it('records a voice practice item from local Whisper transcription through MCP', () => {
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
      const result = handleMcpToolCall('english_voice_practice_from_audio', {
        provider: 'local-whisper',
        audioPath,
        target: 'I want to create a new project.',
        feedback: 'Add "to" before create.',
      });
      const queue = handleMcpToolCall('english_review_queue', {});

      expect(result).toMatchObject({
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
        },
      });
      expect(queue).toMatchObject({
        items: [
          {
            original: 'I want create new project',
            suggested: 'I want to create a new project.',
          },
        ],
      });
    } finally {
      restoreEnv(previous);
    }
  });

  it('suggests feedback for audio voice practice through MCP when explicit feedback is omitted', () => {
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
      const result = handleMcpToolCall('english_voice_practice_from_audio', {
        provider: 'local-whisper',
        audioPath,
        target: 'I want to create a new project.',
      });

      expect(result).toMatchObject({
        item: {
          pattern: expect.stringContaining('Missing words: to, a'),
        },
      });
      expect((result.item as { pattern: string }).pattern).toContain('Grammar focus: use "want to + verb"');
      expect((result.item as { pattern: string }).pattern).toContain(
        'Article focus: use "a" before a singular countable noun',
      );
      expect((result.item as { pattern: string }).pattern).toContain(
        'Pronunciation focus: create /kriˈeɪt/, project /ˈprɑːdʒekt/',
      );
    } finally {
      restoreEnv(previous);
    }
  });

  it('records word-level pronunciation scoring through MCP voice practice', () => {
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
      const result = handleMcpToolCall('english_voice_practice_from_audio', {
        provider: 'local-whisper',
        audioPath,
        target: 'I want to create a new project.',
      });

      expect(result).toMatchObject({
        transcription: {
          words: expect.arrayContaining([{ word: 'create', confidence: 0.52 }]),
        },
        item: {
          pattern: expect.stringContaining('Pronunciation scoring: average confidence 80%'),
        },
      });
      expect((result.item as { pattern: string }).pattern).toContain('Low-confidence words: create, project');
    } finally {
      restoreEnv(previous);
    }
  });

  it('records phoneme-level pronunciation scoring through MCP voice practice', () => {
    const previous = {
      WHISPER_COMMAND: process.env.WHISPER_COMMAND,
    };
    const fakeWhisper = join(home, 'fake-whisper-phonemes');
    const audioPath = join(home, 'sample.wav');
    writeFileSync(
      fakeWhisper,
      [
        '#!/bin/sh',
        'printf \'{"text":"I want create new project","segments":[{"words":[{"word":"create","confidence":0.82,"phonemes":[{"phoneme":"k","start":0.4,"end":0.45,"confidence":0.93},{"phoneme":"r","start":0.45,"end":0.5,"confidence":0.42}]}]}],"phonemes":[{"word":"project","phoneme":"dʒ","confidence":0.64}]}\\n\'',
        '',
      ].join('\n'),
      'utf8',
    );
    chmodSync(fakeWhisper, 0o755);
    writeFileSync(audioPath, 'fake audio', 'utf8');
    process.env.WHISPER_COMMAND = fakeWhisper;

    try {
      const result = handleMcpToolCall('english_voice_practice_from_audio', {
        provider: 'local-whisper',
        audioPath,
        target: 'I want to create a new project.',
      });

      const words = (result.transcription as { words: Array<{ word: string }> }).words;
      const create = words.find((word) => word.word === 'create');
      const project = words.find((word) => word.word === 'project');
      expect(create).toMatchObject({
        phonemes: [
          { phoneme: 'k', startSeconds: 0.4, endSeconds: 0.45, confidence: 0.93 },
          { phoneme: 'r', startSeconds: 0.45, endSeconds: 0.5, confidence: 0.42 },
        ],
      });
      expect(project).toMatchObject({
        phonemes: [{ phoneme: 'dʒ', confidence: 0.64 }],
      });
      expect((result.item as { pattern: string }).pattern).toContain('Phoneme scoring: average confidence 66%');
      expect((result.item as { pattern: string }).pattern).toContain('Low-confidence phonemes: create/r, project/dʒ');
    } finally {
      restoreEnv(previous);
    }
  });

  it('returns daily review retrieval prompts', () => {
    const recorded = handleMcpToolCall('english_record_learning_item', {
      original: '这个 threshold 后续支持调整强度',
      suggested: 'This threshold should support adjustable intensity later.',
    });
    const first = handleMcpToolCall('english_daily_review', {});
    handleMcpToolCall('english_mark_review', {
      id: (recorded.item as { id: string }).id,
      outcome: 'again',
    });

    const result = handleMcpToolCall('english_daily_review', {});

    expect(first).toEqual({ items: [] });
    expect(result).toMatchObject({
      items: [
        {
          reviewPrompt: expect.stringContaining('How would you say'),
        },
      ],
    });
  });

  it('checks a daily review answer through MCP', () => {
    const recorded = handleMcpToolCall('english_record_method_template', {
      id: 'debugging',
    });

    const result = handleMcpToolCall('english_daily_check', {
      id: (recorded.item as { id: string }).id,
      answer: 'I reproduced the issue with Codex hook.',
    });

    expect(result).toMatchObject({
      item: {
        id: (recorded.item as { id: string }).id,
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

  it('returns due and upcoming review schedules', () => {
    const recorded = handleMcpToolCall('english_record_learning_item', {
      original: '这个 threshold 后续支持调整强度',
      suggested: 'This threshold should support adjustable intensity later.',
    });
    const marked = handleMcpToolCall('english_mark_review', {
      id: (recorded.item as { id: string }).id,
      outcome: 'again',
    });
    const date = (marked.item as { nextReviewAt: string }).nextReviewAt;

    const due = handleMcpToolCall('english_review_due', { date });
    const upcoming = handleMcpToolCall('english_review_upcoming', {
      date,
      days: 3,
    });

    expect(due).toMatchObject({
      date,
      items: [
        {
          id: (recorded.item as { id: string }).id,
          suggested: 'This threshold should support adjustable intensity later.',
        },
      ],
    });
    expect(upcoming).toMatchObject({
      date,
      days: 3,
      groups: [
        {
          date: expect.any(String),
          count: 1,
          items: [
            {
              id: (recorded.item as { id: string }).id,
            },
          ],
        },
      ],
    });
  });

  it('returns a daily review markdown pack', () => {
    const recorded = handleMcpToolCall('english_record_learning_item', {
      original: '这个 threshold 后续支持调整强度',
      suggested: 'This threshold should support adjustable intensity later.',
      scene: 'configuration discussion',
    });
    const marked = handleMcpToolCall('english_mark_review', {
      id: (recorded.item as { id: string }).id,
      outcome: 'again',
    });
    const date = (marked.item as { nextReviewAt: string }).nextReviewAt;

    const result = handleMcpToolCall('english_daily_pack', { date });

    expect(result).toMatchObject({
      date,
      items: [
        {
          id: (recorded.item as { id: string }).id,
          suggested: 'This threshold should support adjustable intensity later.',
        },
      ],
      markdown: expect.stringContaining(`# EnglishPilot Daily Review - ${date}`),
    });
    expect(result.markdown as string).toContain('Review prompt:');
    expect(result.markdown as string).toContain('Answer: This threshold should support adjustable intensity later.');
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
