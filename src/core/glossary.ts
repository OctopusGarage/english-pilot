import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { getEnglishPilotHome, loadConfig } from './config.js';

export interface GlossaryEntry {
  term: string;
  ipa?: string;
  meaning?: string;
  tags: string[];
  allowTerm: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GlossaryEntryDraft {
  term: string;
  ipa?: string;
  meaning?: string;
  tags?: string[];
  allowTerm?: boolean;
}

export function getGlossaryPath(): string {
  const configured = loadConfig().glossaryPath;
  if (!configured || configured === '~/.english-pilot/glossary.json') {
    return join(getEnglishPilotHome(), 'glossary.json');
  }
  if (configured.startsWith('~/')) return join(homedir(), configured.slice(2));
  return configured;
}

export function listGlossaryEntries(): GlossaryEntry[] {
  const path = getGlossaryPath();
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isGlossaryEntry).map((entry) => ({
    ...entry,
    allowTerm: entry.allowTerm ?? false,
  }));
}

export function upsertGlossaryEntry(draft: GlossaryEntryDraft): GlossaryEntry {
  const now = new Date().toISOString();
  const term = draft.term.trim();
  const entries = listGlossaryEntries();
  const existing = entries.find((entry) => entry.term.toLowerCase() === term.toLowerCase());
  const next: GlossaryEntry = {
    term,
    ipa: draft.ipa,
    meaning: draft.meaning,
    tags: draft.tags ?? existing?.tags ?? [],
    allowTerm: draft.allowTerm ?? existing?.allowTerm ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  writeGlossaryEntries(
    [...entries.filter((entry) => entry.term.toLowerCase() !== term.toLowerCase()), next].sort((a, b) =>
      a.term.localeCompare(b.term),
    ),
  );
  return next;
}

export function removeGlossaryEntry(term: string): boolean {
  const normalized = term.trim().toLowerCase();
  const entries = listGlossaryEntries();
  const next = entries.filter((entry) => entry.term.toLowerCase() !== normalized);
  writeGlossaryEntries(next);
  return next.length !== entries.length;
}

function writeGlossaryEntries(entries: GlossaryEntry[]): void {
  const path = getGlossaryPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}

function isGlossaryEntry(value: unknown): value is GlossaryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as {
    term?: unknown;
    tags?: unknown;
    allowTerm?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };
  return (
    typeof entry.term === 'string' &&
    Array.isArray(entry.tags) &&
    entry.tags.every((tag) => typeof tag === 'string') &&
    (entry.allowTerm === undefined || typeof entry.allowTerm === 'boolean') &&
    typeof entry.createdAt === 'string' &&
    typeof entry.updatedAt === 'string'
  );
}
