import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnalysisResult, PolicyDecision } from '../core/types.js';
import { getEnglishPilotHome, loadConfig } from '../core/config.js';
import { normalizeReviewSchedulingState, type ReviewOutcome } from '../core/review-scheduler.js';
import {
  applyLearningItemReviewOutcome,
  buildInitialLearningItem,
  findDuplicateLearningItem,
  type LearningItem,
  type LearningItemDraft,
  type LearningItemUpdate,
} from '../core/learning-card.js';
import {
  formatLearningItemsMarkdown,
  formatLearningItemsObsidianFiles,
  type ObsidianExportFile,
} from './learning-export.js';

const require = createRequire(import.meta.url);

export type { LearningItem, LearningItemDraft, LearningItemUpdate } from '../core/learning-card.js';

export interface PromptEvent {
  id: string;
  createdAt: string;
  source: 'cli' | 'claude-hook' | 'codex-hook' | 'mcp' | 'feishu-channel' | 'wechat-channel';
  text: string;
  decision: PolicyDecision;
  nonEnglishRatio: number;
  englishCount: number;
  nonEnglishCount: number;
  reason: string;
  coachingShown?: boolean;
}

export interface StorageStats {
  promptEvents: number;
  blockedPrompts: number;
  learningItems: number;
}

interface StorageAdapter {
  recordPromptEvent(event: PromptEvent): void;
  listPromptEvents(): PromptEvent[];
  insertLearningItem(item: LearningItem): void;
  listLearningItems(): LearningItem[];
  updateLearningItemReview(item: LearningItem): void;
  deleteLearningItem(id: string): void;
  updateLearningItemFields(item: LearningItem): void;
}

export function recordPromptEvent(
  source: PromptEvent['source'],
  text: string,
  analysis: AnalysisResult,
  options: { coachingShown?: boolean } = {},
): PromptEvent {
  const event: PromptEvent = {
    id: createId('evt'),
    createdAt: new Date().toISOString(),
    source,
    text,
    decision: analysis.decision,
    nonEnglishRatio: analysis.nonEnglishRatio,
    englishCount: analysis.englishCount,
    nonEnglishCount: analysis.nonEnglishCount,
    reason: analysis.reason,
    coachingShown: options.coachingShown,
  };
  storageAdapter().recordPromptEvent(event);
  return event;
}

export function listPromptEvents(): PromptEvent[] {
  return storageAdapter().listPromptEvents();
}

export function recordLearningItem(item: LearningItemDraft): LearningItem {
  const existing = findDuplicateLearningItem(listLearningItems(), item);
  if (existing) return existing;

  const stored = buildInitialLearningItem({ draft: item, id: createId('learn') });
  storageAdapter().insertLearningItem(stored);
  return stored;
}

export function listLearningItems(): LearningItem[] {
  return storageAdapter().listLearningItems();
}

export function markLearningItemReview(id: string, outcome: ReviewOutcome): LearningItem | undefined {
  const items = listLearningItems();
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return undefined;

  const updated = applyLearningItemReviewOutcome(item, outcome);
  storageAdapter().updateLearningItemReview(updated);
  return updated;
}

export function removeLearningItem(id: string): LearningItem | undefined {
  const items = listLearningItems();
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return undefined;

  storageAdapter().deleteLearningItem(id);
  return item;
}

export function updateLearningItem(id: string, update: LearningItemUpdate): LearningItem | undefined {
  const items = listLearningItems();
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return undefined;

  const updated: LearningItem = {
    ...item,
    ...(update.original !== undefined ? { original: update.original } : {}),
    ...(update.suggested !== undefined ? { suggested: update.suggested } : {}),
    ...(update.scene !== undefined ? { scene: update.scene } : {}),
    ...(update.tags !== undefined ? { tags: update.tags } : {}),
    ...(update.pattern !== undefined ? { pattern: update.pattern } : {}),
    ...(update.ipa !== undefined ? { ipa: update.ipa } : {}),
  };

  storageAdapter().updateLearningItemFields(updated);

  return updated;
}

export function getStats(): StorageStats {
  const events = listPromptEvents();
  const items = listLearningItems();
  return {
    promptEvents: events.length,
    blockedPrompts: events.filter((event) => event.decision === 'BLOCK').length,
    learningItems: items.length,
  };
}

export function exportLearningItemsMarkdown(): string {
  return formatLearningItemsMarkdown(listLearningItems());
}

export function exportLearningItemsObsidianFiles(): ObsidianExportFile[] {
  return formatLearningItemsObsidianFiles(listLearningItems());
}

function storageAdapter(): StorageAdapter {
  return useJsonlStorage() ? jsonlStorageAdapter : sqliteStorageAdapter;
}

