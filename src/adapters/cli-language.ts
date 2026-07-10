import { buildClaudePromptSubmitResponse } from './claude-hook.js';
import { extractLastAssistantEnglishNote } from '../core/assistant-note.js';
import { loadConfig } from '../core/config.js';
import { buildCoachingContext, type CoachingContext } from '../core/coaching-context.js';
import { buildPromptAssessment, type PromptAssessment } from '../core/prompt-assessment.js';
import { lookupPronunciations } from '../core/pronunciation.js';
import { extractLesson, type ExtractedLesson } from '../core/lesson.js';
import { buildMethodTemplateLearningItem, listMethodTemplates, type MethodTemplate } from '../core/method-templates.js';
import { listGlossaryEntries } from '../core/glossary.js';
import { listPromptEvents, recordLearningItem, recordPromptEvent } from '../storage/repository.js';
import { recordAssistantEnglishNote } from '../storage/assistant-note-recorder.js';
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
  const assessment = buildPromptAssessment({
    text,
    config,
    allowedTerms: allowedGlossaryTerms(),
    promptEvents: listPromptEvents(),
  });
  recordPromptEvent('cli', text, assessment.analysis, { coachingShown: assessment.coachingNote !== undefined });
  maybeRecordLearningItem(assessment, config);
  const output = {
    ...assessment.analysis,
    ...(assessment.rewrite ? { rewrite: assessment.rewrite } : {}),
    ...(assessment.coachingNote ? { coachingNote: assessment.coachingNote } : {}),
  };
  return {
    exitCode: assessment.analysis.decision === 'BLOCK' ? 2 : 0,
    stdout: json
      ? `${JSON.stringify(output)}\n`
      : formatHumanResult(assessment.analysis, assessment.coachingNote, assessment.rewrite),
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

  const stopResult = maybeHandleStopHook(target, args, payload);
  if (stopResult) return stopResult;

  const prompt = isRecord(payload) && typeof payload.prompt === 'string' ? payload.prompt : '';
  const config = loadConfig();
  const assessment = prompt.trim()
    ? buildPromptAssessment({ text: prompt, config, allowedTerms: allowedGlossaryTerms() })
    : undefined;
  const response = assessment ? buildClaudePromptSubmitResponse(prompt, config, assessment) : undefined;
  if (prompt.trim()) {
    if (!assessment) throw new Error('Prompt assessment should exist for non-empty hook prompt.');
    recordPromptEvent(`${target}-hook`, prompt, assessment.analysis);
    maybeRecordLearningItem(assessment, config);
  }
  return {
    exitCode: 0,
    stdout: response ? `${JSON.stringify(response)}\n` : '',
    stderr: '',
  };
}

function maybeHandleStopHook(target: 'claude' | 'codex', args: string[], payload: unknown): CliResult | undefined {
  if (!isStopHookPayload(payload)) return undefined;

  const note = extractLastAssistantEnglishNote(payload.last_assistant_message);
  const item = note ? recordAssistantEnglishNote(target, note) : undefined;
  if (!args.includes('--json')) return { exitCode: 0, stdout: '', stderr: '' };

  return {
    exitCode: 0,
    stdout: `${JSON.stringify(
      {
        operation: 'english-pilot-stop-hook',
        target,
        recorded: item !== undefined,
        ...(item ? { item } : {}),
      },
      null,
      2,
    )}\n`,
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

function isStopHookPayload(value: unknown): value is { last_assistant_message: string } {
  if (!isRecord(value)) return false;
  if (value.hook_event_name !== 'Stop') return false;
  return typeof value.last_assistant_message === 'string' && value.last_assistant_message.trim().length > 0;
}

function maybeRecordLearningItem(assessment: PromptAssessment, config: ReturnType<typeof loadConfig>): void {
  if (!assessment.shouldRecordLearningPrompt) return;
  if (assessment.analysis.decision !== 'BLOCK' && !config.recordAllowedPrompts) return;
  recordLessonIfWorthwhile(assessment.lesson);
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

function formatCoachingContext(context: CoachingContext): string {
  return [
    'Coaching context',
    `Gate mode: ${context.policy.gateMode}`,
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
