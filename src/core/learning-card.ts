import { applySpacedRepetitionOutcome, type ReviewOutcome } from './review-scheduler.js';

export interface LearningItemDraft {
  original: string;
  suggested: string;
  scene?: string;
  tags?: string[];
  pattern?: string;
  ipa?: Array<{ word: string; ipa: string }>;
}

export interface LearningItem extends LearningItemDraft {
  id: string;
  createdAt: string;
  nextReviewAt: string;
  ease: number;
  reviewCount: number;
  lapseCount: number;
  intervalDays: number;
  lastReviewedAt?: string;
}

export type LearningItemUpdate = Partial<
  Pick<LearningItemDraft, 'original' | 'suggested' | 'scene' | 'tags' | 'pattern' | 'ipa'>
>;

export function buildInitialLearningItem(input: { draft: LearningItemDraft; id: string; now?: Date }): LearningItem {
  const createdAt = input.now ?? new Date();
  const reviewAt = new Date(createdAt);
  reviewAt.setDate(reviewAt.getDate() + 1);
  return {
    id: input.id,
    createdAt: createdAt.toISOString(),
    nextReviewAt: reviewAt.toISOString().slice(0, 10),
    ease: 2.5,
    reviewCount: 0,
    lapseCount: 0,
    intervalDays: 1,
    ...input.draft,
  };
}

export function findDuplicateLearningItem(items: LearningItem[], draft: LearningItemDraft): LearningItem | undefined {
  const original = normalizeLearningText(draft.original);
  const suggested = normalizeLearningText(draft.suggested);
  return items.find((candidate) => {
    return (
      normalizeLearningText(candidate.original) === original || normalizeLearningText(candidate.suggested) === suggested
    );
  });
}

export function applyLearningItemReviewOutcome(item: LearningItem, outcome: ReviewOutcome): LearningItem {
  const reviewedAt = new Date();
  const nextReviewAt = new Date(reviewedAt);
  const scheduling = applySpacedRepetitionOutcome(item, outcome);
  nextReviewAt.setDate(nextReviewAt.getDate() + scheduling.intervalDays);
  return {
    ...item,
    ...scheduling,
    lastReviewedAt: reviewedAt.toISOString(),
    nextReviewAt: nextReviewAt.toISOString().slice(0, 10),
  };
}

export function normalizeLearningText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}
