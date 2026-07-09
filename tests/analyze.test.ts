import { describe, expect, it } from 'vitest';
import { analyzeText } from '../src/core/analyze.js';
import { defaultPolicy } from '../src/core/policy.js';

describe('analyzeText', () => {
  it('allows English-only narrative text silently', () => {
    const result = analyzeText('I want to create a new project.', defaultPolicy);

    expect(result.decision).toBe('ALLOW_SILENT');
    expect(result.nonEnglishRatio).toBe(0);
  });

  it('allows mixed text when Chinese stays under the configured ratio', () => {
    const result = analyzeText(
      'I want to create a new project for 英语学习过程中的真实反馈 and review.',
      defaultPolicy,
    );

    expect(result.decision).toBe('ALLOW_WITH_COACHING');
    expect(result.nonEnglishRatio).toBeLessThanOrEqual(defaultPolicy.maxChineseRatio);
  });

  it('allows mixed text silently when Chinese stays under the target ratio', () => {
    const result = analyzeText(
      'Please keep this workflow English-leading, practical, specific, and low-disruption while preserving 中文技术文档结构 for context.',
      defaultPolicy,
    );

    expect(result.nonEnglishCount).toBeGreaterThan(0);
    expect(result.nonEnglishRatio).toBeLessThanOrEqual(defaultPolicy.targetChineseRatio);
    expect(result.decision).toBe('ALLOW_SILENT');
  });

  it('adds coaching when Chinese exceeds the target ratio but stays below the maximum ratio', () => {
    const result = analyzeText(
      'I want to create a new project for 英语学习过程中的真实反馈 and review.',
      defaultPolicy,
    );

    expect(result.nonEnglishRatio).toBeGreaterThan(defaultPolicy.targetChineseRatio);
    expect(result.nonEnglishRatio).toBeLessThanOrEqual(defaultPolicy.maxChineseRatio);
    expect(result.decision).toBe('ALLOW_WITH_COACHING');
  });

  it('blocks mostly Chinese narrative text', () => {
    const result = analyzeText('我想创建一个 new project，用来辅助英语学习。', defaultPolicy);

    expect(result.decision).toBe('BLOCK');
    expect(result.nonEnglishRatio).toBeGreaterThan(defaultPolicy.maxChineseRatio);
  });

  it('blocks short Chinese-only prompts instead of treating them as ignorable fragments', () => {
    const result = analyzeText('你好', defaultPolicy);

    expect(result.decision).toBe('BLOCK');
    expect(result.nonEnglishCount).toBe(2);
    expect(result.nonEnglishRatio).toBe(1);
  });

  it('ignores code blocks, inline code, urls, and tag attributes when counting narrative', () => {
    const result = analyzeText(
      [
        'Please explain this.',
        '```ts',
        'const message = "中文 should not count here";',
        '```',
        'Use `中文变量` from https://example.com/中文.',
        '<channel name="中文">Keep explaining this in English.</channel>',
      ].join('\n'),
      defaultPolicy,
    );

    expect(result.decision).toBe('ALLOW_SILENT');
    expect(result.nonEnglishCount).toBe(0);
  });

  it('blocks prompts that start with Chinese narrative when English-leading is required', () => {
    const result = analyzeText('这个 should be designed carefully.', defaultPolicy);

    expect(result.decision).toBe('BLOCK');
    expect(result.reason).toContain('English-leading');
  });

  it('ignores short CJK fragments embedded in English narrative', () => {
    const result = analyzeText('Please keep 飞书 as the product name.', defaultPolicy);

    expect(result.decision).toBe('ALLOW_SILENT');
    expect(result.nonEnglishCount).toBe(0);
  });

  it('coaches ignored short CJK fragments in force mode without counting them toward blocking', () => {
    const result = analyzeText('what is the weather about 广州', {
      ...defaultPolicy,
      coachingIntensity: 'force',
    });

    expect(result.decision).toBe('ALLOW_WITH_COACHING');
    expect(result.nonEnglishCount).toBe(0);
    expect(result.ignoredNonEnglishFragments).toEqual(['广州']);
    expect(result.coachingSignals).toContain('short-non-English-fragment');
  });

  it('coaches repeated short Chinese fragments instead of treating rough mixed prompts as English-only', () => {
    const result = analyzeText(
      'check all the docs, seem so 啰嗦了， 全面 optimise一下，keep simple and 清晰',
      defaultPolicy,
    );

    expect(result.decision).toBe('ALLOW_WITH_COACHING');
    expect(result.nonEnglishCount).toBeGreaterThan(0);
    expect(result.reason).toContain('coaching target');
  });

  it('ignores markdown links when counting narrative', () => {
    const result = analyzeText('Please read [中文标题](https://example.com/中文) and summarize it.', defaultPolicy);

    expect(result.decision).toBe('ALLOW_SILENT');
    expect(result.nonEnglishCount).toBe(0);
  });
});
