import { describe, expect, it } from 'vitest';
import {
  buildDueReviewItems,
  buildUpcomingReviewSchedule,
  isDateKey,
  parsePositiveInteger,
} from '../../src/core/review-schedule.js';

describe('review schedule helpers', () => {
  it('returns overdue and due-today items sorted by review date', () => {
    const items = [
      item('later', '2026-09-20'),
      item('today-b', '2026-09-19'),
      item('overdue', '2026-09-17'),
      item('today-a', '2026-09-19'),
    ];

    expect(buildDueReviewItems(items, '2026-09-19').map((due) => due.id)).toEqual(['overdue', 'today-b', 'today-a']);
  });

  it('groups only upcoming exact review dates inside the requested window', () => {
    const groups = buildUpcomingReviewSchedule(
      [
        item('overdue', '2026-09-18'),
        item('today', '2026-09-19'),
        item('tomorrow-b', '2026-09-20'),
        item('outside-window', '2026-09-22'),
        item('tomorrow-a', '2026-09-20'),
      ],
      '2026-09-19',
      2,
    );

    expect(groups).toEqual([
      {
        date: '2026-09-19',
        count: 1,
        items: [item('today', '2026-09-19')],
      },
      {
        date: '2026-09-20',
        count: 2,
        items: [item('tomorrow-b', '2026-09-20'), item('tomorrow-a', '2026-09-20')],
      },
    ]);
  });

  it('keeps the upcoming schedule bounded to at least one day', () => {
    const groups = buildUpcomingReviewSchedule(
      [item('today', '2026-09-19'), item('tomorrow', '2026-09-20')],
      '2026-09-19',
      0,
    );

    expect(groups).toEqual([
      {
        date: '2026-09-19',
        count: 1,
        items: [item('today', '2026-09-19')],
      },
    ]);
  });

  it('validates date keys and falls back for invalid positive integer inputs', () => {
    expect(isDateKey('2026-09-19')).toBe(true);
    expect(isDateKey('2026-9-19')).toBe(false);
    expect(parsePositiveInteger('5', 7)).toBe(5);
    expect(parsePositiveInteger('0', 7)).toBe(7);
    expect(parsePositiveInteger('1.5', 7)).toBe(7);
    expect(parsePositiveInteger(undefined, 7)).toBe(7);
  });
});

function item(id: string, nextReviewAt: string): { id: string; nextReviewAt: string } {
  return { id, nextReviewAt };
}
