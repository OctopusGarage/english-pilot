export type PolicyDecision = 'BLOCK' | 'ALLOW_WITH_COACHING' | 'ALLOW_SILENT';

export interface EnglishPilotPolicy {
  gateMode: 'enforce' | 'coach';
  maxChineseRatio: number;
  targetChineseRatio: number;
  ratioProgression: 'manual' | 'scheduled';
  preferEnglishLeading: boolean;
  ignoreCodePathsUrls: boolean;
  ignoreShortCjkFragmentsUnder: number;
  coachingIntensity: 'low' | 'medium' | 'high' | 'force';
  coachingCooldownMinutes: number;
  maxInlineCoachingPerDay: number;
  blockWithRewrite: boolean;
  recordAllowedPrompts: boolean;
}

export interface EnglishPilotConfig extends EnglishPilotPolicy {
  storage: 'sqlite' | 'jsonl';
  glossaryPath: string;
  rewriteBackend: 'off' | 'argos';
  argosPython: string;
  rewriteTimeoutMs: number;
  externalAgentBackend: 'off' | 'claude' | 'codex';
  externalAgentCwd: string;
  externalAgentTimeoutMs: number;
  externalAgentClaudeBinary: string;
  externalAgentCodexBinary: string;
  externalAgentCodexSandbox: 'read-only' | 'workspace-write' | 'danger-full-access';
}

export interface AnalysisResult {
  decision: PolicyDecision;
  englishCount: number;
  nonEnglishCount: number;
  countedLetters: number;
  nonEnglishRatio: number;
  reason: string;
  sanitizedText: string;
  ignoredNonEnglishFragments?: string[];
  coachingSignals?: string[];
}
