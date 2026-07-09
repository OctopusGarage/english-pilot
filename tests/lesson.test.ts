import { describe, expect, it } from 'vitest';
import { extractLesson } from '../src/core/lesson.js';

describe('extractLesson', () => {
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
});
