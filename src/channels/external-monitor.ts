import { analyzeText } from '../core/analyze.js';
import { loadConfig } from '../core/config.js';
import { listGlossaryEntries } from '../core/glossary.js';
import { buildPromptAssessment, type PromptAssessment } from '../core/prompt-assessment.js';
import { buildPronunciationBite } from '../core/pronunciation.js';
import { recordLearningItem, recordPromptEvent, type LearningItem, type PromptEvent } from '../storage/repository.js';

export interface ExternalChannelTextMonitorInput {
  text: string;
  replyMode: 'silent' | 'violation' | 'always';
  source: Extract<PromptEvent['source'], 'feishu-channel' | 'wechat-channel'>;
  channelTag: 'feishu' | 'wechat';
  coachingScene: string;
  quoteStyle: 'markdown-blockquote' | 'plain';
}

export interface ExternalChannelTextMonitorResult {
  decision: ReturnType<typeof analyzeText>['decision'];
  shouldReply: boolean;
  replyText?: string;
  rewrite?: string;
  agentCoachingInstruction?: string;
  recorded: boolean;
  item?: LearningItem;
}

export function monitorExternalChannelText(input: ExternalChannelTextMonitorInput): ExternalChannelTextMonitorResult {
  const config = loadConfig();
  const assessment = buildPromptAssessment({ text: input.text, config, allowedTerms: allowedGlossaryTerms() });
  const analysis = assessment.analysis;
  const shouldReply =
    input.replyMode === 'always' || (input.replyMode === 'violation' && analysis.decision === 'BLOCK');

  recordPromptEvent(input.source, input.text, analysis, { coachingShown: shouldReply });
  const item = recordChannelLesson(input, assessment);
  const agentCoachingInstruction = buildAgentCoachingInstruction(input, assessment);
  return {
    decision: analysis.decision,
    shouldReply,
    ...(assessment.rewrite ? { rewrite: assessment.rewrite } : {}),
    ...(shouldReply ? { replyText: buildReplyText(input, analysis.decision, assessment.rewrite) } : {}),
    ...(agentCoachingInstruction ? { agentCoachingInstruction } : {}),
    recorded: item !== undefined,
    ...(item ? { item } : {}),
  };
}

function recordChannelLesson(
  input: ExternalChannelTextMonitorInput,
  assessment: PromptAssessment,
): LearningItem | undefined {
  if (!assessment.lesson.worthRecording && !assessment.rewrite) return undefined;
  return recordLearningItem({
    original: assessment.lesson.original,
    suggested: assessment.rewrite ?? assessment.lesson.suggested,
    pattern: assessment.lesson.pattern,
    scene: input.replyMode === 'silent' ? assessment.lesson.scene : input.coachingScene,
    tags: [...new Set([...assessment.lesson.tags, input.channelTag, 'channel'])],
    ipa: assessment.rewrite ? buildPronunciationBite(assessment.rewrite, 8) : assessment.lesson.ipa,
  });
}

function buildReplyText(
  input: ExternalChannelTextMonitorInput,
  decision: ExternalChannelTextMonitorResult['decision'],
  rewrite: string | undefined,
): string {
  const quote = formatQuote(
    input.quoteStyle,
    rewrite ??
      (decision === 'BLOCK'
        ? 'Please rewrite this mainly in English while preserving the original intent.'
        : input.text),
  );
  if (decision === 'BLOCK') {
    return ['Try this in English:', '', quote, '', 'I recorded this as a review item when it was useful.'].join('\n');
  }
  return ['English note:', '', quote].join('\n');
}

function buildAgentCoachingInstruction(
  input: ExternalChannelTextMonitorInput,
  assessment: PromptAssessment,
): string | undefined {
  if (assessment.analysis.decision === 'BLOCK') return undefined;
  const shouldCoach =
    assessment.analysis.decision === 'ALLOW_WITH_COACHING' ||
    input.replyMode === 'always' ||
    (assessment.analysis.coachingSignals?.length ?? 0) > 0;
  if (!shouldCoach) return undefined;

  const ipa = assessment.lesson.ipa
    .slice(0, 3)
    .map((entry) => `${entry.word} ${entry.ipa}`)
    .join('; ');

  return [
    'Required: after the main reply, append exactly one compact English note. Do not omit it.',
    'Use this output format:',
    'English note: "original phrase" -> "more natural English"',
    'Why: one practical rule',
    'IPA: key word /IPA/',
    `English note: "${assessment.lesson.original}" -> "${assessment.lesson.suggested}"`,
    `Why: ${assessment.lesson.pattern}`,
    ...(ipa ? [`IPA: ${ipa}`] : []),
    'Keep the note professional and do not add more than one teaching note.',
  ].join('\n');
}

function formatQuote(style: ExternalChannelTextMonitorInput['quoteStyle'], text: string): string {
  return style === 'markdown-blockquote' ? `> ${text}` : text;
}

function allowedGlossaryTerms(): string[] {
  return listGlossaryEntries()
    .filter((entry) => entry.allowTerm)
    .map((entry) => entry.term);
}
