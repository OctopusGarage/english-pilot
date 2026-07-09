import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getEnglishPilotHome } from '../core/config.js';
import {
  buildDailyReviewAnswer,
  buildDailyReviewItems,
  buildDailyReviewPack,
  buildDueDailyReviewItems,
  checkDailyReviewAnswer,
} from '../core/lesson.js';
import { buildPronunciationBite } from '../core/pronunciation.js';
import { buildReviewCleanupPlan } from '../core/review-cleanup.js';
import {
  buildDueReviewItems,
  buildUpcomingReviewSchedule,
  isDateKey,
  parsePositiveInteger,
} from '../core/review-schedule.js';
import {
  listLearningItems,
  markLearningItemReview,
  removeLearningItem,
  updateLearningItem,
} from '../storage/repository.js';
import type { CliResult } from './cli-types.js';

export function runReview(args: string[]): CliResult {
  if (args[0] === 'due') {
    const date = getFlagValue(args, '--date') ?? new Date().toISOString().slice(0, 10);
    if (!isDateKey(date)) return usage('english-pilot review due [--date YYYY-MM-DD] [--json]');
    const items = buildDueReviewItems(listLearningItems(), date);
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify({ date, items }, null, 2)}\n` : formatReviewItems(items),
      stderr: '',
    };
  }

  if (args[0] === 'upcoming') {
    const date = getFlagValue(args, '--date') ?? new Date().toISOString().slice(0, 10);
    if (!isDateKey(date)) return usage('english-pilot review upcoming [--date YYYY-MM-DD] [--days N] [--json]');
    const days = parsePositiveInteger(getFlagValue(args, '--days'), 7);
    const groups = buildUpcomingReviewSchedule(listLearningItems(), date, days);
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify({ date, days, groups }, null, 2)}\n`
        : formatReviewSchedule(groups),
      stderr: '',
    };
  }

  if (args[0] === 'mark') {
    const id = args[1];
    const outcome = args[2];
    if (!id || !isReviewOutcome(outcome)) return usage('english-pilot review mark <id> again|hard|easy');
    const item = markLearningItemReview(id, outcome);
    if (!item) return notFound(id);
    return {
      exitCode: 0,
      stdout: `Marked ${id} as ${outcome}; next review: ${item.nextReviewAt}\n`,
      stderr: '',
    };
  }

  if (args[0] === 'remove') {
    const id = args[1];
    if (!id) return usage('english-pilot review remove <id>');
    const item = removeLearningItem(id);
    if (!item) return notFound(id);
    return {
      exitCode: 0,
      stdout: `Removed learning item: ${id}\n`,
      stderr: '',
    };
  }

  if (args[0] === 'update') {
    const result = updateReviewItem(args);
    if (result) return result;
  }

  if (args[0] === 'cleanup') {
    const json = args.includes('--json');
    const shouldDelete = args.includes('--yes');
    const plan = buildReviewCleanupPlan(listLearningItems());
    const removed = shouldDelete
      ? plan.candidates
          .map((candidate) => removeLearningItem(candidate.id))
          .filter((item): item is NonNullable<typeof item> => item !== undefined)
      : [];
    const output = {
      mode: shouldDelete ? 'delete' : 'preview',
      candidateCount: plan.candidateCount,
      candidates: plan.candidates,
      ...(shouldDelete ? { removedCount: removed.length, removed: removed.map((item) => item.id) } : {}),
    };
    return {
      exitCode: 0,
      stdout: json ? `${JSON.stringify(output, null, 2)}\n` : formatReviewCleanup(output),
      stderr: '',
    };
  }

  const items = listLearningItems();
  return {
    exitCode: 0,
    stdout: args.includes('--json')
      ? `${JSON.stringify(items, null, 2)}\n`
      : items.map((item) => `${item.original}\n=> ${item.suggested}\n`).join('\n'),
    stderr: '',
  };
}

