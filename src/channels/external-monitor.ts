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
  return {
    decision: analysis.decision,
    shouldReply,
    ...(assessment.rewrite ? { rewrite: assessment.rewrite } : {}),
    ...(shouldReply ? { replyText: buildReplyText(input, analysis.decision, assessment.rewrite) } : {}),
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

function formatQuote(style: ExternalChannelTextMonitorInput['quoteStyle'], text: string): string {
  return style === 'markdown-blockquote' ? `> ${text}` : text;
}

function allowedGlossaryTerms(): string[] {
  return listGlossaryEntries()
    .filter((entry) => entry.allowTerm)
    .map((entry) => entry.term);
}
