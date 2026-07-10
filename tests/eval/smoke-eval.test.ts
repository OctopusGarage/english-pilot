import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli, runCliAsync } from '../../src/adapters/cli.js';
import { runAgentEval } from '../../src/eval/agent-eval-runner.js';

describe('smoke eval command', () => {
  let previousHome: string | undefined;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-smoke-eval-'));
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

  it('runs deterministic local smoke eval cases', () => {
    const result = runCli(['eval', 'smoke', '--json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      operation: 'english-pilot-smoke-eval',
      passed: true,
    });
    expect(payload.cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'gate.blocks_over_limit_chinese', passed: true }),
        expect.objectContaining({ id: 'gate.force_coaches_awkward_mixed_prompt', passed: true }),
        expect.objectContaining({ id: 'voice.local_whisper_fake_provider_transcribes', passed: true }),
        expect.objectContaining({ id: 'channel.feishu_agent_prompt_includes_coaching', passed: true }),
        expect.objectContaining({ id: 'channel.wechat_agent_prompt_includes_coaching', passed: true }),
        expect.objectContaining({ id: 'agent.codex_dry_run_builds_resume_safe_command', passed: true }),
      ]),
    );
    const codexCase = payload.cases.find(
      (item: { id: string }) => item.id === 'agent.codex_dry_run_builds_resume_safe_command',
    );
    expect(codexCase.details.args).toContain('<temporary-workspace>');
    expect(JSON.stringify(codexCase.details.args)).not.toContain(home);
  });

  it('prints smoke eval prompts for manual Claude or Codex checks', () => {
    const result = runCli(['eval', 'prompts']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('what is the weather about 广州');
    expect(result.stdout).toContain('<english_pilot_learning_brief>');
    expect(result.stdout).toContain('<english_pilot_coaching>');
    expect(result.stdout).toContain(' -> ');
    expect(result.stdout).not.toContain('-&gt;');
    expect(result.stdout).toContain('codex exec');
    expect(result.stdout).toContain('claude -p');
  });

  it('dry-runs an AI-backed agent eval without calling a model', async () => {
    const result = await runCliAsync([
      'eval',
      'agent',
      '--backend',
      'codex',
      '--case',
      'channel-weather',
      '--dry-run',
      '--json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      operation: 'english-pilot-agent-eval',
      backend: 'codex',
      caseId: 'channel-weather',
      dryRun: true,
      passed: true,
    });
    expect(payload.run).toMatchObject({
      dryRun: true,
      command: 'codex',
    });
    expect(payload.prompt).toContain('<english_pilot_coaching>');
    expect(payload.prompt).toContain('Required: after the main reply');
    expect(payload.prompt).toContain('Do not omit it.');
    expect(payload.prompt).toContain('Please help me phrase this weather question naturally');
  });

  it('dry-runs the history lesson AI-backed eval without calling a model', async () => {
    const result = await runCliAsync([
      'eval',
      'agent',
      '--backend',
      'codex',
      '--case',
      'history-lesson',
      '--dry-run',
      '--json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      operation: 'english-pilot-agent-eval',
      backend: 'codex',
      caseId: 'history-lesson',
      dryRun: true,
      passed: true,
    });
    expect(payload.prompt).toContain('<english_pilot_learning_brief>');
    expect(payload.prompt).toContain('short English speech');
  });

  it('judges a mocked AI-backed eval response', async () => {
    const report = await runAgentEval({
      backend: 'claude',
      caseId: 'channel-weather',
      dryRun: false,
      runAgent: async (options) => ({
        operation: 'external-agent-run',
        backend: 'claude',
        command: 'claude',
        args: ['-p'],
        cwd: options.cwd ?? process.cwd(),
        promptStdin: options.prompt,
        dryRun: false,
        exitCode: 0,
        stdout: [
          'Guangzhou is cloudy today.',
          '',
          'English note: "what is the weather about 广州" -> "What is the weather like in Guangzhou?"',
          'Why: Use "What is the weather like in + place?" for local weather.',
          'IPA: weather /ˈweðər/',
        ].join('\n'),
        stderr: '',
      }),
    });

    expect(report).toMatchObject({
      operation: 'english-pilot-agent-eval',
      backend: 'claude',
      caseId: 'channel-weather',
      dryRun: false,
      passed: true,
    });
    expect(report.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'agent_exit_zero', passed: true }),
        expect.objectContaining({ id: 'contains_english_note', passed: true }),
        expect.objectContaining({ id: 'contains_better_weather_phrase', passed: true }),
        expect.objectContaining({ id: 'contains_why', passed: true }),
        expect.objectContaining({ id: 'contains_ipa', passed: true }),
      ]),
    );
  });

  it('judges a mocked history-lesson AI-backed eval response', async () => {
    const report = await runAgentEval({
      backend: 'codex',
      caseId: 'history-lesson',
      dryRun: false,
      runAgent: async (options) => ({
        operation: 'external-agent-run',
        backend: 'codex',
        command: 'codex',
        args: ['exec', '--json', '-'],
        cwd: options.cwd ?? process.cwd(),
        promptStdin: options.prompt,
        dryRun: false,
        exitCode: 0,
        stdout: [
          'Summary: Your main pattern is mixing Chinese place names or action words into English questions.',
          'Corrected expressions: "What is the weather like in Guangzhou?", "I want to create a new project.", and "Review all the docs, simplify them, and keep them clear."',
          'IPA: weather /ˈweðər/, simplify /ˈsɪmplɪfaɪ/.',
          'Practice speech: Today, I will create a new project, ask clear questions, and keep my docs simple.',
        ].join('\n'),
        stderr: '',
      }),
    });

    expect(report).toMatchObject({
      operation: 'english-pilot-agent-eval',
      backend: 'codex',
      caseId: 'history-lesson',
      dryRun: false,
      passed: true,
    });
    expect(report.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'agent_exit_zero', passed: true }),
        expect.objectContaining({ id: 'contains_history_weather_correction', passed: true }),
        expect.objectContaining({ id: 'contains_new_project_correction', passed: true }),
        expect.objectContaining({ id: 'contains_teaching_structure', passed: true }),
        expect.objectContaining({ id: 'contains_ipa', passed: true }),
        expect.objectContaining({ id: 'contains_practice_speech', passed: true }),
      ]),
    );
  });

  it('classifies local agent authentication failures', async () => {
    const report = await runAgentEval({
      backend: 'claude',
      caseId: 'channel-weather',
      dryRun: false,
      runAgent: async (options) => ({
        operation: 'external-agent-run',
        backend: 'claude',
        command: 'claude',
        args: ['-p'],
        cwd: options.cwd ?? process.cwd(),
        promptStdin: options.prompt,
        dryRun: false,
        exitCode: 1,
        stdout: 'Not logged in · Please run /login',
        stderr: '',
      }),
    });

    expect(report.passed).toBe(false);
    expect(report.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'agent_exit_zero',
          passed: false,
          details: expect.objectContaining({ failureKind: 'auth-required' }),
        }),
      ]),
    );
  });

  it('accepts reasonable Claude-style rationale headings in AI-backed eval output', async () => {
    const report = await runAgentEval({
      backend: 'claude',
      caseId: 'channel-weather',
      dryRun: false,
      runAgent: async (options) => ({
        operation: 'external-agent-run',
        backend: 'claude',
        command: 'claude',
        args: ['-p'],
        cwd: options.cwd ?? process.cwd(),
        promptStdin: options.prompt,
        dryRun: false,
        exitCode: 0,
        stdout: [
          'Natural phrasing: What is the weather like in Guangzhou?',
          '',
          'English note: "what is the weather about 广州" -> "What is the weather like in Guangzhou?"',
          'Why this is natural: Use "What is the weather like in + place?" for local weather.',
          'IPA: weather /ˈweðər/',
        ].join('\n'),
        stderr: '',
      }),
    });

    expect(report).toMatchObject({ passed: true });
    expect(report.assertions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'contains_why', passed: true })]),
    );
  });

  it('accepts inline use-rule rationale in AI-backed eval output', async () => {
    const report = await runAgentEval({
      backend: 'claude',
      caseId: 'channel-weather',
      dryRun: false,
      runAgent: async (options) => ({
        operation: 'external-agent-run',
        backend: 'claude',
        command: 'claude',
        args: ['-p'],
        cwd: options.cwd ?? process.cwd(),
        promptStdin: options.prompt,
        dryRun: false,
        exitCode: 0,
        stdout: [
          'Natural phrasing: What is the weather like in Guangzhou?',
          '',
          'English note: "what is the weather about 广州" -> "What is the weather like in Guangzhou?"',
          'Use "What is the weather like in + place?" when asking about local weather conditions.',
          'weather /ˈweðər/',
        ].join('\n'),
        stderr: '',
      }),
    });

    expect(report).toMatchObject({ passed: true });
    expect(report.assertions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'contains_why', passed: true })]),
    );
  });
});
