import { normalizeLearningText, type LearningItem, type LearningItemDraft } from './learning-card.js';

const GENERIC_REWRITE = 'Please rewrite this mainly in English while preserving the original intent.';
export const REVIEW_TEXT_MAX_LENGTH = 220;
export const STALE_NEVER_REVIEWED_DAYS = 60;

export interface LearningItemQualityAssessment {
  accepted: boolean;
  reasons: string[];
}

export type RetentionDecision = 'keep' | 'low-quality' | 'stale-never-reviewed';

export function assessLearningItemQuality(
  item: Pick<LearningItemDraft, 'original' | 'suggested' | 'tags'>,
): LearningItemQualityAssessment {
  const original = normalizeWhitespace(item.original);
  const suggested = normalizeWhitespace(item.suggested);
  const reasons: string[] = [];

  if (!original) reasons.push('empty original');
  if (!suggested) reasons.push('empty suggestion');
  const intentionalVocabularyCapture = item.tags?.includes('ghostty-lookup') === true;
  if (
    original &&
    suggested &&
    normalizeLearningText(original) === normalizeLearningText(suggested) &&
    !intentionalVocabularyCapture
  ) {
    reasons.push('unchanged rewrite');
  }
  if (suggested === GENERIC_REWRITE) reasons.push('generic rewrite fallback');
  if (isTrivial(original, suggested)) reasons.push('trivial content');
  if (original.length > REVIEW_TEXT_MAX_LENGTH || suggested.length > REVIEW_TEXT_MAX_LENGTH) {
    reasons.push('content exceeds review length');
  }
  if (item.original.split('\n').filter((line) => line.trim()).length > 4) reasons.push('multi-section prompt');
  if (looksLikeTaskInstruction(item.original)) reasons.push('task/review instruction prompt');

  return { accepted: reasons.length === 0, reasons };
}

export function classifyRetention(item: LearningItem, date: string): RetentionDecision {
  if (!assessLearningItemQuality(item).accepted) return 'low-quality';
  if (item.reviewCount > 0 || item.lastReviewedAt) return 'keep';
  if (item.nextReviewAt > date) return 'keep';

  const createdDay = Date.parse(`${item.createdAt.slice(0, 10)}T00:00:00.000Z`);
  const reviewDay = Date.parse(`${date}T00:00:00.000Z`);
  const ageDays = Math.floor((reviewDay - createdDay) / 86_400_000);
  return ageDays >= STALE_NEVER_REVIEWED_DAYS ? 'stale-never-reviewed' : 'keep';
}

function isTrivial(original: string, suggested: string): boolean {
  const meaningful = `${original} ${suggested}`.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const words = meaningful.split(/\s+/).filter(Boolean);
  return words.length <= 2 && /^(?:hello|hi|hey|thanks?|thank you|ok|okay)[.!\s]*$/i.test(original);
}

function looksLikeTaskInstruction(text: string): boolean {
  return (
    /(?:Spec to check|Commit to review|Task \d+|Do not edit files|Report DONE|APPROVED|CHANGES_REQUESTED)/i.test(
      text,
    ) && /(?:\/Users\/|content\/|docs\/|tests\/|npm run|pnpm run|git commit|file paths?)/i.test(text)
  );
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
