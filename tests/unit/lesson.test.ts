import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractLesson } from '../../src/core/lesson.js';

describe('extractLesson', () => {
  let previousBackend: string | undefined;
  let previousPython: string | undefined;
  let home: string;

  beforeEach(() => {
    previousBackend = process.env.ENGLISH_PILOT_REWRITE_BACKEND;
    previousPython = process.env.ARGOS_TRANSLATE_PYTHON;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-lesson-'));
  });

  afterEach(() => {
    restoreEnv('ENGLISH_PILOT_REWRITE_BACKEND', previousBackend);
    restoreEnv('ARGOS_TRANSLATE_PYTHON', previousPython);
    rmSync(home, { recursive: true, force: true });
  });

  it('extracts reusable phrases, IPA, and a retrieval prompt from meaningful mixed work text', () => {
    const lesson = extractLesson('这个 threshold 后续支持调整强度, and the workflow should feel sophisticated.');

    expect(lesson).toMatchObject({
      worthRecording: true,
      scene: 'configuration discussion',
      suggested: expect.stringContaining('threshold'),
      pattern: expect.stringContaining('support adjusting'),
      reviewPrompt: expect.stringContaining('How would you say'),
    });
    expect(lesson.keyPhrases).toEqual(expect.arrayContaining([expect.stringContaining('threshold')]));
    expect(lesson.ipa).toEqual(
      expect.arrayContaining([
        { word: 'threshold', ipa: '/ˈθreʃhoʊld/' },
        { word: 'sophisticated', ipa: '/səˈfɪstɪkeɪtɪd/' },
      ]),
    );
  });

  it('does not record trivial greetings as lesson-worthy', () => {
    const lesson = extractLesson('你好');

    expect(lesson.worthRecording).toBe(false);
    expect(lesson.keyPhrases).toEqual([]);
  });

  it('does not record a lesson when no displayable rewrite is available', () => {
    const fakePython = join(home, 'fake-python');
    writeFileSync(fakePython, '#!/bin/sh\ncat >/dev/null\nprintf "I want you to contact English. Down."\n', 'utf8');
    chmodSync(fakePython, 0o755);
    process.env.ENGLISH_PILOT_REWRITE_BACKEND = 'argos';
    process.env.ARGOS_TRANSLATE_PYTHON = fakePython;

    const lesson = extractLesson('I want to 和你对话来练习英语 in this chat.');

    expect(lesson.worthRecording).toBe(false);
    expect(lesson.suggested).not.toContain('Please restate this request');
    expect(lesson.keyPhrases).toEqual([]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
