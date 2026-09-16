import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLocalTranslationResult } from '../../src/core/translation-result.js';

const spawnSync = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawnSync }));

describe('buildLocalTranslationResult', () => {
  afterEach(() => {
    spawnSync.mockReset();
  });

  it('normalizes a known glossary word and exposes its IPA and meaning', () => {
    const result = buildLocalTranslationResult('workflow', [
      {
        term: 'workflow',
        ipa: '/ˈwɝːkfloʊ/',
        meaning: '工作流程',
        tags: ['software-engineering'],
        allowTerm: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(result).toMatchObject({
      original: 'workflow',
      normalized: 'workflow',
      translation: '工作流程',
      pronunciation: '/ˈwɝːkfloʊ/',
    });
    expect(result.kind).toBe('word');
    expect(result.partOfSpeech).toBeUndefined();
  });

  it('uses supplied glossary data for a custom term and includes its IPA in the collection', () => {
    const result = buildLocalTranslationResult('vectorize', [
      {
        term: 'vectorize',
        ipa: '/ˈvektəraɪz/',
        meaning: '向量化',
        tags: ['ml'],
        allowTerm: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(result).toMatchObject({
      translation: '向量化',
      pronunciation: '/ˈvektəraɪz/',
      ipa: [{ word: 'vectorize', ipa: '/ˈvektəraɪz/' }],
    });
  });

  it('returns a built-in local vocabulary result for an inflected common word', () => {
    const result = buildLocalTranslationResult('exacerbates', []);

    expect(result).toMatchObject({
      original: 'exacerbates',
      normalized: 'exacerbates',
      translation: '使恶化；加剧',
      pronunciation: '/ɪɡˈzæsərbeɪt/',
      partOfSpeech: 'verb',
      explanation: 'To make a problem, conflict, or bad situation worse.',
      examples: expect.arrayContaining(['This exacerbates the problem.']),
      collocations: expect.arrayContaining(['exacerbate a problem']),
    });
    expect(result.ipa).toContainEqual({ word: 'exacerbate', ipa: '/ɪɡˈzæsərbeɪt/' });
  });

  it('returns an immediate local result for a known technical phrase', () => {
    const result = buildLocalTranslationResult('This exacerbates the architectural friction', []);

    expect(result).toMatchObject({
      original: 'This exacerbates the architectural friction',
      normalized: 'this exacerbates the architectural friction',
      kind: 'phrase',
      translation: '这会加剧架构层面的摩擦。',
      explanation: 'Here, "exacerbates" means the situation makes the existing architectural friction worse.',
      examples: expect.arrayContaining(['This exacerbates the architectural friction.']),
      collocations: expect.arrayContaining(['architectural friction']),
    });
    expect(result.ipa).toContainEqual({ word: 'exacerbate', ipa: '/ɪɡˈzæsərbeɪt/' });
    expect(result.ipa).toContainEqual({ word: 'friction', ipa: '/ˈfrɪkʃn/' });
  });

  it('returns an immediate local result for corrective prompt guidance phrases', () => {
    const result = buildLocalTranslationResult('tell the model what to do differently', []);

    expect(result).toMatchObject({
      original: 'tell the model what to do differently',
      normalized: 'tell the model what to do differently',
      kind: 'phrase',
      translation: '告诉模型应该做出哪些不同的处理。',
      explanation:
        'Use this when you want to give corrective instructions after the model produced an unsatisfactory result.',
      examples: expect.arrayContaining(['Tell the model what to do differently.']),
      collocations: expect.arrayContaining(['give corrective instructions']),
    });
  });

  it('lets supplied glossary data override built-in vocabulary', () => {
    const result = buildLocalTranslationResult('freshness', [
      {
        term: 'freshness',
        ipa: '/custom/',
        meaning: 'custom meaning',
        tags: ['custom'],
        allowTerm: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(result.translation).toBe('custom meaning');
    expect(result.pronunciation).toBe('/custom/');
    expect(result.explanation).toBe('Local glossary entry for "freshness".');
  });

  it('does not consult a conflicting glossary file on disk', () => {
    const home = mkdtempSync(join(tmpdir(), 'english-pilot-translation-result-'));
    const previousHome = process.env.ENGLISH_PILOT_HOME;
    writeFileSync(
      join(home, 'glossary.json'),
      JSON.stringify([
        {
          term: 'vectorize',
          ipa: '/disk-ipa/',
          meaning: 'disk meaning',
          tags: ['disk'],
          allowTerm: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );
    process.env.ENGLISH_PILOT_HOME = home;

    try {
      const result = buildLocalTranslationResult('vectorize', [
        {
          term: 'vectorize',
          ipa: '/supplied-ipa/',
          meaning: 'supplied meaning',
          tags: ['supplied'],
          allowTerm: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);

      expect(result.translation).toBe('supplied meaning');
      expect(result.pronunciation).toBe('/supplied-ipa/');
      expect(result.ipa).toEqual([{ word: 'vectorize', ipa: '/supplied-ipa/' }]);
    } finally {
      if (previousHome === undefined) delete process.env.ENGLISH_PILOT_HOME;
      else process.env.ENGLISH_PILOT_HOME = previousHome;
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('does not invoke external translation while building a local result', () => {
    const previousBackend = process.env.ENGLISH_PILOT_REWRITE_BACKEND;
    const previousPython = process.env.ARGOS_TRANSLATE_PYTHON;
    process.env.ENGLISH_PILOT_REWRITE_BACKEND = 'argos';
    process.env.ARGOS_TRANSLATE_PYTHON = '/usr/bin/true';

    try {
      buildLocalTranslationResult('unremarkable', []);

      expect(spawnSync).not.toHaveBeenCalled();
    } finally {
      if (previousBackend === undefined) delete process.env.ENGLISH_PILOT_REWRITE_BACKEND;
      else process.env.ENGLISH_PILOT_REWRITE_BACKEND = previousBackend;
      if (previousPython === undefined) delete process.env.ARGOS_TRANSLATE_PYTHON;
      else process.env.ARGOS_TRANSLATE_PYTHON = previousPython;
    }
  });

  it('classifies a multiword selection as a phrase', () => {
    const result = buildLocalTranslationResult('make the failure path explicit', []);

    expect(result.kind).toBe('phrase');
    expect(result.original).toBe('make the failure path explicit');
    expect(result.explanation).toContain('EnglishPilot');
  });

  it('preserves deterministic git workflow rewrites in the local lesson', () => {
    const result = buildLocalTranslationResult('提交推送', []);

    expect(result.lesson.suggested).toBe('Commit and push the changes.');
  });

  it('preserves deterministic weather rewrites in the local lesson', () => {
    const result = buildLocalTranslationResult('what is the weather about 广州', []);

    expect(result.lesson.suggested).toBe("What's the weather like in Guangzhou?");
  });

  it('classifies terminal prose with sentence punctuation as a sentence', () => {
    const result = buildLocalTranslationResult('The command failed to start.', []);

    expect(result.kind).toBe('sentence');
    expect(result.examples).toEqual([]);
    expect(result.collocations).toEqual([]);
  });

  it('does not mark an unremarkable word as worth recording', () => {
    const result = buildLocalTranslationResult('hello', []);

    expect(result.lesson.worthRecording).toBe(false);
  });

  it.each(['!!!', '---', '#', ';;;', '…'])('rejects punctuation-only input %j', (text) => {
    expect(() => buildLocalTranslationResult(text, [])).toThrow('Selected text must not be empty.');
  });
});
