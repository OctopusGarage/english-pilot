import { runExternalAgent } from '../agent/runner.js';
import { runExternalChannelAgentTurn } from '../agent/channel-turn.js';
import { clearAgentSession } from '../agent/session-store.js';
import type { ExternalChannelTextMonitorResult } from './external-monitor.js';

export interface ExternalChannelSendTextResult {
  sent: boolean;
  error?: string;
}

export interface ExternalChannelConversationInput {
  channel: 'feishu' | 'wechat';
  scope: string;
  text: string;
  inputKind: 'text' | 'voice';
  metadata: Record<string, unknown>;
  monitorText: () => ExternalChannelTextMonitorResult;
  sendText: (text: string) => Promise<ExternalChannelSendTextResult>;
  runAgent?: typeof runExternalAgent;
  log?: (line: string) => void;
  messageLabel: string;
}

export type ExternalChannelConversationEnvelope = Omit<ExternalChannelConversationInput, 'runAgent' | 'log'>;

export interface ExternalChannelConversationResult {
  handled: boolean;
  replied: boolean;
  reason?: string;
}

export async function runExternalChannelConversation(
  input: ExternalChannelConversationInput,
): Promise<ExternalChannelConversationResult> {
  if (isNewSessionCommand(input.text)) {
    clearAgentSession(input.scope);
    const sent = await input.sendText(newSessionReplyText());
    logSendFailure(input, sent, '/new command');
    return { handled: true, replied: sent.sent, reason: 'new-session' };
  }

  const monitorResult = input.monitorText();
  if (monitorResult.decision !== 'BLOCK') {
    const agentReply = await runExternalChannelAgentTurn({
      channel: input.channel,
      scope: input.scope,
      text: input.text,
      metadata: {
        ...input.metadata,
        inputKind: input.inputKind,
        thresholdDecision: 'ALLOW',
      },
      coachingInstruction: monitorResult.agentCoachingInstruction,
      runAgent: input.runAgent,
      log: input.log,
      failureLabel: `${labelChannel(input.channel)} external agent for ${input.messageLabel}`,
    });
    if (agentReply.failed) return { handled: true, replied: false, reason: 'agent-failed' };
    if (agentReply.text) {
      const sent = await input.sendText(agentReply.text);
      logSendFailure(input, sent, 'agent reply');
      return { handled: true, replied: sent.sent };
    }
  }

  if (!monitorResult.shouldReply || !monitorResult.replyText) return { handled: true, replied: false };
  const sent = await input.sendText(monitorResult.replyText);
  logSendFailure(input, sent, 'coaching reply');
  return { handled: true, replied: sent.sent };
}

function logSendFailure(
  input: ExternalChannelConversationInput,
  result: ExternalChannelSendTextResult,
  replyKind: string,
): void {
  if (result.sent) return;
  input.log?.(`Failed to reply to ${labelChannel(input.channel)} ${replyKind} ${input.messageLabel}: ${result.error}`);
}

function isNewSessionCommand(text: string): boolean {
  return text.trim().toLowerCase() === '/new';
}

function newSessionReplyText(): string {
  return 'Started a new EnglishPilot agent session. The next message will not resume the previous Claude/Codex conversation.';
}

function labelChannel(channel: 'feishu' | 'wechat'): 'Feishu' | 'WeChat' {
  return channel === 'feishu' ? 'Feishu' : 'WeChat';
}
