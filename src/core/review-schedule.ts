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
  const dates = upcomingDateKeys(date, days);
  return dates
    .map((dateKey) => {
      const dueItems = items.filter((item) => item.nextReviewAt === dateKey).sort(compareReviewItems);
      return {
        date: dateKey,
        count: dueItems.length,
        items: dueItems,
      };
    })
    .filter((group) => group.count > 0);
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function upcomingDateKeys(startDate: string, days: number): string[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  return Array.from({ length: Math.max(1, days) }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function compareReviewItems(left: ReviewScheduleItem, right: ReviewScheduleItem): number {
  return left.nextReviewAt.localeCompare(right.nextReviewAt);
}
