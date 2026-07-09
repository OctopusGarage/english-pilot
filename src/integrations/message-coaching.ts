import { analyzeText } from '../core/analyze.js';
import { suggestRewrite } from '../core/coach.js';
import { loadConfig } from '../core/config.js';
import { extractLesson, type ExtractedLesson } from '../core/lesson.js';
import type { LearningItemDraft } from '../core/learning-card.js';
import type { AnalysisResult } from '../core/types.js';
import type { IntegrationTarget } from './targets.js';

export interface IntegrationMessageCoachingPayload {
  target: IntegrationTarget;
  delivery: {
    supported: boolean;
    mode: 'channel' | 'payload-only';
  };
  message: {
    text: string;
    analysis: AnalysisResult;
    rewrite?: string;
    shouldRecord: boolean;
    lesson?: ExtractedLesson;
  };
}

export function buildIntegrationMessageCoachingPayload(
  target: IntegrationTarget,
  text: string,
  allowedTerms: string[] = [],
): IntegrationMessageCoachingPayload {
  const analysis = analyzeText(text, loadConfig(), allowedTerms);
  const lesson = extractLesson(text);
  const shouldRecord = lesson.worthRecording;
  return {
    target,
    delivery: {
      supported: target.status === 'supported',
      mode: target.status === 'supported' ? 'channel' : 'payload-only',
    },
    message: {
      text,
      analysis,
      ...(analysis.decision === 'BLOCK' ? { rewrite: suggestRewrite(text) } : {}),
      shouldRecord,
      ...(shouldRecord ? { lesson } : {}),
    },
  };
}

export function formatIntegrationMessageCoaching(payload: IntegrationMessageCoachingPayload): string {
  const lines = [
    `Integration message coaching: ${payload.target.label}`,
    `Delivery: ${payload.delivery.supported ? payload.delivery.mode : 'payload-only'}`,
    `Decision: ${payload.message.analysis.decision}`,
  ];
  if (payload.message.rewrite) {
    lines.push(`Rewrite: ${payload.message.rewrite}`);
  }
  if (payload.message.lesson) {
    lines.push(`Learning item: ${payload.message.shouldRecord ? 'recommended' : 'not recommended'}`);
    lines.push(`Suggested: ${payload.message.lesson.suggested}`);
  } else {
    lines.push('Learning item: not recommended');
  }
  lines.push('');
  return lines.join('\n');
}

export function buildIntegrationMessageLearningItem(
  payload: IntegrationMessageCoachingPayload,
): LearningItemDraft | undefined {
  const lesson = payload.message.lesson;
  if (!lesson?.worthRecording) return undefined;
  return {
    original: lesson.original,
    suggested: lesson.suggested,
    scene: lesson.scene,
    pattern: lesson.pattern,
    ipa: lesson.ipa,
    tags: [...new Set([...lesson.tags, 'integration-message', payload.target.id])],
  };
}
