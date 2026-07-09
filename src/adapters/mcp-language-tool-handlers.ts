import { analyzeText } from '../core/analyze.js';
import { suggestRewrite } from '../core/coach.js';
import { buildCoachingContext } from '../core/coaching-context.js';
import { loadConfig } from '../core/config.js';
import { listGlossaryEntries } from '../core/glossary.js';
import { lookupPronunciations } from '../core/pronunciation.js';
import { listPromptEvents } from '../storage/repository.js';
import { requireText } from './mcp-tool-arguments.js';
import type { EnglishPilotMcpToolName } from './mcp-tool-registry.js';

export function handleLanguageMcpTool(
  name: EnglishPilotMcpToolName,
  args: Record<string, unknown>,
): Record<string, unknown> | undefined {
  switch (name) {
    case 'english_analyze_text': {
      const text = requireText(args);
      return analyzeText(text, loadConfig(), allowedGlossaryTerms()) as unknown as Record<string, unknown>;
    }
    case 'english_rewrite_text': {
      const text = requireText(args);
      return { rewrite: suggestRewrite(text) };
    }
    case 'english_pronounce_text': {
      const text = requireText(args);
      return lookupPronunciations(text) as unknown as Record<string, unknown>;
    }
    case 'english_coaching_context':
      return buildCoachingContext({
        config: loadConfig(),
        promptEvents: listPromptEvents(),
      }) as unknown as Record<string, unknown>;
    default:
      return undefined;
  }
}

export function allowedGlossaryTerms(): string[] {
  return listGlossaryEntries()
    .filter((entry) => entry.allowTerm)
    .map((entry) => entry.term);
}
