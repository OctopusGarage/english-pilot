import type { LearningItem, PromptEvent } from '../storage/repository.js';

export interface HistoryFilters {
  date?: string;
  from?: string;
  to?: string;
  source?: PromptEvent['source'];
  decision?: PromptEvent['decision'];
  tag?: string;
  tags?: string[];
  dueOnly?: boolean;
  includeText?: boolean;
  limit?: number;
}

export interface LearningHistoryOptions extends HistoryFilters {
  today?: string;
}

export function buildInputHistory(events: PromptEvent[], options: LearningHistoryOptions = {}) {
  const includeText = options.includeText ?? true;
  const limit = options.limit ?? 50;
  const filtered = limitItems(
    events
      .filter((event) => matchesDateRange(event.createdAt, options))
      .filter((event) => (options.source ? event.source === options.source : true))
      .filter((event) => (options.decision ? event.decision === options.decision : true)),
    limit,
  );
  return {
    filters: {
      ...dateRangeForOutput(options),
      ...(options.source ? { source: options.source } : {}),
      ...(options.decision ? { decision: options.decision } : {}),
      includeText,
      limit,
    },
    stats: buildPromptEventStats(filtered),
    events: filtered.map((event) => ({
      id: event.id,
      createdAt: event.createdAt,
      source: event.source,
      decision: event.decision,
      nonEnglishRatio: event.nonEnglishRatio,
      englishCount: event.englishCount,
      nonEnglishCount: event.nonEnglishCount,
      reason: event.reason,
      coachingShown: event.coachingShown ?? false,
      ...(includeText ? { text: event.text } : {}),
    })),
  };
}

export function buildNotesHistory(items: LearningItem[], options: LearningHistoryOptions = {}) {
  const limit = options.limit ?? 50;
  const tags = normalizeTags(options);
  const dueDate = options.today ?? new Date().toISOString().slice(0, 10);
  const filtered = limitItems(
    items
      .filter((item) => matchesDateRange(item.createdAt, options))
      .filter((item) => matchesTags(item, tags))
      .filter((item) => (options.dueOnly ? item.nextReviewAt <= dueDate : true)),
    limit,
  );
  return {
    filters: {
      ...dateRangeForOutput(options),
      tags,
      dueOnly: options.dueOnly ?? false,
      limit,
    },
    stats: {
      total: filtered.length,
      due: filtered.filter((item) => item.nextReviewAt <= dueDate).length,
    },
    notes: filtered.map(formatNote),
  };
}

export function buildLearningBrief(events: PromptEvent[], items: LearningItem[], options: LearningHistoryOptions = {}) {
  const limit = options.limit ?? 50;
  const inputHistory = buildInputHistory(events, { ...options, limit, includeText: true });
  const notesHistory = buildNotesHistory(items, { ...options, limit });
  const notes = notesHistory.notes;
  return {
    filters: {
      ...dateRangeForOutput(options),
      limit,
    },
    stats: {
      promptEvents: inputHistory.stats.total,
      blockedPrompts: inputHistory.stats.blocked,
      coachedPrompts: inputHistory.stats.coached,
      averageNonEnglishRatio: inputHistory.stats.averageNonEnglishRatio,
      learningItems: notes.length,
      dueLearningItems: notesHistory.stats.due,
    },
    inputHighlights: inputHistory.events.slice(0, Math.min(10, limit)),
    notes,
    patterns: summarizePatterns(notes),
    suggestedActivities: [
      'Write a daily recap of the user input patterns and the most useful rewrites.',
      'Create a short English speech using the strongest suggested expressions.',
      'Turn the notes into retrieval-practice questions with answers hidden first.',
    ],
    teachingPrompt: [
      'Use this EnglishPilot learning brief to help the user learn from their own recent inputs.',
      'First answer the user request directly, then teach the highest-impact patterns.',
      'Use the recorded original -> suggested pairs, explain one practical rule per pattern, and include IPA only when useful.',
    ].join(' '),
  };
}

function buildPromptEventStats(events: PromptEvent[]) {
  return {
    total: events.length,
    blocked: events.filter((event) => event.decision === 'BLOCK').length,
    coached: events.filter((event) => event.decision === 'ALLOW_WITH_COACHING').length,
    averageNonEnglishRatio:
      events.length === 0
        ? 0
        : Number((events.reduce((sum, event) => sum + event.nonEnglishRatio, 0) / events.length).toFixed(4)),
  };
}

function formatNote(item: LearningItem) {
  return {
    id: item.id,
    createdAt: item.createdAt,
    nextReviewAt: item.nextReviewAt,
    original: item.original,
    suggested: item.suggested,
    scene: item.scene ?? 'general English practice',
    tags: item.tags ?? [],
    pattern: item.pattern ?? 'Use English as the main sentence structure.',
    ipa: item.ipa ?? [],
    review: {
      ease: item.ease,
      reviewCount: item.reviewCount,
      lapseCount: item.lapseCount,
      intervalDays: item.intervalDays,
      ...(item.lastReviewedAt ? { lastReviewedAt: item.lastReviewedAt } : {}),
    },
  };
}

function summarizePatterns(notes: ReturnType<typeof formatNote>[]) {
  const byPattern = new Map<string, ReturnType<typeof formatNote>[]>();
  for (const note of notes) {
    const bucket = byPattern.get(note.pattern) ?? [];
    bucket.push(note);
    byPattern.set(note.pattern, bucket);
  }
  return [...byPattern.entries()]
    .map(([pattern, groupedNotes]) => ({
      pattern,
      count: groupedNotes.length,
      examples: groupedNotes.slice(0, 3).map((note) => ({
        original: note.original,
        suggested: note.suggested,
      })),
    }))
    .sort((left, right) => right.count - left.count);
}

function matchesDateRange(iso: string, options: LearningHistoryOptions): boolean {
  const range = resolveDateRange(options);
  if (!range.from && !range.to) return true;
  const date = iso.slice(0, 10);
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

function resolveDateRange(options: LearningHistoryOptions): { from?: string; to?: string } {
  if (options.date) return { from: requireDateKey(options.date, 'date'), to: requireDateKey(options.date, 'date') };
  return {
    ...(options.from ? { from: requireDateKey(options.from, 'from') } : {}),
    ...(options.to ? { to: requireDateKey(options.to, 'to') } : {}),
  };
}

function dateRangeForOutput(options: LearningHistoryOptions) {
  const range = resolveDateRange(options);
  return {
    ...(options.date ? { date: options.date } : {}),
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {}),
  };
}

function requireDateKey(value: string, key: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  throw new Error(`${key} must use YYYY-MM-DD.`);
}

function normalizeTags(options: LearningHistoryOptions): string[] {
  return [...new Set([...(options.tags ?? []), ...(options.tag ? [options.tag] : [])])];
}

function matchesTags(item: LearningItem, tags: string[]): boolean {
  if (tags.length === 0) return true;
  const itemTags = new Set((item.tags ?? []).map((tag) => tag.toLowerCase()));
  return tags.every((tag) => itemTags.has(tag.toLowerCase()));
}

function limitItems<T>(items: T[], limit: number): T[] {
  return items.slice(-limit);
}
