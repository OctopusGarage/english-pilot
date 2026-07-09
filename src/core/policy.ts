import type { EnglishPilotConfig, EnglishPilotPolicy } from './types.js';

export const defaultConfig: EnglishPilotConfig = {
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
};

export const defaultPolicy: EnglishPilotPolicy = defaultConfig;
