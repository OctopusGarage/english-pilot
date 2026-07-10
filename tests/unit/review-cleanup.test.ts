import { describe, expect, it } from 'vitest';
import { buildReviewCleanupPlan } from '../../src/core/review-cleanup.js';
import type { LearningItem } from '../../src/storage/repository.js';

describe('review cleanup planning', () => {
  it('keeps the oldest learning item and flags later duplicates', () => {
    const items = [
      item(
        'learn_1',
        '我想创建一个 new project，用来辅助英语学习。',
        'I want to create a new project to help me learn and use English during my normal AI conversations.',
      ),
      item(
        'learn_2',
        '我想创建一个 new project，用来辅助英语学习。',
        'I want to create a new project to help me learn and use English during my normal AI conversations.',
      ),
      item('learn_3', '访问不了：  http://localhost:60806', 'I cannot access http://localhost:60806.'),
    ];

    expect(buildReviewCleanupPlan(items)).toMatchObject({
      candidateCount: 1,
      candidates: [
        {
          id: 'learn_2',
          reasons: ['duplicate learning item'],
        },
      ],
    });
  });
});

function item(id: string, original: string, suggested: string): LearningItem {
  return {
    id,
    createdAt: `2026-07-08T00:00:0${id.slice(-1)}.000Z`,
    nextReviewAt: '2026-07-09',
    ease: 2.5,
    reviewCount: 0,
    lapseCount: 0,
    intervalDays: 1,
    original,
    suggested,
  };
}
