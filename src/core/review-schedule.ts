export interface ReviewScheduleItem {
  nextReviewAt: string;
}

export interface ReviewScheduleGroup<T extends ReviewScheduleItem> {
  date: string;
  count: number;
  items: T[];
}

export function buildDueReviewItems<T extends ReviewScheduleItem>(items: T[], date: string): T[] {
  return items.filter((item) => item.nextReviewAt <= date).sort(compareReviewItems);
}

export function buildUpcomingReviewSchedule<T extends ReviewScheduleItem>(
  items: T[],
  date: string,
  days: number,
): Array<ReviewScheduleGroup<T>> {
  const start = Date.parse(`${date}T00:00:00.000Z`);
  const windowDays = Math.max(1, Math.floor(days));
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (!isDateKey(item.nextReviewAt)) continue;
    const offset = (Date.parse(`${item.nextReviewAt}T00:00:00.000Z`) - start) / 86_400_000;
    if (offset < 0 || offset >= windowDays) continue;
    const group = groups.get(item.nextReviewAt) ?? [];
    group.push(item);
    groups.set(item.nextReviewAt, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dateKey, dueItems]) => ({ date: dateKey, count: dueItems.length, items: dueItems }));
}

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function compareReviewItems(left: ReviewScheduleItem, right: ReviewScheduleItem): number {
  return left.nextReviewAt.localeCompare(right.nextReviewAt);
}
