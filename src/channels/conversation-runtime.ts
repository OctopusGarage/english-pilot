import { runExternalAgent } from '../agent/runner.js';
import { runExternalChannelAgentTurn } from '../agent/channel-turn.js';
import { clearAgentSession } from '../agent/session-store.js';
import { loadConfig } from '../core/config.js';
import type { RuntimeLogger } from '../core/infra/logger.js';
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
  processingAckText?: string;
  runAgent?: typeof runExternalAgent;
  log?: (line: string) => void;
  logger?: RuntimeLogger;
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
    input.logger?.info('channel.session.new', 'External channel session was reset by /new.', logContext(input));
    const sent = await input.sendText(newSessionReplyText());
    logSendFailure(input, sent, '/new command');
    return { handled: true, replied: sent.sent, reason: 'new-session' };
  }

  const monitorResult = input.monitorText();
  input.logger?.info('channel.message.assessed', 'External channel message was assessed.', {
    ...logContext(input),
    decision: monitorResult.decision,
    shouldReply: monitorResult.shouldReply,
  });
  if (monitorResult.decision !== 'BLOCK') {
    if (input.processingAckText && externalAgentEnabled()) {
      const ack = await input.sendText(input.processingAckText);
      logSendFailure(input, ack, 'processing ack');
    }
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
      logger: input.logger,
      failureLabel: `${labelChannel(input.channel)} external agent for ${input.messageLabel}`,
    });
    if (agentReply.failed) {
      input.logger?.warn(
        'channel.agent.failed',
        'External channel agent failed to produce a reply.',
        logContext(input),
      );
      return { handled: true, replied: false, reason: 'agent-failed' };
    }
    if (agentReply.text) {
      const sent = await input.sendText(agentReply.text);
      logSendFailure(input, sent, 'agent reply');
      return { handled: true, replied: sent.sent };
    }
  }

  if (!monitorResult.shouldReply || !monitorResult.replyText) {
    input.logger?.info(
      'channel.reply.skipped',
      'External channel reply was skipped by reply policy.',
      logContext(input),
    );
    return { handled: true, replied: false };
  }
  input.logger?.info(
    'channel.message.blocked',
    'External channel message was blocked by the language gate.',
    logContext(input),
  );
  const sent = await input.sendText(monitorResult.replyText);
  logSendFailure(input, sent, 'coaching reply');
  return { handled: true, replied: sent.sent };
}

function externalAgentEnabled(): boolean {
  return loadConfig().externalAgentBackend !== 'off';
}

function logSendFailure(
  input: ExternalChannelConversationInput,
  result: ExternalChannelSendTextResult,
  replyKind: string,
): void {
  if (result.sent) {
    input.logger?.info('channel.reply.sent', `Replied to ${labelChannel(input.channel)} ${replyKind}.`, {
      ...logContext(input),
      replyKind,
    });
    return;
  }
  input.logger?.warn('channel.reply.failed', `Failed to reply to ${labelChannel(input.channel)} ${replyKind}.`, {
    ...logContext(input),
    replyKind,
    error: result.error,
  });
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

function logContext(input: ExternalChannelConversationInput): Record<string, unknown> {
  return {
    component: 'channel',
    channel: input.channel,
    scope: input.scope,
    messageLabel: input.messageLabel,
    inputKind: input.inputKind,
  };
}
