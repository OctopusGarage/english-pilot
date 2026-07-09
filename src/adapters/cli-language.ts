import { analyzeText } from '../core/analyze.js';
import { handleClaudePromptSubmit } from './claude-hook.js';
import { loadConfig } from '../core/config.js';
import { buildCoachingContext, type CoachingContext } from '../core/coaching-context.js';
import { suggestLearningItem, suggestRewrite } from '../core/coach.js';
import { lookupPronunciations } from '../core/pronunciation.js';
import { extractLesson, type ExtractedLesson } from '../core/lesson.js';
import { buildMethodTemplateLearningItem, listMethodTemplates, type MethodTemplate } from '../core/method-templates.js';
import { listGlossaryEntries } from '../core/glossary.js';
import { listPromptEvents, recordLearningItem, recordPromptEvent } from '../storage/repository.js';
import type { AnalysisResult } from '../core/types.js';
import type { CliResult } from './cli-types.js';
import { getFlagValue, getText, isRecord } from './cli-args.js';

export function runCheck(args: string[], stdin: string): CliResult {
  const json = args.includes('--json');
  const text = getText(args, stdin);
  if (!text.trim()) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'No text provided. Use `english-pilot check --text "..."`, positional text, or --stdin.\n',
    };
  }

  const config = loadConfig();
  const result = analyzeText(text, config, allowedGlossaryTerms());
  const coachingNote = buildCoachingNote(text, result, config);
  recordPromptEvent('cli', text, result, { coachingShown: coachingNote !== undefined });
  maybeRecordLearningItem(text, result, config);
  const rewrite = result.decision === 'BLOCK' && config.blockWithRewrite ? suggestRewrite(text) : undefined;
  const output = {
    ...result,
    ...(rewrite ? { rewrite } : {}),
    ...(coachingNote ? { coachingNote } : {}),
  };
  return {
    exitCode: result.decision === 'BLOCK' ? 2 : 0,
    stdout: json ? `${JSON.stringify(output)}\n` : formatHumanResult(result, coachingNote, rewrite),
    stderr: '',
  };
}

export function runHook(args: string[], stdin: string): CliResult {
  const [target] = args;
  if (target !== 'claude' && target !== 'codex') {
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'Usage: english-pilot hook claude|codex --stdin\n',
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(stdin);
  } catch {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `Invalid ${target === 'claude' ? 'Claude' : 'Codex'} hook JSON.\n`,
    };
  }

  const response = handleClaudePromptSubmit(isRecord(payload) ? payload : {});
  const prompt = isRecord(payload) && typeof payload.prompt === 'string' ? payload.prompt : '';
  if (prompt.trim()) {
    const config = loadConfig();
    const analysis = analyzeText(prompt, config, allowedGlossaryTerms());
    recordPromptEvent(`${target}-hook`, prompt, analysis);
    maybeRecordLearningItem(prompt, analysis, config);
  }
  return {
    exitCode: 0,
    stdout: response ? `${JSON.stringify(response)}\n` : '',
    stderr: '',
  };
}

export function runCoach(args: string[], stdin: string): CliResult {
  if (args[0] === 'context') {
    const context = buildCoachingContext({
      config: loadConfig(),
      promptEvents: listPromptEvents(),
    });
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify(context, null, 2)}\n` : formatCoachingContext(context),
      stderr: '',
    };
  }

  if (args[0] === 'templates') {
    const templates = listMethodTemplates(getFlagValue(args, '--scene'));
    const shouldRecord = args.includes('--record');
    if (shouldRecord && templates.length !== 1) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'Usage: english-pilot coach templates --scene <id> --record [--json]\n',
      };
    }
    const item = shouldRecord ? recordLearningItem(buildMethodTemplateLearningItem(templates[0])) : undefined;
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify({ templates, ...(shouldRecord ? { recorded: true, item } : {}) }, null, 2)}\n`
        : shouldRecord
          ? `Recorded method template item: ${item?.id}\n`
          : formatMethodTemplates(templates),
      stderr: '',
    };
  }

  const json = args.includes('--json');
  const text = getText(args, stdin);
  if (!text.trim()) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'No text provided. Use `english-pilot coach --text "..."`, positional text, or --stdin.\n',
    };
  }

  const lesson = extractLesson(text);
  const recorded = args.includes('--record') && recordLessonIfWorthwhile(lesson);
  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify({ lesson, recorded }, null, 2)}\n` : formatLesson(lesson, recorded),
    stderr: '',
  };
}

export function runPronounce(args: string[], stdin: string): CliResult {
  const json = args.includes('--json');
  const text = getText(args, stdin);
  if (!text.trim()) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'No text provided. Use `english-pilot pronounce --text "..."`, positional text, or --stdin.\n',
    };
  }
  const result = lookupPronunciations(text);
  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(result, null, 2)}\n` : formatPronunciationLookup(result),
    stderr: '',
  };
}

function formatHumanResult(result: AnalysisResult, coachingNote?: string, rewrite?: string): string {
  const percent = Math.round(result.nonEnglishRatio * 100);
  const lines = [`Decision: ${result.decision}`, `Chinese/non-English ratio: ${percent}%`, `Reason: ${result.reason}`];
  if (rewrite) {
    lines.push('Rewrite starting point:', rewrite);
  }
  if (coachingNote) lines.push(coachingNote);
  lines.push('');
  return lines.join('\n');
}