export function runDaily(args: string[]): CliResult {
  const [subcommand] = args;
  if (subcommand === 'pack') {
    const date = getFlagValue(args, '--date') ?? new Date().toISOString().slice(0, 10);
    if (!isDateKey(date)) return usage('english-pilot daily pack [--date YYYY-MM-DD] [--write] [--json]');
    const pack = buildDailyReviewPack(listLearningItems(), date);
    const path = join(getEnglishPilotHome(), 'reviews', `${date}.md`);
    const shouldWrite = args.includes('--write');
    if (shouldWrite) {
      mkdirSync(join(getEnglishPilotHome(), 'reviews'), { recursive: true });
      writeFileSync(path, pack.markdown, 'utf8');
    }
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify({ ...pack, ...(shouldWrite ? { path } : {}) }, null, 2)}\n`
        : shouldWrite
          ? `Wrote daily review pack: ${path}\n`
          : pack.markdown,
      stderr: '',
    };
  }

  if (subcommand === 'start') {
    const items = buildDueDailyReviewItems(listLearningItems());
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify({ items }, null, 2)}\n` : formatDailyStart(items),
      stderr: '',
    };
  }

  if (subcommand === 'answer') {
    const id = args[1];
    if (!id) return usage('english-pilot daily answer <id> [--json]');
    const item = findLearningItem(id);
    if (!item) return notFound(id);
    const answer = buildDailyReviewAnswer(item);
    return {
      exitCode: 0,
      stdout: args.includes('--json') ? `${JSON.stringify({ item: answer }, null, 2)}\n` : formatDaily([answer]),
      stderr: '',
    };
  }

  if (subcommand === 'check') {
    const id = args[1];
    const answer = getFlagValue(args, '--answer');
    if (!id || !answer?.trim()) return usage('english-pilot daily check <id> --answer "..." [--json]');
    const item = findLearningItem(id);
    if (!item) return notFound(id);
    const check = checkDailyReviewAnswer(item, answer);
    const reviewItem = buildDailyReviewAnswer(item);
    return {
      exitCode: 0,
      stdout: args.includes('--json')
        ? `${JSON.stringify({ item: reviewItem, check }, null, 2)}\n`
        : formatDailyReviewCheck(reviewItem, check),
      stderr: '',
    };
  }

  if (subcommand === 'mark') {
    const id = args[1];
    const outcome = args[2];
    if (!id || !isReviewOutcome(outcome)) return usage('english-pilot daily mark <id> again|hard|easy');
    const item = markLearningItemReview(id, outcome);
    if (!item) return notFound(id);
    return {
      exitCode: 0,
      stdout: `Marked ${id} as ${outcome}; next review: ${item.nextReviewAt}\n`,
      stderr: '',
    };
  }

  const items = buildDailyReviewItems(listLearningItems());
  return {
    exitCode: 0,
    stdout: args.includes('--json') ? `${JSON.stringify({ items }, null, 2)}\n` : formatDaily(items),
    stderr: '',
  };
}

function updateReviewItem(args: string[]): CliResult | undefined {
  const id = args[1];
  if (!id)
    return usage(
      'english-pilot review update <id> [--original "..."] [--suggested "..."] [--scene "..."] [--pattern "..."] [--tag tag] [--json]',
    );
  const suggested = getFlagValue(args, '--suggested');
  const update = {
    ...(getFlagValue(args, '--original') !== undefined ? { original: getFlagValue(args, '--original') as string } : {}),
    ...(suggested !== undefined ? { suggested, ipa: buildPronunciationBite(suggested, 6) } : {}),
    ...(getFlagValue(args, '--scene') !== undefined ? { scene: getFlagValue(args, '--scene') as string } : {}),
    ...(getFlagValue(args, '--pattern') !== undefined ? { pattern: getFlagValue(args, '--pattern') as string } : {}),
    ...(getRepeatedFlagValues(args, '--tag').length > 0 ? { tags: getRepeatedFlagValues(args, '--tag') } : {}),
  };
  if (Object.keys(update).length === 0) {
    return usage(
      'english-pilot review update <id> [--original "..."] [--suggested "..."] [--scene "..."] [--pattern "..."] [--tag tag] [--json]',
    );
  }
  const item = updateLearningItem(id, update);
  if (!item) return notFound(id);
  return {
    exitCode: 0,
    stdout: args.includes('--json') ? `${JSON.stringify({ item }, null, 2)}\n` : `Updated learning item: ${id}\n`,
    stderr: '',
  };
}

