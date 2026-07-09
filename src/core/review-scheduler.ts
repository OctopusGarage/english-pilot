export type ReviewOutcome = 'again' | 'hard' | 'easy';

export interface ReviewSchedulingState {
  ease: number;
  reviewCount: number;
  lapseCount: number;
  intervalDays: number;
}

const MIN_EASE = 1.3;

export function applySpacedRepetitionOutcome(
  state: ReviewSchedulingState,
  outcome: ReviewOutcome,
): ReviewSchedulingState {
  const normalized = normalizeReviewSchedulingState(state);
  const reviewCount = normalized.reviewCount + 1;

  if (outcome === 'again') {
    return {
      ease: clampEase(normalized.ease - 0.3),
      reviewCount,
      lapseCount: normalized.lapseCount + 1,
      intervalDays: 0,
    };
  }

  if (outcome === 'hard') {
    return {
      ease: clampEase(normalized.ease - 0.15),
      reviewCount,
      lapseCount: normalized.lapseCount,
      intervalDays: normalized.reviewCount === 0 ? 1 : Math.max(1, Math.round(normalized.intervalDays * 1.2)),
    };
  }

  const ease = clampEase(normalized.ease + 0.15);
  return {
    ease,
    reviewCount,
    lapseCount: normalized.lapseCount,
    intervalDays:
      normalized.reviewCount === 0
        ? 4
        : Math.max(normalized.intervalDays + 1, Math.round(normalized.intervalDays * ease)),
  };
}

export function normalizeReviewSchedulingState(state: Partial<ReviewSchedulingState>): ReviewSchedulingState {
  return {
    ease: clampEase(numberOrDefault(state.ease, 2.5)),
    reviewCount: Math.max(0, Math.floor(numberOrDefault(state.reviewCount, 0))),
    lapseCount: Math.max(0, Math.floor(numberOrDefault(state.lapseCount, 0))),
    intervalDays: Math.max(0, Math.floor(numberOrDefault(state.intervalDays, 1))),
  };
}

function clampEase(ease: number): number {
  return Number(Math.max(MIN_EASE, ease).toFixed(2));
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
