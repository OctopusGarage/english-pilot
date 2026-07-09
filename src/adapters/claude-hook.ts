import { analyzeText } from '../core/analyze.js';
import { loadConfig } from '../core/config.js';
import { suggestRewrite } from '../core/coach.js';
import { listGlossaryEntries } from '../core/glossary.js';

export interface ClaudeHookInput {
  prompt?: string;
}

export interface ClaudeHookBlockResponse {
  decision: 'block';
  reason: string;
}

export type ClaudeHookResponse = ClaudeHookBlockResponse | undefined;

export function handleClaudePromptSubmit(input: ClaudeHookInput): ClaudeHookResponse {
  const prompt = input.prompt ?? '';
  if (!prompt.trim()) return undefined;

  const policy = loadConfig();
  const result = analyzeText(prompt, policy, allowedGlossaryTerms());
  if (result.decision !== 'BLOCK') return undefined;

  const actual = Math.round(result.nonEnglishRatio * 100);
  const allowed = Math.round(policy.maxChineseRatio * 100);
  const rewrite = policy.blockWithRewrite ? suggestRewrite(prompt) : undefined;
  return {
    decision: 'block',
    reason: [
      `Your message is over the current Chinese ratio limit: ${actual}% > ${allowed}%.`,
      '',
      ...(rewrite
        ? ['Please rewrite it in English. Try this copyable version:', '', `"${rewrite}"`, '']
        : ['Please rewrite it in English.', '']),
      'Tip: You can keep short Chinese terms when they are hard to translate, but make the main sentence structure English.',
    ].join('\n'),
  };
}

function allowedGlossaryTerms(): string[] {
  return listGlossaryEntries()
    .filter((entry) => entry.allowTerm)
    .map((entry) => entry.term);
}
