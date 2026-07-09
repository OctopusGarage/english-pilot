import { buildPronunciationBite, suggestRewrite, type PronunciationEntry } from './coach.js';
import { listGlossaryEntries } from './glossary.js';

export interface ExtractedLesson {
  original: string;
  suggested: string;
  scene: string;
  tags: string[];
  pattern: string;
  keyPhrases: string[];
  ipa: PronunciationEntry[];
  reviewPrompt: string;
  worthRecording: boolean;
}

export interface DailyReviewItem {
  id: string;
  original: string;
  suggested: string;
  scene: string;
  ipa: PronunciationEntry[];
  reviewPrompt: string;
  nextReviewAt: string;
}

export interface DailyReviewPromptItem {
  id: string;
  original: string;
  scene: string;
  ipa: PronunciationEntry[];
  reviewPrompt: string;
  nextReviewAt: string;
}

export interface DailyReviewPack {
  date: string;
  items: DailyReviewItem[];
  markdown: string;
}

export interface DailyReviewCheck {
  answer: string;
  target: string;
  exact: boolean;
  missingWords: string[];
  extraWords: string[];
  feedback: string;
}

export interface ReviewableLearningItem {
  id: string;
  original: string;
  suggested: string;
  scene?: string;
  ipa?: PronunciationEntry[];
  nextReviewAt: string;
}

export function buildDailyReviewPack(
  items: ReviewableLearningItem[],
  date = new Date().toISOString().slice(0, 10),
): DailyReviewPack {
  const dueItems = items.filter((item) => item.nextReviewAt <= date);
  const reviewItems = buildDailyReviewItems(dueItems);
  return {
    date,
    items: reviewItems,
    markdown: formatDailyReviewPackMarkdown(date, reviewItems),
  };
}

export function extractLesson(text: string): ExtractedLesson {
  const suggested = suggestLessonRewrite(text);
  const keyPhrases = extractKeyPhrases(text, suggested);
  const glossaryIpa = buildGlossaryPronunciationBite(`${text} ${suggested}`);
  const scene = detectScene(text);
  const worthRecording = isWorthRecording(text, keyPhrases);
  return {
    original: text,
    suggested,
    scene,
    tags: buildTags(text, scene, keyPhrases),
    pattern: buildPattern(text, suggested),
    keyPhrases: worthRecording ? keyPhrases : [],
    ipa: worthRecording
      ? mergePronunciationBites(glossaryIpa, buildPronunciationBite(`${keyPhrases.join(' ')} ${suggested}`))
      : [],
    reviewPrompt: buildReviewPrompt(suggested),
    worthRecording,
  };
}

export function buildDailyReviewItems(items: ReviewableLearningItem[]): DailyReviewItem[] {
  return items.map((item) => ({
    id: item.id,
    original: item.original,
    suggested: item.suggested,
    scene: item.scene ?? 'general English practice',
    ipa: item.ipa ?? [],
    reviewPrompt: buildReviewPrompt(item.suggested),
    nextReviewAt: item.nextReviewAt,
  }));
}

export function buildDueDailyReviewItems(items: ReviewableLearningItem[], today = new Date()): DailyReviewPromptItem[] {
  const todayKey = today.toISOString().slice(0, 10);
  return items
    .filter((item) => item.nextReviewAt <= todayKey)
    .map((item) => ({
      id: item.id,
      original: item.original,
      scene: item.scene ?? 'general English practice',
      ipa: item.ipa ?? [],
      reviewPrompt: buildReviewPrompt(item.suggested),
      nextReviewAt: item.nextReviewAt,
    }));
}

export function buildDailyReviewAnswer(item: ReviewableLearningItem): DailyReviewItem {
  return buildDailyReviewItems([item])[0];
}

export function checkDailyReviewAnswer(item: ReviewableLearningItem, answer: string): DailyReviewCheck {
  const target = item.suggested;
  const answerWords = tokenizeAnswer(answer);
  const targetWords = tokenizeAnswer(target);
  const answerSet = new Set(answerWords);
  const targetSet = new Set(targetWords);
  const missingWords = uniqueWords(targetWords.filter((word) => !answerSet.has(word)));
  const extraWords = uniqueWords(answerWords.filter((word) => !targetSet.has(word)));
  const exact = normalizeAnswer(answer) === normalizeAnswer(target);
  return {
    answer,
    target,
    exact,
    missingWords,
    extraWords,
    feedback: buildAnswerFeedback(exact, missingWords, extraWords),
  };
}

