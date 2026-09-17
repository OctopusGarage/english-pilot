import { normalizeLearningText, type LearningItem } from './learning-card.js';
import { assessLearningItemQuality } from './review-quality.js';

export interface ReviewCleanupCandidate {
  id: string;
  originalPreview: string;
  suggestedPreview: string;
  reasons: string[];
}

export interface ReviewCleanupPlan {
  candidates: ReviewCleanupCandidate[];
  candidateCount: number;
}

export function buildReviewCleanupPlan(items: LearningItem[]): ReviewCleanupPlan {
  const seenOriginal = new Set<string>();
  const seenSuggested = new Set<string>();
  const candidates = items
    .map((item) => {
      const reasons = assessLearningItemQuality(item).reasons;
      const originalKey = normalizeLearningText(item.original);
      const suggestedKey = normalizeLearningText(item.suggested);
      if (seenOriginal.has(originalKey) || seenSuggested.has(suggestedKey)) {
        reasons.push('duplicate learning item');
      }
      seenOriginal.add(originalKey);
      seenSuggested.add(suggestedKey);
      if (reasons.length === 0) return undefined;
      return {
        id: item.id,
        originalPreview: preview(item.original),
        suggestedPreview: preview(item.suggested),
        reasons,
      };
    })
    .filter((candidate): candidate is ReviewCleanupCandidate => candidate !== undefined);

  return {
    candidates,
    candidateCount: candidates.length,
  };
}

function preview(value: string): string {
  const normalized = normalizeWhitespace(value);
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
