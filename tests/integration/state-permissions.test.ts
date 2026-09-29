import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/adapters/cli.js';
import { recordIntegrationValidation } from '../../src/integrations/validation-history.js';
import { findIntegrationTarget } from '../../src/integrations/targets.js';
import { runDailyReviewAccountValidation } from '../../src/integrations/daily-review-delivery.js';

describe('runtime state permissions', () => {
  let previousHome: string | undefined;
  let previousUmask: number;
  let directory: string;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    previousUmask = process.umask(0o022);
    directory = mkdtempSync(join(tmpdir(), 'english-pilot-permissions-'));
    home = join(directory, 'state');
    process.env.ENGLISH_PILOT_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.ENGLISH_PILOT_HOME;
    else process.env.ENGLISH_PILOT_HOME = previousHome;
    process.umask(previousUmask);
    rmSync(directory, { recursive: true, force: true });
  });

  it('creates a private home and config file through config set', () => {
    expect(runCli(['config', 'set', 'maxChineseRatio', '0.25']).exitCode).toBe(0);

    expect(mode(home)).toBe(0o700);
    expect(mode(join(home, 'config.json'))).toBe(0o600);
  });

  it('tightens an existing home and config file on update', () => {
    mkdirSync(home, { mode: 0o755 });
    writeFileSync(join(home, 'config.json'), '{}\n', { mode: 0o644 });
    chmodSync(home, 0o755);

    expect(runCli(['config', 'set', 'maxChineseRatio', '0.25']).exitCode).toBe(0);

    expect(mode(home)).toBe(0o700);
    expect(mode(join(home, 'config.json'))).toBe(0o600);
  });

  it('creates private JSONL prompt storage and tightens an existing file', () => {
    expect(runCli(['config', 'set', 'storage', 'jsonl']).exitCode).toBe(0);
    expect(runCli(['check', '--text', 'A private prompt.']).exitCode).toBe(0);
    const path = join(home, 'prompt-events.jsonl');
    expect(mode(path)).toBe(0o600);

    chmodSync(home, 0o755);
    chmodSync(path, 0o644);
    expect(runCli(['check', '--text', 'Another private prompt.']).exitCode).toBe(0);
    expect(mode(home)).toBe(0o700);
    expect(mode(path)).toBe(0o600);
  });

  it('creates private SQLite storage and tightens an existing database', () => {
    expect(runCli(['check', '--text', 'A private prompt.']).exitCode).toBe(0);
    const path = join(home, 'english-pilot.sqlite');
    expect(mode(home)).toBe(0o700);
    expect(mode(path)).toBe(0o600);

    chmodSync(home, 0o755);
    chmodSync(path, 0o644);
    expect(runCli(['check', '--text', 'Another private prompt.']).exitCode).toBe(0);
    expect(mode(home)).toBe(0o700);
    expect(mode(path)).toBe(0o600);
  });

  it('protects a new default glossary and tightens an existing one', () => {
    expect(runCli(['glossary', 'add', 'private-term', '--meaning', 'personal note']).exitCode).toBe(0);
    const path = join(home, 'glossary.json');
    expect(mode(home)).toBe(0o700);
    expect(mode(path)).toBe(0o600);

    chmodSync(home, 0o755);
    chmodSync(path, 0o644);
    expect(runCli(['glossary', 'add', 'another-term']).exitCode).toBe(0);
    expect(mode(home)).toBe(0o700);
    expect(mode(path)).toBe(0o600);
  });

  it('protects new and existing integration validation history', async () => {
    const target = findIntegrationTarget('wechat');
    if (!target) throw new Error('Missing WeChat target');
    const result = await runDailyReviewAccountValidation({ target, date: '2026-09-30', items: [] });
    recordIntegrationValidation(result);
    const path = join(home, 'integration-validations.jsonl');
    expect(mode(home)).toBe(0o700);
    expect(mode(path)).toBe(0o600);

    chmodSync(home, 0o755);
    chmodSync(path, 0o644);
    recordIntegrationValidation(result);
    expect(mode(home)).toBe(0o700);
    expect(mode(path)).toBe(0o600);
  });

  it('protects new and existing voice assessment history', () => {
    const args = [
      'voice',
      'stt-assess-provider',
      '--provider-name',
      'private-provider',
      '--response-json',
      '{}',
      '--record',
    ];
    expect(runCli(args).exitCode).toBe(0);
    const path = join(home, 'voice-stt-assessments.jsonl');
    expect(mode(home)).toBe(0o700);
    expect(mode(path)).toBe(0o600);

    chmodSync(home, 0o755);
    chmodSync(path, 0o644);
    expect(runCli(args).exitCode).toBe(0);
    expect(mode(home)).toBe(0o700);
    expect(mode(path)).toBe(0o600);
  });

  it('protects default daily review packs and tightens existing output', () => {
    const args = ['daily', 'pack', '--date', '2026-09-30', '--write'];
    expect(runCli(args).exitCode).toBe(0);
    const dir = join(home, 'reviews');
    const path = join(dir, '2026-09-30.md');
    expect([mode(home), mode(dir), mode(path)]).toEqual([0o700, 0o700, 0o600]);

    chmodSync(home, 0o755);
    chmodSync(dir, 0o755);
    chmodSync(path, 0o644);
    expect(runCli(args).exitCode).toBe(0);
    expect([mode(home), mode(dir), mode(path)]).toEqual([0o700, 0o700, 0o600]);
  });

  it('protects default Obsidian export directories and files', () => {
    expect(runCli(['glossary', 'add', 'private-term']).exitCode).toBe(0);
    expect(
      runCli([
        'coach',
        '--text',
        '这个 threshold 后续支持调整强度, and the workflow should feel sophisticated.',
        '--record',
      ]).exitCode,
    ).toBe(0);
    expect(runCli(['export', 'obsidian', '--write']).exitCode).toBe(0);
    const dir = join(home, 'obsidian');
    expect(mode(dir)).toBe(0o700);
    const files = readdirSync(dir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(mode(join(dir, file))).toBe(0o600);

    chmodSync(home, 0o755);
    chmodSync(dir, 0o755);
    for (const file of files) chmodSync(join(dir, file), 0o644);
    expect(runCli(['export', 'obsidian', '--write']).exitCode).toBe(0);
    expect([mode(home), mode(dir)]).toEqual([0o700, 0o700]);
    for (const file of files) expect(mode(join(dir, file))).toBe(0o600);
  });

  it('protects default Obsidian delivery output', () => {
    expect(
      runCli(['integrations', 'deliver', '--target', 'obsidian', '--date', '2026-09-30', '--write']).exitCode,
    ).toBe(0);
    const dir = join(home, 'integrations', 'obsidian');
    expect([mode(home), mode(join(home, 'integrations')), mode(dir), mode(join(dir, '2026-09-30.md'))]).toEqual([
      0o700, 0o700, 0o700, 0o600,
    ]);

    chmodSync(home, 0o755);
    chmodSync(join(home, 'integrations'), 0o755);
    chmodSync(dir, 0o755);
    chmodSync(join(dir, '2026-09-30.md'), 0o644);
    expect(
      runCli(['integrations', 'deliver', '--target', 'obsidian', '--date', '2026-09-30', '--write']).exitCode,
    ).toBe(0);
    expect([mode(home), mode(join(home, 'integrations')), mode(dir), mode(join(dir, '2026-09-30.md'))]).toEqual([
      0o700, 0o700, 0o700, 0o600,
    ]);
  });
});

function mode(path: string): number {
  return statSync(path).mode & 0o777;
}