function findLearningItem(id: string) {
  return listLearningItems().find((candidate) => candidate.id === id);
}

function formatDailyReviewCheck(
  item: ReturnType<typeof buildDailyReviewAnswer>,
  check: ReturnType<typeof checkDailyReviewAnswer>,
): string {
  return [
    `Review item: ${item.id}`,
    `Exact match: ${check.exact ? 'yes' : 'no'}`,
    `Your answer: ${check.answer}`,
    `Target answer: ${check.target}`,
    check.feedback,
    '',
  ].join('\n');
}

function formatReviewItems(items: ReturnType<typeof listLearningItems>): string {
  if (items.length === 0) return 'No due review items.\n';
  return items
    .map((item) =>
      [
        `ID: ${item.id}`,
        `Next review: ${item.nextReviewAt}`,
        `Original: ${item.original}`,
        `Suggested: ${item.suggested}`,
        '',
      ].join('\n'),
    )
    .join('\n');
}

function formatReviewCleanup(result: {
  mode: string;
  candidateCount: number;
  candidates: ReturnType<typeof buildReviewCleanupPlan>['candidates'];
  removedCount?: number;
}): string {
  const lines = [`Review cleanup ${result.mode}: ${result.candidateCount} candidate(s).`];
  if (result.candidateCount === 0) {
    lines.push('No likely noisy review items found.', '');
    return lines.join('\n');
  }
  for (const candidate of result.candidates) {
    lines.push(
      `- ${candidate.id}: ${candidate.reasons.join(', ')}`,
      `  original: ${candidate.originalPreview}`,
      `  suggested: ${candidate.suggestedPreview}`,
    );
  }
  if (result.mode === 'delete') {
    lines.push('', `Removed ${result.removedCount ?? 0} item(s).`);
  } else {
    lines.push('', 'Run `english-pilot review cleanup --yes` to remove these candidates.');
  }
  lines.push('');
  return lines.join('\n');
}

function formatReviewSchedule(
  groups: ReturnType<typeof buildUpcomingReviewSchedule<ReturnType<typeof listLearningItems>[number]>>,
): string {
  if (groups.length === 0) return 'No upcoming review items.\n';
  return groups
    .map((group) =>
      [`${group.date} (${group.count})`, ...group.items.map((item) => `- ${item.id}: ${item.suggested}`), ''].join(
        '\n',
      ),
    )
    .join('\n');
}

function formatDaily(items: ReturnType<typeof buildDailyReviewItems>): string {
  if (items.length === 0) return 'No learning items yet.\n';
  return items
    .map((item, index) =>
      [
        `${index + 1}. ${item.reviewPrompt}`,
        `Answer: ${item.suggested}`,
        `Scene: ${item.scene}`,
        ...item.ipa.map((entry) => `- ${entry.word} ${entry.ipa}`),
        '',
      ].join('\n'),
    )
    .join('\n');
}

function formatDailyStart(items: ReturnType<typeof buildDueDailyReviewItems>): string {
  if (items.length === 0) return 'No due review items.\n';
  return items
    .map((item, index) =>
      [
        `${index + 1}. ${item.reviewPrompt}`,
        `ID: ${item.id}`,
        `Scene: ${item.scene}`,
        ...item.ipa.map((entry) => `- ${entry.word} ${entry.ipa}`),
        '',
      ].join('\n'),
    )
    .join('\n');
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function getRepeatedFlagValues(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1] !== undefined) values.push(args[index + 1]);
  }
  return values;
}

function isReviewOutcome(value: unknown): value is 'again' | 'hard' | 'easy' {
  return value === 'again' || value === 'hard' || value === 'easy';
}

function usage(command: string): CliResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: `Usage: ${command}\n`,
  };
}

function notFound(id: string): CliResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: `Learning item not found: ${id}\n`,
  };
}
