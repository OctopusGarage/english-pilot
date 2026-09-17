import { describe, expect, it } from 'vitest';
import { assessLearningItemQuality, classifyRetention } from '../../src/core/review-quality.js';
import type { LearningItem, LearningItemDraft } from '../../src/core/learning-card.js';

describe('learning item quality', () => {
  const valid: LearningItemDraft = {
    original: 'why content not update',
    suggested: 'Why did the content not update?',
  };

  it('accepts a concise, meaningful rewrite', () => {
    expect(assessLearningItemQuality(valid)).toEqual({ accepted: true, reasons: [] });
  });

  it.each([
    [{ ...valid, original: '' }, 'empty original'],
    [{ ...valid, suggested: '' }, 'empty suggestion'],
    [{ ...valid, suggested: valid.original }, 'unchanged rewrite'],
    [
      { ...valid, suggested: 'Please rewrite this mainly in English while preserving the original intent.' },
      'generic rewrite fallback',
    ],
    [{ original: 'hello', suggested: 'Hello.' }, 'trivial content'],
    [{ ...valid, original: 'x'.repeat(221) }, 'content exceeds review length'],
    [
      {
        ...valid,
        original: 'Task 1: inspect /Users/example/project and run pnpm test. Report DONE.',
      },
      'task/review instruction prompt',
    ],
  ])('rejects low-quality content: %s', (draft, reason) => {
    expect(assessLearningItemQuality(draft)).toMatchObject({ accepted: false, reasons: [reason] });
  });
});

describe('learning item retention', () => {
  it('deletes stale never-reviewed items but protects reviewed items from age cleanup', () => {
    const stale = item({ createdAt: '2026-07-01T00:00:00.000Z', nextReviewAt: '2026-07-02' });

    expect(classifyRetention(stale, '2026-09-17')).toBe('stale-never-reviewed');
    expect(classifyRetention({ ...stale, reviewCount: 1 }, '2026-09-17')).toBe('keep');
    expect(classifyRetention({ ...stale, lastReviewedAt: '2026-07-10T00:00:00.000Z' }, '2026-09-17')).toBe('keep');
  });

  it('removes low-quality content even when it was reviewed', () => {
    expect(classifyRetention(item({ original: 'hello', suggested: 'Hello.', reviewCount: 3 }), '2026-09-17')).toBe(
      'low-quality',
    );
  });
});

function item(overrides: Partial<LearningItem> = {}): LearningItem {
  return {
    id: 'learn-1',
    createdAt: '2026-09-01T00:00:00.000Z',
    nextReviewAt: '2026-09-02',
    ease: 2.5,
    reviewCount: 0,
    lapseCount: 0,
    intervalDays: 1,
    original: 'why content not update',
    suggested: 'Why did the content not update?',
    ...overrides,
  };
}
