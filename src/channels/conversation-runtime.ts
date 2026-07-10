import { runExternalAgent } from '../agent/runner.js';
import { runExternalChannelAgentTurn } from '../agent/channel-turn.js';
import { clearAgentSession } from '../agent/session-store.js';
import { extractLastAssistantEnglishNote } from '../core/assistant-note.js';
import { loadConfig } from '../core/config.js';
import type { RuntimeLogger } from '../core/infra/logger.js';
import { recordAssistantEnglishNote } from '../storage/assistant-note-recorder.js';
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
    return handleNewSessionCommand(input);
  }

  const monitorResult = assessChannelMessage(input);
  if (monitorResult.decision !== 'BLOCK') {
    return handleAllowedChannelMessage(input, monitorResult);
  }

  return handleBlockedOrSkippedChannelMessage(input, monitorResult);
}

function assessChannelMessage(input: ExternalChannelConversationInput): ExternalChannelTextMonitorResult {
  const monitorResult = input.monitorText();
  input.logger?.info('channel.message.assessed', 'External channel message was assessed.', {
    ...logContext(input),
    decision: monitorResult.decision,
    shouldReply: monitorResult.shouldReply,
  });
  return monitorResult;
}

async function handleNewSessionCommand(
  input: ExternalChannelConversationInput,
): Promise<ExternalChannelConversationResult> {
  clearAgentSession(input.scope);
  input.logger?.info('channel.session.new', 'External channel session was reset by /new.', logContext(input));
  const sent = await sendChannelReply(input, newSessionReplyText(), '/new command');
  return { handled: true, replied: sent.sent, reason: 'new-session' };
}

async function handleAllowedChannelMessage(
  input: ExternalChannelConversationInput,
  monitorResult: ExternalChannelTextMonitorResult,
): Promise<ExternalChannelConversationResult> {
  await sendProcessingAck(input);

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
    input.logger?.warn('channel.agent.failed', 'External channel agent failed to produce a reply.', logContext(input));
    return { handled: true, replied: false, reason: 'agent-failed' };
  }
  if (!agentReply.text) {
    return handleSkippedReply(input);
  }

  recordAssistantNoteFromReply(input, agentReply.text);
  const sent = await sendChannelReply(input, agentReply.text, 'agent reply');
  return { handled: true, replied: sent.sent };
}

async function handleBlockedOrSkippedChannelMessage(
  input: ExternalChannelConversationInput,
  monitorResult: ExternalChannelTextMonitorResult,
): Promise<ExternalChannelConversationResult> {
  if (!monitorResult.shouldReply || !monitorResult.replyText) {
    return handleSkippedReply(input);
  }
  input.logger?.info(
    'channel.message.blocked',
    'External channel message was blocked by the language gate.',
    logContext(input),
  );
  const sent = await sendChannelReply(input, monitorResult.replyText, 'coaching reply');
  return { handled: true, replied: sent.sent };
}

async function sendProcessingAck(input: ExternalChannelConversationInput): Promise<void> {
  if (!input.processingAckText || !externalAgentEnabled()) return;
  await sendChannelReply(input, input.processingAckText, 'processing ack');
}

function handleSkippedReply(input: ExternalChannelConversationInput): ExternalChannelConversationResult {
  input.logger?.info('channel.reply.skipped', 'External channel reply was skipped by reply policy.', logContext(input));
  return { handled: true, replied: false };
}

function recordAssistantNoteFromReply(input: ExternalChannelConversationInput, replyText: string): void {
  const note = extractLastAssistantEnglishNote(replyText);
  if (!note) return;

  const item = recordAssistantEnglishNote(input.channel, note);
  input.logger?.info('channel.assistant_note.recorded', 'Recorded assistant English note from channel reply.', {
    ...logContext(input),
    itemId: item.id,
  });
}

async function sendChannelReply(
  input: ExternalChannelConversationInput,
  text: string,
  replyKind: string,
): Promise<ExternalChannelSendTextResult> {
  const sent = await input.sendText(text);
  logSendFailure(input, sent, replyKind);
  return sent;
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
