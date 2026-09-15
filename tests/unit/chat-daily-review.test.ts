import { describe, expect, it } from 'vitest';
import { buildChatDailyReviewMessages } from '../../src/integrations/chat-daily-review.js';
import type { LearningItem } from '../../src/storage/repository.js';

describe('buildChatDailyReviewMessages', () => {
  it('formats due review items for chat without redundant markdown fields', () => {
    const messages = buildChatDailyReviewMessages({
      date: '2026-09-04',
      items: [
        item({
          id: 'learn-1',
          original: '我想创建一个 new project，用来辅助英语学习。',
          suggested: 'I want to create a new project to help me learn English.',
          nextReviewAt: '2026-09-04',
          ipa: [{ word: 'project', ipa: '/ˈprɑːdʒekt/' }],
        }),
        item({
          id: 'learn-2',
          original: 'hello',
          suggested: 'hello',
          nextReviewAt: '2026-09-04',
        }),
      ],
      maxItems: 8,
      maxCharsPerMessage: 2_000,
      maxMessages: 3,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('EnglishPilot Daily Review - 2026-09-04');
    expect(messages[0]).toContain('Due: 2 | Selected: 1');
    expect(messages[0]).toContain('1. I want to create a new project to help me learn English.');
    expect(messages[0]).toContain('Original: 我想创建一个 new project，用来辅助英语学习。');
    expect(messages[0]).toContain('IPA: project /ˈprɑːdʒekt/');
    expect(messages[0]).not.toContain('Review prompt');
    expect(messages[0]).not.toContain('ID:');
    expect(messages[0]).not.toContain('Next review');
    expect(messages[0]).not.toContain('IPA: none');
  });

  it('splits compact review text and appends a truncation notice when capped', () => {
    const messages = buildChatDailyReviewMessages({
      date: '2026-09-04',
      items: Array.from({ length: 12 }, (_, index) =>
        item({
          id: `learn-${index}`,
          original: `原句 ${index}`,
          suggested: `This is a concise study sentence number ${index} for the daily review message.`,
          nextReviewAt: '2026-09-04',
        }),
      ),
      maxItems: 12,
      maxCharsPerMessage: 260,
      maxMessages: 2,
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('Part 1/2');
    expect(messages[1]).toContain('Part 2/2');
    expect(messages[1]).toContain('[truncated; see the linked report/logs for full details]');
    expect(messages.every((message) => message.length <= 260)).toBe(true);
  });
});

function item(overrides: Partial<LearningItem>): LearningItem {
  return {
    id: 'learn',
    original: '原句',
    suggested: 'Suggested sentence.',
    scene: 'AI workflow discussion',
    tags: ['workplace-english'],
    pattern: '',
    ipa: [],
    createdAt: '2026-09-04T00:00:00.000Z',
    nextReviewAt: '2026-09-04',
    intervalDays: 1,
    ease: 2.5,
    reviewCount: 0,
    lapseCount: 0,
    ...overrides,
  };
}
