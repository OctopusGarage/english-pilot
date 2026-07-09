import { normalizeLearningText, type LearningItem } from './learning-card.js';

const GENERIC_REWRITE = 'Please rewrite this mainly in English while preserving the original intent.';

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
      const reasons = noisyReviewReasons(item);
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

function noisyReviewReasons(item: LearningItem): string[] {
  const reasons: string[] = [];
  const original = normalizeWhitespace(item.original);
  const suggested = normalizeWhitespace(item.suggested);
  const nonEmptyLines = item.original.split('\n').filter((line) => line.trim().length > 0).length;

  if (suggested === GENERIC_REWRITE) {
    reasons.push('generic rewrite fallback');
  }
  if (original.length > 360) {
    reasons.push('long business prompt');
  }
  if (nonEmptyLines > 4) {
    reasons.push('multi-section prompt');
  }
  if (looksLikeTaskInstruction(item.original)) {
    reasons.push('task/review instruction prompt');
  }

  return reasons;
}

function looksLikeTaskInstruction(text: string): boolean {
  return (
    /(?:Spec to check|Commit to review|Task \d+|Do not edit files|Report DONE|APPROVED|CHANGES_REQUESTED)/i.test(
      text,
    ) && /(?:\/Users\/|content\/|docs\/|tests\/|npm run|git commit|file paths?)/i.test(text)
  );
}

function preview(value: string): string {
  const normalized = normalizeWhitespace(value);
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
