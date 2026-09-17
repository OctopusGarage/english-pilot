import { describe, expect, it } from 'vitest';
import { selectDailyReviewItems } from '../../src/core/daily-review-selection.js';
import type { LearningItem } from '../../src/core/learning-card.js';

describe('daily review selection', () => {
  it('balances recent, reviewed, and backlog cohorts', () => {
    const items = [
      ...range(6, (index) => item(`recent-${index}`, { createdAt: `2026-09-${10 + index}T00:00:00.000Z` })),
      ...range(6, (index) =>
        item(`reviewed-${index}`, { createdAt: '2026-08-01T00:00:00.000Z', reviewCount: 1, lapseCount: index }),
      ),
      ...range(6, (index) => item(`backlog-${index}`, { createdAt: `2026-08-0${index + 1}T00:00:00.000Z` })),
      item('future', { nextReviewAt: '2026-09-18' }),
      item('noisy', { original: 'hello', suggested: 'Hello.' }),
    ];

    const result = selectDailyReviewItems({ items, date: '2026-09-17', maxItems: 12 });

    expect(result.counts).toEqual({ recent: 4, reviewed: 4, backlog: 4 });
    expect(result.eligibleCount).toBe(18);
    expect(new Set(result.items.map(({ id }) => id)).size).toBe(12);
    expect(result.items.map(({ id }) => id)).not.toContain('future');
    expect(result.items.map(({ id }) => id)).not.toContain('noisy');
  });

  it('spills unused cohort slots into other eligible cohorts', () => {
    const items = [
      item('recent'),
      ...range(7, (index) => item(`reviewed-${index}`, { reviewCount: 1, createdAt: '2026-08-01T00:00:00.000Z' })),
      ...range(8, (index) => item(`backlog-${index}`, { createdAt: `2026-08-${index + 1}T00:00:00.000Z` })),
    ];

    const result = selectDailyReviewItems({ items, date: '2026-09-17', maxItems: 12 });

    expect(result.items).toHaveLength(12);
    expect(result.counts).toEqual({ recent: 1, reviewed: 7, backlog: 4 });
  });

  it('is reproducible for one date and rotates backlog on the next date', () => {
    const items = range(10, (index) =>
      item(`backlog-${index}`, { createdAt: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z` }),
    );

    const first = selectDailyReviewItems({ items, date: '2026-09-17', maxItems: 4 });
    const retry = selectDailyReviewItems({ items, date: '2026-09-17', maxItems: 4 });
    const next = selectDailyReviewItems({ items, date: '2026-09-18', maxItems: 4 });

    expect(retry.items.map(({ id }) => id)).toEqual(first.items.map(({ id }) => id));
    expect(next.items.map(({ id }) => id)).not.toEqual(first.items.map(({ id }) => id));
  });
});

function range<T>(count: number, build: (index: number) => T): T[] {
  return Array.from({ length: count }, (_, index) => build(index));
}

function item(id: string, overrides: Partial<LearningItem> = {}): LearningItem {
  return {
    id,
    createdAt: '2026-09-10T00:00:00.000Z',
    nextReviewAt: '2026-09-17',
    ease: 2.5,
    reviewCount: 0,
    lapseCount: 0,
    intervalDays: 1,
    original: `original ${id}`,
    suggested: `A useful English expression for ${id}.`,
    ...overrides,
  };
}
