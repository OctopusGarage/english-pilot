import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/adapters/cli.js';

describe('personal glossary', () => {
  let previousHome: string | undefined;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-glossary-'));
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

  it('adds, lists, and removes glossary entries', () => {
    const added = runCli([
      'glossary',
      'add',
      'vectorize',
      '--ipa',
      '/ˈvektəraɪz/',
      '--meaning',
      '向量化',
      '--tag',
      'ml',
    ]);
    const listed = runCli(['glossary', 'list', '--json']);
    const removed = runCli(['glossary', 'remove', 'vectorize']);
    const afterRemove = runCli(['glossary', 'list', '--json']);

    expect(added.exitCode).toBe(0);
    expect(JSON.parse(listed.stdout)).toMatchObject([
      {
        term: 'vectorize',
        ipa: '/ˈvektəraɪz/',
        meaning: '向量化',
        tags: ['ml'],
      },
    ]);
    expect(removed.stdout).toContain('Removed vectorize');
    expect(JSON.parse(afterRemove.stdout)).toEqual([]);
  });

  it('uses glossary entries when extracting lessons', () => {
    runCli(['glossary', 'add', 'vectorize', '--ipa', '/ˈvektəraɪz/', '--meaning', '向量化']);

    const lesson = runCli(['coach', '--text', 'We need to vectorize this pipeline.', '--json']);

    expect(JSON.parse(lesson.stdout)).toMatchObject({
      lesson: {
        worthRecording: true,
        keyPhrases: expect.arrayContaining(['vectorize']),
        ipa: expect.arrayContaining([{ word: 'vectorize', ipa: '/ˈvektəraɪz/' }]),
      },
    });
  });

  it('allows configured Chinese glossary terms in English-leading prompts', () => {
    runCli(['glossary', 'add', '飞书知识库同步区', '--meaning', 'Feishu knowledge base', '--allow-term']);

    const result = runCli(['check', '--text', 'Please sync this summary to 飞书知识库同步区 for review.', '--json']);

    expect(JSON.parse(result.stdout)).toMatchObject({
      decision: 'ALLOW_SILENT',
      nonEnglishCount: 0,
    });
  });

  it('does not let an allowed glossary term bypass English-leading enforcement', () => {
    runCli(['glossary', 'add', '飞书知识库同步区', '--meaning', 'Feishu knowledge base', '--allow-term']);

    const result = runCli(['check', '--text', '飞书知识库同步区 sync this summary.', '--json']);

    expect(JSON.parse(result.stdout)).toMatchObject({
      decision: 'BLOCK',
      reason: expect.stringContaining('English-leading'),
    });
  });

  it('applies allowed glossary terms in Codex hook checks', () => {
    runCli(['glossary', 'add', '飞书知识库同步区', '--meaning', 'Feishu knowledge base', '--allow-term']);

    const result = runCli(
      ['hook', 'codex', '--stdin'],
      JSON.stringify({
        prompt: 'Please sync this summary to 飞书知识库同步区 for review.',
      }),
    );

    expect(result).toEqual({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });
  });
});