const jsonlStorageAdapter: StorageAdapter = {
  recordPromptEvent(event) {
    appendJsonLine(promptEventsPath(), event);
  },
  listPromptEvents() {
    return readJsonLines<PromptEvent>(promptEventsPath());
  },
  insertLearningItem(item) {
    appendJsonLine(learningItemsPath(), item);
  },
  listLearningItems() {
    return readJsonLines<LearningItem>(learningItemsPath()).map(normalizeLearningItem);
  },
  updateLearningItemReview(item) {
    writeLearningItems(
      jsonlStorageAdapter.listLearningItems().map((candidate) => (candidate.id === item.id ? item : candidate)),
    );
  },
  deleteLearningItem(id) {
    writeLearningItems(jsonlStorageAdapter.listLearningItems().filter((candidate) => candidate.id !== id));
  },
  updateLearningItemFields(item) {
    writeLearningItems(
      jsonlStorageAdapter.listLearningItems().map((candidate) => (candidate.id === item.id ? item : candidate)),
    );
  },
};

const sqliteStorageAdapter: StorageAdapter = {
  recordPromptEvent(event) {
    withDatabase((db) => {
      db.prepare(
        `
        insert into prompt_events (
          id, created_at, source, text, decision, non_english_ratio,
          english_count, non_english_count, reason, coaching_shown
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        event.id,
        event.createdAt,
        event.source,
        event.text,
        event.decision,
        event.nonEnglishRatio,
        event.englishCount,
        event.nonEnglishCount,
        event.reason,
        event.coachingShown ? 1 : 0,
      );
    });
  },
  listPromptEvents() {
    return withDatabase((db) =>
      db
        .prepare(
          `
      select
        id,
        created_at as createdAt,
        source,
        text,
        decision,
        non_english_ratio as nonEnglishRatio,
        english_count as englishCount,
        non_english_count as nonEnglishCount,
        reason,
        coaching_shown as coachingShown
      from prompt_events
      order by created_at asc, rowid asc
    `,
        )
        .all()
        .map(rowToPromptEvent),
    );
  },
  insertLearningItem(item) {
    withDatabase((db) => {
      db.prepare(
        `
        insert into learning_items (
          id, created_at, next_review_at, ease, review_count, lapse_count,
          interval_days, last_reviewed_at,
          original, suggested, scene, tags, pattern, ipa
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        item.id,
        item.createdAt,
        item.nextReviewAt,
        item.ease,
        item.reviewCount,
        item.lapseCount,
        item.intervalDays,
        item.lastReviewedAt ?? null,
        item.original,
        item.suggested,
        item.scene ?? null,
        JSON.stringify(item.tags ?? []),
        item.pattern ?? null,
        JSON.stringify(item.ipa ?? []),
      );
    });
  },
  listLearningItems() {
    return withDatabase((db) =>
      db
        .prepare(
          `
      select
        id,
        created_at as createdAt,
        next_review_at as nextReviewAt,
        ease,
        review_count as reviewCount,
        lapse_count as lapseCount,
        interval_days as intervalDays,
        last_reviewed_at as lastReviewedAt,
        original,
        suggested,
        scene,
        tags,
        pattern,
        ipa
      from learning_items
      order by created_at asc, rowid asc
    `,
        )
        .all()
        .map(rowToLearningItem),
    );
  },
  updateLearningItemReview(item) {
    withDatabase((db) => {
      db.prepare(
        `
        update learning_items
        set ease = ?, review_count = ?, lapse_count = ?, interval_days = ?,
          last_reviewed_at = ?, next_review_at = ?
        where id = ?
      `,
      ).run(
        item.ease,
        item.reviewCount,
        item.lapseCount,
        item.intervalDays,
        item.lastReviewedAt ?? null,
        item.nextReviewAt,
        item.id,
      );
    });
  },
  deleteLearningItem(id) {
    withDatabase((db) => {
      db.prepare('delete from learning_items where id = ?').run(id);
    });
  },
  updateLearningItemFields(item) {
    withDatabase((db) => {
      db.prepare(
        `
        update learning_items
        set original = ?, suggested = ?, scene = ?, tags = ?, pattern = ?, ipa = ?
        where id = ?
      `,
      ).run(
        item.original,
        item.suggested,
        item.scene ?? null,
        JSON.stringify(item.tags ?? []),
        item.pattern ?? null,
        JSON.stringify(item.ipa ?? []),
        item.id,
      );
    });
  },
};

function writeLearningItems(items: LearningItem[]): void {
  mkdirSync(getEnglishPilotHome(), { recursive: true });
  writeFileSync(
    learningItemsPath(),
    items.length > 0 ? `${items.map((candidate) => JSON.stringify(candidate)).join('\n')}\n` : '',
    'utf8',
  );
}

function promptEventsPath(): string {
  return join(getEnglishPilotHome(), 'prompt-events.jsonl');
}

function learningItemsPath(): string {
  return join(getEnglishPilotHome(), 'learning-items.jsonl');
}

function sqlitePath(): string {
  return join(getEnglishPilotHome(), 'english-pilot.sqlite');
}

function useJsonlStorage(): boolean {
  return loadConfig().storage === 'jsonl';
}

function withDatabase<T>(operation: (db: DatabaseSyncLike) => T): T {
  mkdirSync(getEnglishPilotHome(), { recursive: true });
  const sqlite = require('node:sqlite') as { DatabaseSync: new (path: string) => DatabaseSyncLike };
  const db = new sqlite.DatabaseSync(sqlitePath());
  try {
    db.exec('PRAGMA busy_timeout = 5000;');
    ensureSchema(db);
    return operation(db);
  } finally {
    db.close();
  }
}

function ensureSchema(db: DatabaseSyncLike): void {
  db.exec(`
    create table if not exists prompt_events (
      id text primary key,
      created_at text not null,
      source text not null,
      text text not null,
      decision text not null,
      non_english_ratio real not null,
      english_count integer not null,
      non_english_count integer not null,
      reason text not null,
      coaching_shown integer not null default 0
    );

    create table if not exists learning_items (
      id text primary key,
      created_at text not null,
      next_review_at text not null,
      ease real not null default 2.5,
      review_count integer not null default 0,
      lapse_count integer not null default 0,
      interval_days integer not null default 1,
      last_reviewed_at text,
      original text not null,
      suggested text not null,
      scene text,
      tags text not null default '[]',
      pattern text,
      ipa text not null default '[]'
    );
  `);
  try {
    db.exec("alter table learning_items add column ipa text not null default '[]';");
  } catch {
    // Column already exists.
  }
  try {
    db.exec('alter table learning_items add column ease real not null default 2.5;');
  } catch {
    // Column already exists.
  }
  try {
    db.exec('alter table learning_items add column last_reviewed_at text;');
  } catch {
    // Column already exists.
  }
  try {
    db.exec('alter table learning_items add column review_count integer not null default 0;');
  } catch {
    // Column already exists.
  }
  try {
    db.exec('alter table learning_items add column lapse_count integer not null default 0;');
  } catch {
    // Column already exists.
  }
  try {
    db.exec('alter table learning_items add column interval_days integer not null default 1;');
  } catch {
    // Column already exists.
  }
}

function appendJsonLine(path: string, value: unknown): void {
  mkdirSync(getEnglishPilotHome(), { recursive: true });
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  writeFileSync(path, `${existing}${JSON.stringify(value)}\n`, 'utf8');
}

function readJsonLines<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface DatabaseSyncLike {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...values: unknown[]): unknown;
    all(): Array<Record<string, unknown>>;
  };
  close(): void;
}

