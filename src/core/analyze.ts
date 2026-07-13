import type { AnalysisResult, EnglishPilotPolicy } from './types.js';

const CODE_BLOCK_RE = /```[\s\S]*?```/g;
const TILDE_CODE_BLOCK_RE = /~~~[\s\S]*?~~~/g;
const INLINE_CODE_RE = /`[^`]*`/g;
const MARKDOWN_LINK_RE = /\[[^\]]*]\([^)]*\)/g;
const URL_RE = /https?:\/\/\S+/g;
const TAG_RE = /<[^>]*>/g;
const PATH_TOKEN_RE = /(?:(?:[A-Za-z]:)?[/~][^\s]+|(?:\.\.?\/)[^\s]+|[^\s]+\.[A-Za-z0-9]{1,8})/g;
const ENGLISH_RE = /[A-Za-z]/g;
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const CJK_RUN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
const REFERENCE_LABEL_RE =
  /^\s{0,3}(?:issue|description|feedback|logs?|errors?|stack trace|trace|quoted text|original text|原文|反馈|日志|错误|问题|描述)\s*[:：]\s*$/i;
const LOG_LINE_RE =
  /^\s*(?:\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}|\[[^\]]*(?:error|warn|info|debug|trace)[^\]]*]|\b(?:ERROR|WARN|INFO|DEBUG|TRACE)\b|at\s+\S+\s+\()/i;
const TRIPLE_QUOTE_BLOCK_RE = /("""|''')[\s\S]*?\1/g;

export function sanitizeNarrative(text: string, policy: EnglishPilotPolicy): string {
  let sanitized = text
    .replace(CODE_BLOCK_RE, ' ')
    .replace(TILDE_CODE_BLOCK_RE, ' ')
    .replace(INLINE_CODE_RE, ' ')
    .replace(MARKDOWN_LINK_RE, ' ')
    .replace(TAG_RE, ' ');

  if (policy.ignoreCodePathsUrls) {
    sanitized = sanitized.replace(URL_RE, ' ').replace(PATH_TOKEN_RE, ' ');
  }

  return stripReferencedMaterial(sanitized);
}

export function analyzeText(text: string, policy: EnglishPilotPolicy, allowedTerms: string[] = []): AnalysisResult {
  const rawSanitizedText = sanitizeNarrative(text, policy);
  const englishLeadingViolation = policy.preferEnglishLeading && startsWithCjkNarrative(rawSanitizedText);
  const glossarySanitizedText = stripAllowedTerms(rawSanitizedText, allowedTerms);
  const ignoredNonEnglishFragments = collectIgnoredShortCjkFragments(
    glossarySanitizedText,
    policy.ignoreShortCjkFragmentsUnder,
  );
  const sanitizedText = stripShortCjkFragments(glossarySanitizedText, policy.ignoreShortCjkFragmentsUnder);
  const englishCount = sanitizedText.match(ENGLISH_RE)?.length ?? 0;
  const nonEnglishCount = sanitizedText.match(CJK_RE)?.length ?? 0;
  const countedLetters = englishCount + nonEnglishCount;
  const nonEnglishRatio = countedLetters === 0 ? 0 : nonEnglishCount / countedLetters;
  const awkwardEnglish = hasAwkwardEnglish(rawSanitizedText);
  const coachingSignals = [
    ...(ignoredNonEnglishFragments.length > 0 ? ['short-non-English-fragment'] : []),
    ...(awkwardEnglish ? ['awkward-English-pattern'] : []),
  ];
  const signalFields = {
    ...(ignoredNonEnglishFragments.length > 0 ? { ignoredNonEnglishFragments } : {}),
    ...(coachingSignals.length > 0 ? { coachingSignals } : {}),
  };

  if (countedLetters === 0) {
    return {
      decision: 'ALLOW_SILENT',
      englishCount,
      nonEnglishCount,
      countedLetters,
      nonEnglishRatio,
      reason: 'No narrative language detected after sanitization.',
      sanitizedText,
      ...signalFields,
    };
  }

  if (englishLeadingViolation) {
    return {
      decision: 'BLOCK',
      englishCount,
      nonEnglishCount,
      countedLetters,
      nonEnglishRatio,
      reason: 'The prompt is not English-leading.',
      sanitizedText,
      ...signalFields,
    };
  }

  if (nonEnglishRatio > policy.maxChineseRatio) {
    return {
      decision: 'BLOCK',
      englishCount,
      nonEnglishCount,
      countedLetters,
      nonEnglishRatio,
      reason: 'Non-English narrative text exceeds the configured ratio.',
      sanitizedText,
      ...signalFields,
    };
  }

  if (nonEnglishCount > 0 && nonEnglishRatio > policy.targetChineseRatio) {
    return {
      decision: 'ALLOW_WITH_COACHING',
      englishCount,
      nonEnglishCount,
      countedLetters,
      nonEnglishRatio,
      reason: 'English remains dominant and the non-English ratio is above the coaching target but within policy.',
      sanitizedText,
      ...signalFields,
    };
  }

  if (policy.coachingIntensity === 'force' && coachingSignals.length > 0) {
    return {
      decision: 'ALLOW_WITH_COACHING',
      englishCount,
      nonEnglishCount,
      countedLetters,
      nonEnglishRatio,
      reason: 'Force coaching is enabled and the prompt has a teachable wording signal.',
      sanitizedText,
      ...signalFields,
    };
  }

  return {
    decision: 'ALLOW_SILENT',
    englishCount,
    nonEnglishCount,
    countedLetters,
    nonEnglishRatio,
    reason:
      nonEnglishCount > 0
        ? 'English remains dominant and the non-English ratio is within the target ratio.'
        : 'English-only narrative text.',
    sanitizedText,
    ...signalFields,
  };
}

function stripAllowedTerms(text: string, allowedTerms: string[]): string {
  return allowedTerms.reduce((next, term) => {
    if (!term.trim()) return next;
    return next.replace(new RegExp(escapeRegExp(term), 'gi'), ' ');
  }, text);
}

function stripReferencedMaterial(text: string): string {
  const stripped = stripLineReferencedMaterial(text).replace(TRIPLE_QUOTE_BLOCK_RE, ' ');
  return hasEnglishLetter(stripped) ? stripped : text;
}

function stripLineReferencedMaterial(text: string): string {
  const lines = text.split('\n');
  const stripped: string[] = [];
  let skippingReferenceBlock = false;

  for (const line of lines) {
    if (isBlankLine(line)) {
      skippingReferenceBlock = false;
      stripped.push(line);
      continue;
    }

    if (skippingReferenceBlock || isMarkdownBlockQuote(line) || isIndentedCodeLine(line) || LOG_LINE_RE.test(line)) {
      stripped.push(' ');
      continue;
    }

    if (REFERENCE_LABEL_RE.test(line)) {
      skippingReferenceBlock = true;
      stripped.push(' ');
      continue;
    }

    stripped.push(line);
  }

  return stripped.join('\n');
}

function isBlankLine(line: string): boolean {
  return line.trim().length === 0;
}

function isMarkdownBlockQuote(line: string): boolean {
  return /^\s{0,3}>\s?/.test(line);
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?: {4}|\t)\S/.test(line);
}

function startsWithCjkNarrative(text: string): boolean {
  for (const char of text) {
    if (/[A-Za-z]/.test(char)) return false;
    if (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(char)) return true;
  }
  return false;
}

function stripShortCjkFragments(text: string, threshold: number): string {
  if (threshold <= 0) return text;
  if (!ENGLISH_RE.test(text)) return text;
  ENGLISH_RE.lastIndex = 0;
  const fragments = text.match(CJK_RUN_RE) ?? [];
  if (fragments.length > 1) return text;
  return text.replace(CJK_RUN_RE, (fragment) => {
    return fragment.length < threshold ? ' ' : fragment;
  });
}

function collectIgnoredShortCjkFragments(text: string, threshold: number): string[] {
  if (threshold <= 0) return [];
  if (!hasEnglishLetter(text)) return [];
  const fragments = text.match(CJK_RUN_RE) ?? [];
  if (fragments.length !== 1) return [];
  return fragments.filter((fragment) => fragment.length < threshold);
}

function hasEnglishLetter(text: string): boolean {
  return /[A-Za-z]/.test(text);
}

function hasAwkwardEnglish(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, ' ');
  return [
    /\bwhat(?:'s| is)\s+the\s+weather\s+about\b/i,
    /\bseem\s+so\b/i,
    /\bi\s+want\s+create\b/i,
    /\bhow\s+to\s+say\s+.+\s+in\s+english\b/i,
  ].some((pattern) => pattern.test(normalized));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
