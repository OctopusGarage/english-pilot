import type { GlossaryEntry } from './glossary.js';
import { suggestPatternRewrite } from './pattern-rewrite.js';
import { lookupPronunciations, type PronunciationEntry } from './pronunciation.js';

export type TranslationSelectionKind = 'word' | 'phrase' | 'sentence';

export interface TranslationRequest {
  requestId: string;
  text: string;
  source: string;
  context?: string;
}

export interface LocalTranslationResult {
  original: string;
  normalized: string;
  kind: TranslationSelectionKind;
  translation?: string;
  pronunciation?: string;
  partOfSpeech?: string;
  explanation: string;
  examples: string[];
  collocations: string[];
  ipa: Array<{ word: string; ipa: string }>;
  lesson: {
    suggested: string;
    scene: string;
    pattern: string;
    tags: string[];
    worthRecording: boolean;
  };
}

interface BuiltInVocabularyEntry {
  lemma: string;
  translation: string;
  pronunciation?: string;
  partOfSpeech?: string;
  explanation: string;
  examples: string[];
  collocations: string[];
}

interface LocalPhraseResult {
  translation: string;
  explanation: string;
  examples: string[];
  collocations: string[];
}

interface TranslationStageResponseBase {
  requestId: string;
  source: string;
  stage: 'local' | 'agent';
}

export interface LoadingTranslationStageResponse extends TranslationStageResponseBase {
  status: 'loading';
  result?: never;
  error?: never;
}

export interface ReadyTranslationStageResponse extends TranslationStageResponseBase {
  status: 'ready';
  result: LocalTranslationResult;
  error?: never;
}

export interface ErrorTranslationStageResponse {
  requestId?: string;
  source?: string;
  stage: 'local';
  status: 'error';
  result?: never;
  error: {
    code: string;
    message: string;
  };
}

export type TranslationStageResponse =
  LoadingTranslationStageResponse | ReadyTranslationStageResponse | ErrorTranslationStageResponse;

export function buildLocalTranslationResult(text: string, glossary: GlossaryEntry[]): LocalTranslationResult {
  const original = text.trim().replace(/\s+/g, ' ');
  if (!original) throw new Error('Selected text must not be empty.');

  const normalized = normalizeSelection(original);
  if (!normalized || !/[\p{L}\p{N}]/u.test(normalized)) {
    throw new Error('Selected text must not be empty.');
  }

  const kind = classifySelection(original);
  const matchingGlossary = glossary.find((entry) => entry.term.toLowerCase() === normalized.toLowerCase());
  const builtInVocabulary = kind === 'word' && !matchingGlossary ? lookupBuiltInVocabulary(normalized) : undefined;
  const localPhrase = !matchingGlossary && kind !== 'word' ? lookupLocalPhrase(normalized) : undefined;
  const phraseVocabulary = kind !== 'word' ? lookupVocabularyInText(normalized) : [];
  const pronunciations = lookupPronunciations(original);
  const ipa = mergePronunciationEntries(buildGlossaryPronunciationBite(original, glossary), [
    ...(builtInVocabulary?.pronunciation
      ? [{ word: builtInVocabulary.lemma, ipa: builtInVocabulary.pronunciation }]
      : []),
    ...phraseVocabulary.flatMap((entry) =>
      entry.pronunciation ? [{ word: entry.lemma, ipa: entry.pronunciation }] : [],
    ),
    ...pronunciations.entries.map(({ word, ipa: pronunciation }) => ({ word, ipa: pronunciation })),
  ]);
  const lesson = buildLocalLesson(original, glossary);
  const translation = matchingGlossary?.meaning ?? builtInVocabulary?.translation ?? localPhrase?.translation;
  const pronunciation = matchingGlossary?.ipa ?? builtInVocabulary?.pronunciation ?? ipa[0]?.ipa;
  const examples = mergeTextLists(builtInVocabulary?.examples ?? [], localPhrase?.examples ?? []);
  const collocations = mergeTextLists(
    builtInVocabulary?.collocations ?? [],
    localPhrase?.collocations ?? [],
    phraseVocabulary.flatMap((entry) => entry.collocations),
  );

  return {
    original,
    normalized,
    kind,
    ...(translation ? { translation } : {}),
    ...(pronunciation ? { pronunciation } : {}),
    ...(kind === 'word' && builtInVocabulary?.partOfSpeech ? { partOfSpeech: builtInVocabulary.partOfSpeech } : {}),
    explanation: matchingGlossary?.meaning
      ? `Local glossary entry for "${normalized}".`
      : builtInVocabulary
        ? builtInVocabulary.explanation
        : localPhrase
          ? localPhrase.explanation
          : phraseVocabulary.length > 0
            ? buildVocabularyHintExplanation(phraseVocabulary)
            : 'EnglishPilot prepared a local learning result; richer translation can be added by agent enrichment.',
    examples,
    collocations,
    ipa,
    lesson,
  };
}