function rowToPromptEvent(row: Record<string, unknown>): PromptEvent {
  return {
    id: String(row.id),
    createdAt: String(row.createdAt),
    source: row.source as PromptEvent['source'],
    text: String(row.text),
    decision: row.decision as PolicyDecision,
    nonEnglishRatio: Number(row.nonEnglishRatio),
    englishCount: Number(row.englishCount),
    nonEnglishCount: Number(row.nonEnglishCount),
    reason: String(row.reason),
    coachingShown: Boolean(row.coachingShown),
  };
}

function rowToLearningItem(row: Record<string, unknown>): LearningItem {
  return normalizeLearningItem({
    id: String(row.id),
    createdAt: String(row.createdAt),
    nextReviewAt: String(row.nextReviewAt),
    ease: Number(row.ease ?? 2.5),
    reviewCount: Number(row.reviewCount ?? 0),
    lapseCount: Number(row.lapseCount ?? 0),
    intervalDays: Number(row.intervalDays ?? 1),
    lastReviewedAt: row.lastReviewedAt == null ? undefined : String(row.lastReviewedAt),
    original: String(row.original),
    suggested: String(row.suggested),
    scene: row.scene == null ? undefined : String(row.scene),
    tags: parseTags(row.tags),
    pattern: row.pattern == null ? undefined : String(row.pattern),
    ipa: parseIpa(row.ipa),
  });
}

function normalizeLearningItem(item: LearningItem): LearningItem {
  const scheduling = normalizeReviewSchedulingState(item);
  return {
    ...item,
    ...scheduling,
  };
}

function parseTags(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : [];
}

function parseIpa(value: unknown): Array<{ word: string; ipa: string }> {
  if (typeof value !== 'string') return [];
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is { word: string; ipa: string } => isWordIpaEntry(entry));
}

function isWordIpaEntry(value: unknown): value is { word: string; ipa: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { word?: unknown }).word === 'string' &&
    typeof (value as { ipa?: unknown }).ipa === 'string'
  );
}
