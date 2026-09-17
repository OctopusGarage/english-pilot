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

  it('cleans storage before loading and reports cleanup and cohort selection', async () => {
    const events: string[] = [];
    const result = await deliverFeishuDailyReview({
      date: '2026-09-17',
      cleanupItems: () => {
        events.push('cleanup');
        return { examined: 20, lowQualityDeleted: 2, staleDeleted: 3, protected: 1, remaining: 15 };
      },
      loadItems: () => {
        events.push('load');
        return [item({ id: 'recent', createdAt: '2026-09-16T00:00:00.000Z', nextReviewAt: '2026-09-17' })];
      },
      notify: async () => {
        events.push('notify');
        return { ok: true };
      },
    });

    expect(events).toEqual(['cleanup', 'load', 'notify']);
    expect(result).toMatchObject({
      delivered: true,
      cleanup: { lowQualityDeleted: 2, staleDeleted: 3, remaining: 15 },
      selection: { eligibleCount: 1, counts: { recent: 1, reviewed: 0, backlog: 0 } },
    });
  });

  it('fails before network delivery when cleanup fails', async () => {
    let notifications = 0;
    const result = await deliverFeishuDailyReview({
      date: '2026-09-17',
      cleanupItems: () => {
        throw new Error('database locked');
      },
      loadItems: () => [],
      notify: async () => {
        notifications += 1;
        return { ok: true };
      },
    });

    expect(notifications).toBe(0);
    expect(result).toMatchObject({
      delivered: false,
      network: false,
      messagesSent: 0,
      messageCount: 0,
      blocker: 'Daily review cleanup failed: database locked',
    });
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