function lookupBuiltInVocabulary(word: string): BuiltInVocabularyEntry | undefined {
  const lemma = normalizeVocabularyLemma(word);
  const entry = BUILT_IN_VOCABULARY[lemma];
  if (!entry) return undefined;
  return { lemma, ...entry };
}

function lookupVocabularyInText(text: string): BuiltInVocabularyEntry[] {
  const entries: BuiltInVocabularyEntry[] = [];
  const seen = new Set<string>();
  for (const rawWord of text.match(/[a-z]+/giu) ?? []) {
    const entry = lookupBuiltInVocabulary(rawWord);
    if (!entry || seen.has(entry.lemma)) continue;
    seen.add(entry.lemma);
    entries.push(entry);
  }
  return entries;
}

function lookupLocalPhrase(normalized: string): LocalPhraseResult | undefined {
  if (/\bexacerbates?\s+the\s+architectural\s+friction\b/i.test(normalized)) {
    return {
      translation: '这会加剧架构层面的摩擦。',
      explanation: 'Here, "exacerbates" means the situation makes the existing architectural friction worse.',
      examples: ['This exacerbates the architectural friction.', 'A rushed abstraction can exacerbate the problem.'],
      collocations: ['exacerbate architectural friction', 'architectural friction', 'make the issue worse'],
    };
  }
  if (/\btell\s+the\s+model\s+what\s+to\s+do\s+differently\b/i.test(normalized)) {
    return {
      translation: '告诉模型应该做出哪些不同的处理。',
      explanation:
        'Use this when you want to give corrective instructions after the model produced an unsatisfactory result.',
      examples: [
        'Tell the model what to do differently.',
        'Be specific: tell the model what to change, what to keep, and what output you expect.',
      ],
      collocations: ['tell the model what to do differently', 'give corrective instructions', 'revise the prompt'],
    };
  }
  return undefined;
}

function normalizeVocabularyLemma(word: string): string {
  const lower = word.toLowerCase();
  if (BUILT_IN_VOCABULARY[lower]) return lower;

  const candidates = [
    lower.replace(/ies$/, 'y'),
    lower.replace(/ied$/, 'y'),
    lower.replace(/ing$/, ''),
    lower.replace(/ing$/, 'e'),
    lower.replace(/ed$/, ''),
    lower.replace(/ed$/, 'e'),
    lower.replace(/es$/, ''),
    lower.replace(/s$/, ''),
  ].filter((candidate) => candidate && candidate !== lower);

  return candidates.find((candidate) => BUILT_IN_VOCABULARY[candidate]) ?? lower;
}

function buildVocabularyHintExplanation(entries: BuiltInVocabularyEntry[]): string {
  const hints = entries
    .slice(0, 3)
    .map((entry) => `${entry.lemma}: ${entry.translation}`)
    .join('; ');
  return `Local vocabulary hints: ${hints}.`;
}

function mergeTextLists(...lists: string[][]): string[] {
  return [...new Set(lists.flat())].slice(0, 8);
}

function classifySelection(text: string): TranslationSelectionKind {
  if (/[.!?]$/.test(text) || text.split(/[.!?]+/).filter(Boolean).length > 1) return 'sentence';
  return text.split(/\s+/).length === 1 ? 'word' : 'phrase';
}

