import type { EnglishPilotConfig, EnglishPilotPolicy } from './types.js';

export const defaultConfig: EnglishPilotConfig = {
  gateMode: 'enforce',
  maxChineseRatio: 0.3,
  targetChineseRatio: 0.1,
  ratioProgression: 'manual',
  preferEnglishLeading: true,
  ignoreCodePathsUrls: true,
  ignoreShortCjkFragmentsUnder: 6,
  coachingIntensity: 'medium',
  coachingCooldownMinutes: 10,
  maxInlineCoachingPerDay: 8,
  blockWithRewrite: true,
  recordAllowedPrompts: true,
  storage: 'sqlite',
  glossaryPath: '~/.english-pilot/glossary.json',
  rewriteBackend: 'off',
  argosPython: '',
  rewriteTimeoutMs: 3_000,
  externalAgentBackend: 'off',
  externalAgentCwd: '',
  externalAgentTimeoutMs: 120_000,
  externalAgentClaudeBinary: 'claude',
  externalAgentCodexBinary: 'codex',
  externalAgentCodexSandbox: 'workspace-write',
  assistantEnglishNoteStyle: 'software-engineering',
  assistantEnglishNoteReferencePaths: [
    '/Users/kingsonwu/programming/kingson4wu/computer-english/most-frequent-technology-english-words.txt',
    '/Users/kingsonwu/programming/kingson4wu/computer-english/MIT6.824.md',
    '/Users/kingsonwu/programming/kingson4wu/computer-english/heima.txt',
    '/Users/kingsonwu/programming/kingson4wu/computer-english/1700.txt',
    '/Users/kingsonwu/programming/kingson4wu/computer-english/600.txt',
  ],
  disabledProjectPaths: [],
};

export const defaultPolicy: EnglishPilotPolicy = defaultConfig;
