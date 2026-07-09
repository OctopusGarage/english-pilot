import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import { loadConfig } from './config.js';
import { buildPronunciationBite, type PronunciationEntry } from './pronunciation.js';

export interface LearningSuggestion {
  suggested: string;
  pattern: string;
  scene: string;
  tags: string[];
  ipa: PronunciationEntry[];
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
  const patternRewrite = suggestPatternRewrite(original);
  if (patternRewrite) return patternRewrite;

  const localRewrite = translateWithLocalProvider(original);
  if (localRewrite) return localRewrite;

  return 'Please rewrite this mainly in English while preserving the original intent.';
}

function suggestPatternRewrite(original: string): string | undefined {
  const normalized = original.trim().replace(/\s+/g, ' ');
  const weatherQuestion = normalized.match(
    /^(?:what(?:'s| is)|how(?:'s| is))\s+the\s+weather\s+(?:about|in|at|for)\s+(.+?)[?？]?$/i,
  );
  if (weatherQuestion?.[1]) {
    return `What's the weather like in ${normalizePlaceName(weatherQuestion[1])}?`;
  }

  const inaccessibleUrl = normalized.match(
    /(?:访问不了|打不开|无法访问|无法打开|进不去)[：:\s]*(https?:\/\/[^\s，。！？]+)/,
  );
  if (inaccessibleUrl?.[1]) {
    return `I cannot access ${trimTrailingSentencePunctuation(inaccessibleUrl[1])}.`;
  }

  if (/创建一个|new project/i.test(original)) {
    return 'I want to create a new project to help me learn and use English during my normal AI conversations.';
  }

  if (/设计|优化/.test(original)) {
    return 'Let us think through how to design and refine this.';
  }

  return undefined;
}

function normalizePlaceName(value: string): string {
  const trimmed = value.trim().replace(/[，。！？,.!?]+$/u, '');
  const knownPlaces: Record<string, string> = {
    广州: 'Guangzhou',
    深圳: 'Shenzhen',
    北京: 'Beijing',
    上海: 'Shanghai',
    杭州: 'Hangzhou',
    香港: 'Hong Kong',
  };
  return knownPlaces[trimmed] ?? trimmed;
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
  return ensureSentencePunctuation(translated);
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

function trimTrailingSentencePunctuation(value: string): string {
  return value.replace(/[，。！？,.!?]+$/u, '');
}

function ensureSentencePunctuation(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

export { buildPronunciationBite, type PronunciationEntry };
