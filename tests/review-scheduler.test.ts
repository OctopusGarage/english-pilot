import { describe, expect, it } from 'vitest';
import { applySpacedRepetitionOutcome } from '../src/core/review-scheduler.js';

describe('spaced repetition review scheduler', () => {
  it('starts an easy item at a short graduation interval', () => {
    const scheduled = applySpacedRepetitionOutcome(
      {
        ease: 2.5,
        reviewCount: 0,
        lapseCount: 0,
        intervalDays: 1,
      },
      'easy',
    );

    expect(scheduled).toEqual({
      ease: 2.65,
      reviewCount: 1,
      lapseCount: 0,
      intervalDays: 4,
    });
  });

  it('expands later easy intervals from the current ease factor', () => {
    const scheduled = applySpacedRepetitionOutcome(
      {
        ease: 2.65,
        reviewCount: 1,
        lapseCount: 0,
        intervalDays: 4,
      },
      'easy',
    );

    expect(scheduled).toEqual({
      ease: 2.8,
      reviewCount: 2,
      lapseCount: 0,
      intervalDays: 11,
    });
  });

  it('keeps hard reviews close without resetting the card', () => {
    const scheduled = applySpacedRepetitionOutcome(
      {
        ease: 2.5,
        reviewCount: 2,
        lapseCount: 0,
        intervalDays: 10,
      },
      'hard',
    );

    expect(scheduled).toEqual({
      ease: 2.35,
      reviewCount: 3,
      lapseCount: 0,
      intervalDays: 12,
    });
  });

  it('resets lapsed items to a same-day relearning interval', () => {
    const scheduled = applySpacedRepetitionOutcome(
      {
        ease: 1.45,
        reviewCount: 3,
        lapseCount: 1,
        intervalDays: 12,
      },
      'again',
    );

    expect(scheduled).toEqual({
      ease: 1.3,
      reviewCount: 4,
      lapseCount: 2,
      intervalDays: 0,
    });
  });
});