function allowedGlossaryTerms(): string[] {
  return listGlossaryEntries()
    .filter((entry) => entry.allowTerm)
    .map((entry) => entry.term);
}

function maybeRecordLearningItem(text: string, result: AnalysisResult, config: ReturnType<typeof loadConfig>): void {
  if (result.nonEnglishCount === 0) return;
  if (!isAutoRecordableLearningPrompt(result)) return;
  if (result.decision !== 'BLOCK' && !config.recordAllowedPrompts) return;
  recordLessonIfWorthwhile(extractLesson(text));
}

function isAutoRecordableLearningPrompt(result: AnalysisResult): boolean {
  const normalized = result.sanitizedText.trim().replace(/\s+/g, ' ');
  if (!normalized) return false;
  if (normalized.length > 180) return false;
  if ((normalized.match(/\n/g)?.length ?? 0) > 2) return false;
  if ((normalized.match(/[。！？.!?]/g)?.length ?? 0) > 2) return false;
  return true;
}

function recordLessonIfWorthwhile(lesson: ExtractedLesson): boolean {
  if (!lesson.worthRecording) return false;
  recordLearningItem({
    original: lesson.original,
    suggested: lesson.suggested,
    pattern: lesson.pattern,
    scene: lesson.scene,
    tags: lesson.tags,
    ipa: lesson.ipa,
  });
  return true;
}

function buildCoachingNote(
  text: string,
  result: AnalysisResult,
  config: ReturnType<typeof loadConfig>,
): string | undefined {
  if (result.decision !== 'ALLOW_WITH_COACHING') return undefined;
  if (!isInlineCoachablePrompt(result)) return undefined;
  if (config.coachingIntensity === 'low') return undefined;
  const forceCoaching = config.coachingIntensity === 'force';
  if (!forceCoaching && isInCoachingCooldown(config.coachingCooldownMinutes)) return undefined;
  if (!forceCoaching && hasReachedDailyCoachingCap(config.maxInlineCoachingPerDay)) return undefined;
  const suggestion = suggestLearningItem(text);
  return formatTeachingNote(text, suggestion);
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

function isInlineCoachablePrompt(result: AnalysisResult): boolean {
  return isAutoRecordableLearningPrompt(result);
}

function isInCoachingCooldown(cooldownMinutes: number): boolean {
  if (cooldownMinutes <= 0) return false;
  const cutoff = Date.now() - cooldownMinutes * 60 * 1000;
  return listPromptEvents().some((event) => {
    if (!event.coachingShown) return false;
    return new Date(event.createdAt).getTime() >= cutoff;
  });
}

function hasReachedDailyCoachingCap(maxInlineCoachingPerDay: number): boolean {
  if (maxInlineCoachingPerDay <= 0) return true;
  const today = new Date().toISOString().slice(0, 10);
  const coachingCount = listPromptEvents().filter((event) => {
    return event.coachingShown && event.createdAt.slice(0, 10) === today;
  }).length;
  return coachingCount >= maxInlineCoachingPerDay;
}

function formatCoachingContext(context: CoachingContext): string {
  return [
    'Coaching context',
    `Intensity: ${context.policy.intensity}`,
    `Cooldown: ${context.cooldown.active ? `active until ${context.cooldown.until}` : 'inactive'}`,
    `Today: ${context.today.coachingShown} shown, ${context.today.remaining} remaining`,
    `Inline coaching: ${context.decision.shouldOfferInlineCoaching ? 'available' : `skip (${context.decision.reason})`}`,
    '',
    context.finalResponseInstruction,
    '',
  ].join('\n');
}

function formatLesson(lesson: ExtractedLesson, recorded: boolean): string {
  return [
    `Suggested: ${lesson.suggested}`,
    `Scene: ${lesson.scene}`,
    `Worth recording: ${lesson.worthRecording ? 'yes' : 'no'}`,
    `Recorded: ${recorded ? 'yes' : 'no'}`,
    'Key phrases:',
    ...lesson.keyPhrases.map((phrase) => `- ${phrase}`),
    'IPA:',
    ...lesson.ipa.map((entry) => `- ${entry.word} ${entry.ipa}`),
    `Review: ${lesson.reviewPrompt}`,
    '',
  ].join('\n');
}

function formatPronunciationLookup(result: ReturnType<typeof lookupPronunciations>): string {
  const lines = result.entries.map((entry) => `${entry.word}: ${entry.ipa} (${entry.stress})`);
  if (result.unknown.length > 0) {
    lines.push(`Unknown: ${result.unknown.join(', ')}`);
  }
  lines.push('');
  return lines.join('\n');
}

function formatMethodTemplates(templates: MethodTemplate[]): string {
  if (templates.length === 0) return 'No matching method templates.\n';
  return templates
    .map((template) =>
      [
        `${template.scene} (${template.id})`,
        `Pattern: ${template.pattern}`,
        `Example: ${template.example}`,
        `IPA: ${template.ipa.map((entry) => `${entry.word} ${entry.ipa}`).join(', ') || 'none'}`,
        '',
      ].join('\n'),
    )
    .join('\n');
}