export function buildReviewPrompt(suggested: string): string {
  return `How would you say this naturally in English? Target answer: "${suggested}"`;
}

function formatDailyReviewPackMarkdown(date: string, items: DailyReviewItem[]): string {
  const lines = [`# EnglishPilot Daily Review - ${date}`, ''];
  if (items.length === 0) {
    lines.push('No due review items.', '');
    return lines.join('\n');
  }

  items.forEach((item, index) => {
    lines.push(
      `## ${index + 1}. ${item.scene}`,
      '',
      `ID: ${item.id}`,
      `Review prompt: ${item.reviewPrompt}`,
      `Answer: ${item.suggested}`,
      `Original: ${item.original}`,
      `Next review: ${item.nextReviewAt}`,
      '',
      'IPA:',
      ...(item.ipa.length > 0 ? item.ipa.map((entry) => `- ${entry.word} ${entry.ipa}`) : ['- none']),
      '',
    );
  });

  return lines.join('\n');
}

function suggestLessonRewrite(text: string): string {
  if (isTrivialGreeting(text)) {
    return 'Hello.';
  }
  if (/threshold|阈值|强度/.test(text)) {
    return 'This threshold should support adjustable intensity later, while keeping the workflow sophisticated.';
  }
  return suggestRewrite(text);
}

function isTrivialGreeting(text: string): boolean {
  return /^(你好|您好|hello|hi|hey)[。.!！\s]*$/i.test(text.trim());
}

function detectScene(text: string): string {
  if (/threshold|阈值|强度|config|配置/.test(text)) return 'configuration discussion';
  if (/design|设计|refine|优化/.test(text)) return 'product design discussion';
  if (/review|回顾|复习/.test(text)) return 'review planning';
  return 'AI workflow discussion';
}

function extractKeyPhrases(text: string, suggested: string): string[] {
  const phrases: string[] = [];
  for (const word of Object.keys(KEYWORD_HINTS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text) || new RegExp(`\\b${word}\\b`, 'i').test(suggested)) {
      phrases.push(KEYWORD_HINTS[word]);
    }
  }
  for (const entry of listGlossaryEntries()) {
    if (containsTerm(`${text} ${suggested}`, entry.term)) {
      phrases.push(entry.term);
    }
  }
  return [...new Set(phrases)].slice(0, 4);
}

function isWorthRecording(text: string, keyPhrases: string[]): boolean {
  if (keyPhrases.length > 0) return true;
  if (/[A-Za-z]/.test(text) && /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text)) return true;
  return text.match(/[A-Za-z]+/g)?.some((word) => word.length >= 10) ?? false;
}

function buildTags(text: string, scene: string, keyPhrases: string[]): string[] {
  const tags = new Set<string>(['workplace-english']);
  if (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text)) tags.add('mixed-language');
  if (scene.includes('configuration')) tags.add('configuration');
  if (keyPhrases.length > 0) tags.add('vocabulary');
  return [...tags];
}

function buildPattern(text: string, suggested: string): string {
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

function buildGlossaryPronunciationBite(text: string): PronunciationEntry[] {
  return listGlossaryEntries()
    .filter((entry) => entry.ipa && containsTerm(text, entry.term))
    .map((entry) => ({ word: entry.term, ipa: entry.ipa as string }));
}

function mergePronunciationBites(primary: PronunciationEntry[], fallback: PronunciationEntry[]): PronunciationEntry[] {
  const seen = new Set<string>();
  const merged: PronunciationEntry[] = [];
  for (const entry of [...primary, ...fallback]) {
    const key = entry.word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
    if (merged.length >= 3) break;
  }
  return merged;
}

function containsTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

function normalizeAnswer(text: string): string {
  return tokenizeAnswer(text).join(' ');
}

function tokenizeAnswer(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function uniqueWords(words: string[]): string[] {
  return [...new Set(words)];
}

function buildAnswerFeedback(exact: boolean, missingWords: string[], extraWords: string[]): string {
  if (exact) return 'Exact match. You can mark this review as easy if it felt natural.';
  const parts: string[] = [];
  if (missingWords.length > 0) parts.push(`Missing words: ${missingWords.join(', ')}.`);
  if (extraWords.length > 0) parts.push(`Extra words: ${extraWords.join(', ')}.`);
  if (parts.length === 0) parts.push('Same words, but check the word order or punctuation against the target answer.');
  parts.push('Compare your answer with the target, then mark the review based on recall effort.');
  return parts.join(' ');
}
