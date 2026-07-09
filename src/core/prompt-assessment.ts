import { analyzeText } from './analyze.js';
import { suggestLearningItem, suggestRewrite } from './coach.js';
import { extractLesson, type ExtractedLesson } from './lesson.js';
import type { AnalysisResult, EnglishPilotConfig } from './types.js';

export interface PromptEventForCoaching {
  createdAt: string;
  coachingShown?: boolean;
}

export interface PromptAssessment {
  analysis: AnalysisResult;
  rewrite?: string;
  lesson: ExtractedLesson;
  shouldRecordLearningPrompt: boolean;
  coachingNote?: string;
}

export function buildPromptAssessment(input: {
  text: string;
  config: EnglishPilotConfig;
  allowedTerms?: string[];
  promptEvents?: PromptEventForCoaching[];
}): PromptAssessment {
  const analysis = analyzeText(input.text, input.config, input.allowedTerms ?? []);
  const rewrite =
    analysis.decision === 'BLOCK' && input.config.blockWithRewrite ? suggestRewrite(input.text) : undefined;
  const lesson = extractLesson(input.text);
  const coachingNote =
    input.promptEvents !== undefined
      ? buildCoachingNote({
          text: input.text,
          analysis,
          config: input.config,
          promptEvents: input.promptEvents,
        })
      : undefined;

  return {
    analysis,
    ...(rewrite ? { rewrite } : {}),
    lesson,
    shouldRecordLearningPrompt: analysis.nonEnglishCount > 0 && isAutoRecordableLearningPrompt(analysis),
    ...(coachingNote ? { coachingNote } : {}),
  };
}

export function isAutoRecordableLearningPrompt(analysis: AnalysisResult): boolean {
  const normalized = analysis.sanitizedText.trim().replace(/\s+/g, ' ');
  if (!normalized) return false;
  if (normalized.length > 180) return false;
  if ((normalized.match(/\n/g)?.length ?? 0) > 2) return false;
  if ((normalized.match(/[。！？.!?]/g)?.length ?? 0) > 2) return false;
  return true;
}

function buildCoachingNote(input: {
  text: string;
  analysis: AnalysisResult;
  config: EnglishPilotConfig;
  promptEvents: PromptEventForCoaching[];
}): string | undefined {
  if (input.analysis.decision !== 'ALLOW_WITH_COACHING') return undefined;
  if (!isAutoRecordableLearningPrompt(input.analysis)) return undefined;
  if (input.config.coachingIntensity === 'low') return undefined;
  const forceCoaching = input.config.coachingIntensity === 'force';
  if (!forceCoaching && isInCoachingCooldown(input.promptEvents, input.config.coachingCooldownMinutes))
    return undefined;
  if (!forceCoaching && hasReachedDailyCoachingCap(input.promptEvents, input.config.maxInlineCoachingPerDay)) {
    return undefined;
  }
  return formatTeachingNote(input.text, suggestLearningItem(input.text));
}

function formatTeachingNote(text: string, suggestion: ReturnType<typeof suggestLearningItem>): string {
  const ipa = suggestion.ipa
    .slice(0, 3)
    .map((entry) => `${entry.word} ${entry.ipa}`)
    .join('; ');
  return [
    `English note: "${text}" -> "${suggestion.suggested}"`,
    `Why: ${explainRewrite(text, suggestion.suggested)}`,
    ...(ipa ? [`IPA: ${ipa}`] : []),
  ].join('\n');
}

function explainRewrite(original: string, suggested: string): string {
  if (/\bweather\s+about\b/i.test(original) && /\bweather like in\b/i.test(suggested)) {
    return 'Use "What is the weather like in + place?" when asking about local weather.';
  }
  if (/[\u3400-\u9fff]/.test(original)) {
    return 'Keep the main request in English and leave only names or hard-to-translate terms in Chinese.';
  }
  return 'Prefer a complete natural phrase over word-by-word translation.';
}

function isInCoachingCooldown(promptEvents: PromptEventForCoaching[], cooldownMinutes: number): boolean {
  if (cooldownMinutes <= 0) return false;
  const cutoff = Date.now() - cooldownMinutes * 60 * 1000;
  return promptEvents.some((event) => {
    if (!event.coachingShown) return false;
    return new Date(event.createdAt).getTime() >= cutoff;
  });
}

function hasReachedDailyCoachingCap(promptEvents: PromptEventForCoaching[], maxInlineCoachingPerDay: number): boolean {
  if (maxInlineCoachingPerDay <= 0) return true;
  const today = new Date().toISOString().slice(0, 10);
  const coachingCount = promptEvents.filter((event) => {
    return event.coachingShown && event.createdAt.slice(0, 10) === today;
  }).length;
  return coachingCount >= maxInlineCoachingPerDay;
}
