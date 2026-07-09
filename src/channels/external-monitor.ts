import { analyzeText } from '../core/analyze.js';
import { suggestRewrite } from '../core/coach.js';
import { loadConfig } from '../core/config.js';
import { listGlossaryEntries } from '../core/glossary.js';
import { extractLesson } from '../core/lesson.js';
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
  const analysis = analyzeText(input.text, config, allowedGlossaryTerms());
  const rewrite = analysis.decision === 'BLOCK' && config.blockWithRewrite ? suggestRewrite(input.text) : undefined;
  const shouldReply =
    input.replyMode === 'always' || (input.replyMode === 'violation' && analysis.decision === 'BLOCK');

  recordPromptEvent(input.source, input.text, analysis, { coachingShown: shouldReply });
  const item = recordChannelLesson(input, rewrite);
  return {
    decision: analysis.decision,
    shouldReply,
    ...(rewrite ? { rewrite } : {}),
    ...(shouldReply ? { replyText: buildReplyText(input, analysis.decision, rewrite) } : {}),
    recorded: item !== undefined,
    ...(item ? { item } : {}),
  };
}

function recordChannelLesson(
  input: ExternalChannelTextMonitorInput,
  rewrite: string | undefined,
): LearningItem | undefined {
  const lesson = extractLesson(input.text);
  if (!lesson.worthRecording && !rewrite) return undefined;
  return recordLearningItem({
    original: lesson.original,
    suggested: rewrite ?? lesson.suggested,
    pattern: lesson.pattern,
    scene: input.replyMode === 'silent' ? lesson.scene : input.coachingScene,
    tags: [...new Set([...lesson.tags, input.channelTag, 'channel'])],
    ipa: rewrite ? buildPronunciationBite(rewrite, 8) : lesson.ipa,
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
