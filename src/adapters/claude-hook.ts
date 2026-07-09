import type { PromptAssessment } from '../core/prompt-assessment.js';
import type { EnglishPilotConfig } from '../core/types.js';

export interface ClaudeHookBlockResponse {
  decision: 'block';
  reason: string;
}

export type ClaudeHookResponse = ClaudeHookBlockResponse | undefined;

export function buildClaudePromptSubmitResponse(
  _prompt: string,
  config: EnglishPilotConfig,
  assessment: PromptAssessment,
): ClaudeHookResponse {
  if (assessment.analysis.decision !== 'BLOCK') return undefined;

  const actual = Math.round(assessment.analysis.nonEnglishRatio * 100);
  const allowed = Math.round(config.maxChineseRatio * 100);
  return {
    decision: 'block',
    reason: [
      `Your message is over the current Chinese ratio limit: ${actual}% > ${allowed}%.`,
      '',
      ...(assessment.rewrite
        ? ['Please rewrite it in English. Try this copyable version:', '', `"${assessment.rewrite}"`, '']
        : ['Please rewrite it in English.', '']),
      'Tip: You can keep short Chinese terms when they are hard to translate, but make the main sentence structure English.',
    ].join('\n'),
  };
}
