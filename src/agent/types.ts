import type { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import type { EnglishPilotConfig } from '../core/types.js';

export type ExternalAgentBackend = Exclude<EnglishPilotConfig['externalAgentBackend'], 'off'>;

export interface ExternalAgentInvocation {
  backend: ExternalAgentBackend;
  command: string;
  args: string[];
  cwd: string;
  promptStdin: string;
  sessionId?: string;
  threadId?: string;
}

export interface ExternalAgentRunOptions {
  config: EnglishPilotConfig;
  prompt: string;
  backend?: ExternalAgentBackend;
  cwd?: string;
  dryRun?: boolean;
  timeoutMs?: number;
  sessionId?: string;
  threadId?: string;
  spawnProcess?: typeof spawn;
}

export interface ExternalAgentRunResult extends ExternalAgentInvocation {
  operation: 'external-agent-run';
  dryRun: boolean;
  exitCode: number | null;
  signal?: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  sessionId?: string;
  threadId?: string;
}

export type ExternalAgentChildProcess = ChildProcessWithoutNullStreams;
