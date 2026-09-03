import { readFileSync, statSync } from 'node:fs';
import type { EnglishPilotConfig } from './types.js';

export interface AssistantNoteDomainReference {
  style: EnglishPilotConfig['assistantEnglishNoteStyle'];
  available: boolean;
  terms: string[];
  examples: string[];
  missingPaths: string[];
}

const MAX_TERMS = 12;

const SOFTWARE_ENGINEERING_EXAMPLES = [
  'append an English note at the end',
  'keep the behavior behind a small interface',
  'make the failure path explicit',
  'cache the result to avoid repeating the same expensive operation',
  'this change belongs at the module boundary',
];

const PART_OF_SPEECH_TAGS = new Set(['adj', 'adv', 'noun', 'n', 'verb', 'v']);

export function loadAssistantNoteDomainReference(input: {
  style: EnglishPilotConfig['assistantEnglishNoteStyle'];
  paths: string[];
}): AssistantNoteDomainReference {
  if (input.style === 'general') {
    return {
      style: 'general',
      available: false,
      terms: [],
      examples: [],
      missingPaths: [],
    };
  }

  const missingPaths: string[] = [];
  const terms: string[] = [];
  const seen = new Set<string>();

  for (const path of input.paths) {
    const text = readReferenceFile(path);
    if (text === undefined) {
      missingPaths.push(path);
      continue;
    }

    if (terms.length >= MAX_TERMS) continue;

    for (const term of extractTechnologyTerms(text)) {
      const normalized = normalizeTerm(term);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      terms.push(normalized);
      if (terms.length >= MAX_TERMS) break;
    }
  }

  return {
    style: 'software-engineering',
    available: terms.length > 0,
    terms,
    examples: SOFTWARE_ENGINEERING_EXAMPLES,
    missingPaths,
  };
}

function readReferenceFile(path: string): string | undefined {
  try {
    if (!statSync(path).isFile()) return undefined;
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

export function buildAssistantNoteDomainGuidance(reference: AssistantNoteDomainReference): string {
  if (reference.style === 'general') {
    return 'Prefer practical workplace English, brief teaching rationale, and reusable expressions.';
  }

  const terms = reference.terms.length > 0 ? `Vocabulary hints: ${reference.terms.slice(0, 8).join(', ')}.` : '';
  return [
    'For programming-task conversations, prefer software-engineering English in the final note.',
    `Good sentence patterns: ${reference.examples.join('; ')}.`,
    'Use the configured computer-English files as vocabulary hints, not as text to quote every time.',
    terms,
  ]
    .filter(Boolean)
    .join(' ');
}

function extractTechnologyTerms(text: string): string[] {
  const terms: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const colon = line.match(/^[-+*]?\s*([A-Za-z][A-Za-z0-9+_.#/-]*(?:\s+[A-Za-z][A-Za-z0-9+_.#/-]*){0,3})\s*[:：]/);
    if (colon) {
      terms.push(colon[1] as string);
      continue;
    }

    const plus = line.match(/^\+\s*([A-Za-z][A-Za-z0-9+_.#/-]*(?:\s+[A-Za-z][A-Za-z0-9+_.#/-]*){0,3})\b/);
    if (plus) terms.push(plus[1] as string);
  }

  return terms;
}

function normalizeTerm(term: string): string {
  const normalized = term
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-z]+|[^A-Za-z0-9+_.#/\s-]+$/g, '')
    .trim();
  const words = normalized.split(' ');
  const lastWord = words.at(-1)?.replace(/\.$/, '').toLowerCase();

  if (lastWord && PART_OF_SPEECH_TAGS.has(lastWord)) {
    return words.slice(0, -1).join(' ');
  }

  return normalized;
}
