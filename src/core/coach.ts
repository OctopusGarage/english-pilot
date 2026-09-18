import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import { loadConfig } from './config.js';
import { suggestPatternRewrite } from './pattern-rewrite.js';
import { buildPronunciationBite, type PronunciationEntry } from './pronunciation.js';

export interface LearningSuggestion {
  suggested: string;
  pattern: string;
  scene: string;
  tags: string[];
  ipa: PronunciationEntry[];
}

export type RewriteCandidateSource = 'pattern' | 'local-provider' | 'fallback';

export interface RewriteCandidate {
  text: string;
  source: RewriteCandidateSource;
  displayable: boolean;
  reason?: string;
}

export function suggestLearningItem(original: string): LearningSuggestion {
  const suggested = suggestRewrite(original);
  return {
    suggested,
    pattern: 'State the main request in English, then keep only hard-to-translate terms in Chinese.',
    scene: 'AI workflow discussion',
    tags: ['mixed-language', 'workplace-english'],
    ipa: buildPronunciationBite(suggested),
  };
}

export function suggestRewrite(original: string): string {
  const candidate = suggestRewriteCandidate(original);
  return candidate.displayable
    ? candidate.text
    : 'Please restate this request in natural English while preserving the original intent.';
}

export function suggestRewriteCandidate(original: string): RewriteCandidate {
  const patternRewrite = suggestPatternRewrite(original);
  if (patternRewrite) return displayableCandidate(patternRewrite, 'pattern');

  const localRewrite = translateWithLocalProvider(original);
  if (localRewrite) return displayableCandidate(localRewrite, 'local-provider');

  return {
    text: 'Please restate this request in natural English while preserving the original intent.',
    source: 'fallback',
    displayable: false,
    reason: 'No reliable rewrite source produced a displayable English expression.',
  };
}

function translateWithLocalProvider(original: string): string | undefined {
  const config = resolveRewriteConfig();
  const python = resolveArgosPython(config.argosPython);
  if (config.backend !== 'argos' && !process.env.ARGOS_TRANSLATE_PYTHON) return undefined;
  if (!python) return undefined;

  const result = spawnSync(
    python,
    [
      '-c',
      [
        'import sys',
        'import argostranslate.translate',
        'text = sys.stdin.read().strip()',
        'print(argostranslate.translate.translate(text, "zh", "en"))',
      ].join('\n'),
    ],
    {
      input: original,
      encoding: 'utf8',
      timeout: config.timeoutMs,
      maxBuffer: 1024 * 1024,
    },
  );

  if (result.error || result.status !== 0) return undefined;
  const translated = result.stdout.trim().replace(/\s+/g, ' ');
  if (!translated || /[\u4e00-\u9fff]/.test(translated)) return undefined;
  const punctuated = ensureSentencePunctuation(translated);
  return isDisplayableLocalRewrite(punctuated) ? punctuated : undefined;
}

function resolveRewriteConfig(): { backend: 'off' | 'argos'; argosPython: string; timeoutMs: number } {
  const stored = safeLoadRewriteConfig();
  return {
    backend: parseRewriteBackend(process.env.ENGLISH_PILOT_REWRITE_BACKEND) ?? stored.backend,
    argosPython: process.env.ARGOS_TRANSLATE_PYTHON?.trim() || stored.argosPython,
    timeoutMs: parsePositiveInt(process.env.ENGLISH_PILOT_REWRITE_TIMEOUT_MS) ?? stored.timeoutMs,
  };
}

function safeLoadRewriteConfig(): { backend: 'off' | 'argos'; argosPython: string; timeoutMs: number } {
  try {
    const config = loadConfig();
    return {
      backend: config.rewriteBackend,
      argosPython: config.argosPython,
      timeoutMs: config.rewriteTimeoutMs,
    };
  } catch {
    return {
      backend: 'off',
      argosPython: '',
      timeoutMs: 3_000,
    };
  }
}

function parseRewriteBackend(value: string | undefined): 'off' | 'argos' | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'off' || normalized === 'argos') return normalized;
  return undefined;
}

function resolveArgosPython(configuredPython: string): string | undefined {
  const explicit = process.env.ARGOS_TRANSLATE_PYTHON?.trim();
  if (explicit && isExecutable(explicit)) return explicit;
  const configured = configuredPython.trim();
  if (configured && isExecutable(configured)) return configured;
  return undefined;
}

function isExecutable(path: string): boolean {
  try {
    return existsSync(path) && (accessSync(path, constants.X_OK), true);
  } catch {
    return false;
  }
}

function parsePositiveInt(value: string | undefined): number | undefined {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined;
}

function ensureSentencePunctuation(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function displayableCandidate(text: string, source: RewriteCandidateSource): RewriteCandidate {
  return {
    text,
    source,
    displayable: true,
  };
}

function isDisplayableLocalRewrite(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < 8) return false;
  if (/\bcontact English\b/i.test(normalized)) return false;
  if (/\bDown\.$/i.test(normalized)) return false;
  return true;
}

export { buildPronunciationBite, type PronunciationEntry };
