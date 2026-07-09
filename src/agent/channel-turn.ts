import { loadConfig } from '../core/config.js';
import { buildExternalChannelAgentPrompt, type ExternalChannelAgentPromptInput } from './channel-prompt.js';
import { extractExternalAgentReplyText, runExternalAgent, type ExternalAgentRunResult } from './runner.js';
import { getAgentSession, saveAgentSessionFromResult } from './session-store.js';

export interface ExternalChannelAgentTurnInput {
  channel: ExternalChannelAgentPromptInput['channel'];
  scope: string;
  text: string;
  metadata: Record<string, unknown>;
  coachingInstruction?: string;
  runAgent?: typeof runExternalAgent;
  log?: (line: string) => void;
  failureLabel?: string;
}

export interface ExternalChannelAgentTurnResult {
  text?: string;
  failed?: boolean;
  runResult?: ExternalAgentRunResult;
}

export async function runExternalChannelAgentTurn(
  input: ExternalChannelAgentTurnInput,
): Promise<ExternalChannelAgentTurnResult> {
  const config = loadConfig();
  if (config.externalAgentBackend === 'off') return {};

  const cwd = config.externalAgentCwd.trim() || process.cwd();
  const session = getAgentSession(input.scope, config.externalAgentBackend, cwd);
  const prompt = buildExternalChannelAgentPrompt({
    channel: input.channel,
    text: input.text,
    metadata: input.metadata,
    coachingInstruction: input.coachingInstruction,
  });
  const result = await (input.runAgent ?? runExternalAgent)({
    config,
    prompt,
    cwd,
    ...(config.externalAgentBackend === 'claude' ? { sessionId: session?.sessionId } : {}),
    ...(config.externalAgentBackend === 'codex' ? { threadId: session?.threadId } : {}),
  });

  if (result.exitCode !== 0) {
    input.log?.(`${input.failureLabel ?? 'External agent'} failed: ${agentErrorSummary(result)}`);
    return { failed: true, runResult: result };
  }

  saveAgentSessionFromResult(input.scope, result);
  const text = extractExternalAgentReplyText(result);
  return {
    ...(text ? { text } : {}),
    runResult: result,
  };
}

function agentErrorSummary(result: ExternalAgentRunResult): string {
  return result.stderr.trim() || `exitCode=${result.exitCode ?? 'none'}`;
}
