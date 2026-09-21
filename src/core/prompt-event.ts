import type { PolicyDecision } from './types.js';

export interface PromptEvent {
  id: string;
  createdAt: string;
  source: 'cli' | 'claude-hook' | 'codex-hook' | 'mcp' | 'feishu-channel' | 'wechat-channel';
  text: string;
  decision: PolicyDecision;
  nonEnglishRatio: number;
  englishCount: number;
  nonEnglishCount: number;
  reason: string;
  coachingShown?: boolean;
}
