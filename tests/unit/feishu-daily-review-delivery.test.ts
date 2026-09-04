import { describe, expect, it } from 'vitest';
import {
  deliverFeishuDailyReview,
  defaultFeishuDailyReviewSession,
} from '../../src/integrations/feishu-daily-review-delivery.js';
import type { LearningItem } from '../../src/storage/repository.js';

describe('deliverFeishuDailyReview', () => {
  it('sends compact review chunks through the tmux-claude-bot Lark notifier', async () => {
    const calls: Array<{ message: string; title: string; session: string }> = [];
    const result = await deliverFeishuDailyReview({
      date: '2026-09-04',
      items: Array.from({ length: 6 }, (_, index) =>
        item({
          id: `learn-${index}`,
          original: `原句 ${index}`,
          suggested: `This is a concise study sentence ${index}.`,
        }),
      ),
      session: 'tmux_proj_english-pilot',
      maxItems: 6,
      maxCharsPerMessage: 260,
      maxMessages: 3,
      notify: async (message, request) => {
        calls.push({ message, title: request.title, session: request.session });
        return { ok: true };
      },
    });

    expect(result).toMatchObject({
      delivered: true,
      target: 'feishu',
      network: true,
      messagesSent: calls.length,
      session: 'tmux_proj_english-pilot',
    });
    expect(calls.length).toBeGreaterThan(1);
    expect(calls[0].title).toBe('EnglishPilot Daily Review');
    expect(calls[0].session).toBe('tmux_proj_english-pilot');
    expect(calls[0].message).toContain('Part 1/');
    expect(calls[0].message).not.toContain('Review prompt');
    expect(calls[0].message).not.toContain('Next review');
  });

  it('reports partial delivery when one chunk fails', async () => {
    const result = await deliverFeishuDailyReview({
      date: '2026-09-04',
      items: Array.from({ length: 6 }, (_, index) =>
        item({
          id: `learn-${index}`,
          original: `原句 ${index}`,
          suggested: `This is a concise study sentence ${index}.`,
        }),
      ),
      maxItems: 6,
      maxCharsPerMessage: 260,
      maxMessages: 3,
      notify: async (_message, request) => ({ ok: request.part !== 2, error: 'send failed' }),
    });

    expect(result.delivered).toBe(false);
    expect(result.blocker).toBe('Feishu daily review delivery failed for one or more message chunks.');
    expect(result.errors).toEqual(['part 2: send failed']);
  });
});

describe('defaultFeishuDailyReviewSession', () => {
  it('derives the tmux project session from the checkout path', () => {
    expect(defaultFeishuDailyReviewSession('/repo/english-pilot')).toBe('tmux_proj_-repo-english-pilot');
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
