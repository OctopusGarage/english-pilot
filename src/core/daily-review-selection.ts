import type { LearningItem } from './learning-card.js';
import { assessLearningItemQuality } from './review-quality.js';

const DEFAULT_MAX_ITEMS = 12;
const COHORT_TARGET = 4;
const RECENT_WINDOW_DAYS = 14;

export interface DailyReviewSelection {
  items: LearningItem[];
  eligibleCount: number;
  counts: { recent: number; reviewed: number; backlog: number };
}

export function selectDailyReviewItems(input: {
  items: LearningItem[];
  date: string;
  maxItems?: number;
}): DailyReviewSelection {
  const maxItems = Math.max(0, input.maxItems ?? DEFAULT_MAX_ITEMS);
  const recentCutoff = offsetDate(input.date, -(RECENT_WINDOW_DAYS - 1));
  const eligible = input.items.filter(
    (item) => item.nextReviewAt <= input.date && assessLearningItemQuality(item).accepted,
  );
  const reviewed = eligible.filter((item) => item.reviewCount > 0 || item.lastReviewedAt).sort(compareReviewed);
  const neverReviewed = eligible.filter((item) => item.reviewCount === 0 && !item.lastReviewedAt);
  const recent = neverReviewed
    .filter((item) => item.createdAt.slice(0, 10) >= recentCutoff)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
  const backlog = rotate(
    neverReviewed
      .filter((item) => item.createdAt.slice(0, 10) < recentCutoff)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)),
    input.date,
  );

  const selected: LearningItem[] = [];
  const counts = { recent: 0, reviewed: 0, backlog: 0 };
  const queues = { recent: [...recent], reviewed: [...reviewed], backlog: [...backlog] };

  take(queues.recent, 'recent', Math.min(COHORT_TARGET, maxItems), selected, counts, maxItems);
  take(queues.reviewed, 'reviewed', Math.min(COHORT_TARGET, maxItems), selected, counts, maxItems);
  take(queues.backlog, 'backlog', Math.min(COHORT_TARGET, maxItems), selected, counts, maxItems);

  for (const cohort of ['reviewed', 'recent', 'backlog'] as const) {
    take(queues[cohort], cohort, maxItems, selected, counts, maxItems);
  }

  return { items: selected, eligibleCount: eligible.length, counts };
}

function take(
  queue: LearningItem[],
  cohort: keyof DailyReviewSelection['counts'],
  requested: number,
  selected: LearningItem[],
  counts: DailyReviewSelection['counts'],
  maxItems: number,
): void {
  const count = Math.min(requested, queue.length, maxItems - selected.length);
  if (count <= 0) return;
  selected.push(...queue.splice(0, count));
  counts[cohort] += count;
}

function compareReviewed(left: LearningItem, right: LearningItem): number {
  return (
    left.nextReviewAt.localeCompare(right.nextReviewAt) ||
    right.lapseCount - left.lapseCount ||
    left.id.localeCompare(right.id)
  );
}

function rotate(items: LearningItem[], date: string): LearningItem[] {
  if (items.length < 2) return items;
  const day = Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 86_400_000);
  const offset = (day * COHORT_TARGET) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function offsetDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
