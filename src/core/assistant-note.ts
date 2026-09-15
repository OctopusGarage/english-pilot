import type { LearningItemDraft } from './learning-card.js';

export interface AssistantEnglishNote {
  original: string;
  suggested: string;
  why?: string;
  ipa?: Array<{ word: string; ipa: string }>;
}

export type AssistantEnglishNoteSource = 'claude' | 'codex' | 'feishu' | 'wechat';

export function extractLastAssistantEnglishNote(text: string): AssistantEnglishNote | undefined {
  const marker = findLastEnglishNoteMarker(text);
  if (marker < 0) return undefined;

  const note = text.slice(marker);
  if (hasRichShapedLabel(note)) return parseRichEnglishNote(note);
  return parseRichEnglishNote(note) ?? parseCompactEnglishNote(note);
}

function parseCompactEnglishNote(note: string): AssistantEnglishNote | undefined {
  const match = note.match(
    /English note:\s*["“]?([\s\S]*?)["”]?\s*(?:->|→)\s*["“]?([\s\S]*?)(?=(?:\n|;)\s*(?:Why|IPA)\s*:|$)/i,
  );
  if (!match) return undefined;

  const original = normalizeNoteText(match[1] ?? '');
  const suggested = normalizeNoteText(match[2] ?? '');
  if (
    !original ||
    !suggested ||
    startsWithSectionLabel(original) ||
    normalizeForComparison(original) === normalizeForComparison(suggested)
  )
    return undefined;

  const why = extractSection(note, 'Why');
  const ipa = parseIpaLine(extractSection(note, 'IPA'));

  return {
    original,
    suggested,
    ...(why ? { why: normalizeNoteText(why) } : {}),
    ...(ipa.length > 0 ? { ipa } : {}),
  };
}

function parseRichEnglishNote(note: string): AssistantEnglishNote | undefined {
  const original = normalizeNoteText(extractSection(note, 'Original') ?? '');
  const suggested = normalizeRichSuggested(extractSection(note, 'Better') ?? '');

  if (!original || !suggested || normalizeForComparison(original) === normalizeForComparison(suggested))
    return undefined;

  const why = extractSection(note, 'Why');
  const ipa = parseIpaLine(extractSection(note, 'IPA'));

  return {
    original,
    suggested,
    ...(why ? { why: normalizeNoteText(why) } : {}),
    ...(ipa.length > 0 ? { ipa } : {}),
  };
}

export function buildAssistantEnglishNoteLearningItem(
  source: AssistantEnglishNoteSource,
  note: AssistantEnglishNote,
): LearningItemDraft {
  return {
    original: note.original,
    suggested: note.suggested,
    scene: `${assistantNoteSourceLabel(source)} assistant English note`,
    tags: ['assistant-note', source],
    pattern: note.why ?? 'Review the suggested expression and reuse it in a similar work conversation.',
    ...(note.ipa && note.ipa.length > 0 ? { ipa: note.ipa } : {}),
  };
}

function assistantNoteSourceLabel(source: AssistantEnglishNoteSource): string {
  if (source === 'claude') return 'Claude';
  if (source === 'codex') return 'Codex';
  if (source === 'feishu') return 'Feishu';
  return 'WeChat';
}

function findLastEnglishNoteMarker(text: string): number {
  const matches = [...text.matchAll(/(?:^|\n)\s*(?:\*\*)?English note(?:\*\*)?\s*:/gi)];
  if (matches.length === 0) return -1;
  return matches[matches.length - 1]?.index ?? -1;
}

const SECTION_LABELS = [
  'Original',
  'Better',
  'Why',
  'Useful patterns',
  'Collocations',
  'Common mistake',
  'Practice sentence',
  'IPA',
] as const;

const RICH_SHAPED_LABELS = SECTION_LABELS.filter((label) => label !== 'Why' && label !== 'IPA');

function hasRichShapedLabel(note: string): boolean {
  const labels = RICH_SHAPED_LABELS.map(escapeRegExp).join('|');
  return new RegExp(
    `(?:^|[\\n;])\\s*(?:${labels})\\s*:|(?:^|\\n)\\s*(?:\\*\\*)?English note(?:\\*\\*)?\\s*:\\s*(?:${labels})\\s*:`,
    'i',
  ).test(note);
}

function startsWithSectionLabel(text: string): boolean {
  const labels = SECTION_LABELS.map(escapeRegExp).join('|');
  return new RegExp(`^(?:${labels})\\s*:`, 'i').test(text);
}

function extractSection(note: string, label: (typeof SECTION_LABELS)[number]): string | undefined {
  const stopLabels = SECTION_LABELS.filter((candidate) => candidate !== label)
    .map(escapeRegExp)
    .join('|');
  const pattern = new RegExp(
    `(?:^|[\\n;])\\s*${escapeRegExp(label)}\\s*:\\s*([\\s\\S]*?)(?=(?:\\n|;)\\s*(?:${stopLabels})\\s*:|$)`,
    'i',
  );
  const match = note.match(pattern);
  return match?.[1];
}

function parseIpaLine(value: string | undefined): Array<{ word: string; ipa: string }> {
  if (!value) return [];
  const entries: Array<{ word: string; ipa: string }> = [];
  for (const match of value.matchAll(/([A-Za-z][A-Za-z'-]*)\s+(\/[^/\n]+\/)/g)) {
    entries.push({ word: match[1] as string, ipa: match[2] as string });
    if (entries.length >= 3) break;
  }
  return entries;
}

function normalizeNoteText(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .trim();
}

function normalizeRichSuggested(text: string): string {
  return normalizeNoteText(text).replace(/"\s*\/\s*"/g, ' / ');
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