function normalizeSelection(text: string): string {
  return text
    .replace(/^[("'`]+|[)"'`,.!?]+$/g, '')
    .trim()
    .toLowerCase();
}

function buildLocalLesson(text: string, glossary: GlossaryEntry[]): LocalTranslationResult['lesson'] {
  const suggested = suggestLocalLesson(text);
  const keyPhrases = extractLocalKeyPhrases(text, suggested, glossary);
  const scene = detectLocalScene(text);

  return {
    suggested,
    scene,
    pattern: buildLocalPattern(text, suggested),
    tags: buildLocalTags(text, scene, keyPhrases),
    worthRecording: isWorthRecording(text, keyPhrases),
  };
}

function suggestLocalLesson(text: string): string {
  const patternRewrite = suggestPatternRewrite(text);
  if (patternRewrite) return patternRewrite;
  if (/^(你好|您好|hello|hi|hey)[。.!！\s]*$/i.test(text.trim())) return 'Hello.';
  if (/threshold|阈值|强度/.test(text)) {
    return 'This threshold should support adjustable intensity later, while keeping the workflow sophisticated.';
  }
  return text;
}

function extractLocalKeyPhrases(text: string, suggested: string, glossary: GlossaryEntry[]): string[] {
  const phrases: string[] = [];
  for (const word of Object.keys(KEYWORD_HINTS)) {
    if (containsTerm(text, word) || containsTerm(suggested, word)) phrases.push(KEYWORD_HINTS[word]);
  }
  for (const entry of glossary) {
    if (containsTerm(`${text} ${suggested}`, entry.term)) phrases.push(entry.term);
  }
  return [...new Set(phrases)].slice(0, 4);
}

function isWorthRecording(text: string, keyPhrases: string[]): boolean {
  if (keyPhrases.length > 0) return true;
  if (/[A-Za-z]/.test(text) && /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text)) return true;
  return text.match(/[A-Za-z]+/g)?.some((word) => word.length >= 10) ?? false;
}

function buildLocalTags(text: string, scene: string, keyPhrases: string[]): string[] {
  const tags = new Set<string>(['workplace-english']);
  if (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text)) tags.add('mixed-language');
  if (scene.includes('configuration')) tags.add('configuration');
  if (keyPhrases.length > 0) tags.add('vocabulary');
  return [...tags];
}

function detectLocalScene(text: string): string {
  if (/threshold|阈值|强度|config|配置/.test(text)) return 'configuration discussion';
  if (/design|设计|refine|优化/.test(text)) return 'product design discussion';
  if (/review|回顾|复习/.test(text)) return 'review planning';
  return 'AI workflow discussion';
}

function buildLocalPattern(text: string, suggested: string): string {
  if (/threshold|阈值|强度/.test(text)) {
    return 'This threshold should support adjusting + noun/adjective + later.';
  }
  if (/design|设计|refine|优化/.test(text) || /design|refine/.test(suggested)) {
    return 'Let us think through how to + verb ...';
  }
  return 'State the main request in English, then keep only hard-to-translate terms in Chinese.';
}

const KEYWORD_HINTS: Record<string, string> = {
  threshold: 'threshold',
  sophisticated: 'sophisticated workflow',
  workflow: 'workflow',
  intensity: 'adjustable intensity',
  pronunciation: 'pronunciation',
  calibration: 'calibration',
};

const BUILT_IN_VOCABULARY: Record<string, Omit<BuiltInVocabularyEntry, 'lemma'>> = {
  exacerbate: {
    translation: '使恶化；加剧',
    pronunciation: '/ɪɡˈzæsərbeɪt/',
    partOfSpeech: 'verb',
    explanation: 'To make a problem, conflict, or bad situation worse.',
    examples: ['This exacerbates the problem.', 'Poor logging can exacerbate debugging delays.'],
    collocations: ['exacerbate a problem', 'exacerbate the issue', 'exacerbate tensions'],
  },
  freshness: {
    translation: '新鲜度；新近程度',
    pronunciation: '/ˈfreʃnəs/',
    partOfSpeech: 'noun',
    explanation: 'The quality of being new, recent, or not stale.',
    examples: ['Cache freshness matters for this lookup.', 'The freshness of the data affects the result.'],
    collocations: ['cache freshness', 'data freshness', 'content freshness'],
  },
  workflow: {
    translation: '工作流程',
    pronunciation: '/ˈwɝːkfloʊ/',
    partOfSpeech: 'noun',
    explanation: 'A sequence of steps used to complete a task or process.',
    examples: ['This workflow should stay fast.', 'The review workflow runs before release.'],
    collocations: ['development workflow', 'approval workflow', 'automated workflow'],
  },
  friction: {
    translation: '阻力；摩擦；协作成本',
    pronunciation: '/ˈfrɪkʃn/',
    partOfSpeech: 'noun',
    explanation: 'Difficulty or resistance that slows down work, communication, or progress.',
    examples: ['This creates architectural friction.', 'The extra step adds workflow friction.'],
    collocations: ['architectural friction', 'workflow friction', 'reduce friction'],
  },
};

function buildGlossaryPronunciationBite(text: string, glossary: GlossaryEntry[]): PronunciationEntry[] {
  return glossary
    .filter((entry) => entry.ipa && containsTerm(text, entry.term))
    .map((entry) => ({ word: entry.term, ipa: entry.ipa as string }));
}

function mergePronunciationEntries(
  primary: PronunciationEntry[],
  fallback: PronunciationEntry[],
): PronunciationEntry[] {
  const seen = new Set<string>();
  const merged: PronunciationEntry[] = [];
  for (const entry of [...primary, ...fallback]) {
    const key = entry.word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
    if (merged.length >= 8) break;
  }
  return merged;
}

function containsTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (/^[A-Za-z0-9]+$/.test(term)) return new RegExp(`\\b${escaped}\\b`, 'iu').test(text);
  return text.toLocaleLowerCase().includes(term.toLocaleLowerCase());
}
