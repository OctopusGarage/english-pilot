import type { ExternalChannelConversationEnvelope, ExternalChannelSendTextResult } from './conversation-runtime.js';
import type { ExternalChannelTextMonitorResult } from './external-monitor.js';

export interface ExternalChannelInboundMessage {
  channel: 'feishu' | 'wechat';
  scopeParts: readonly string[];
  text: string;
  inputKind: 'text' | 'voice';
  metadata: Record<string, unknown>;
  monitorText: () => ExternalChannelTextMonitorResult;
  sendText: (text: string) => Promise<ExternalChannelSendTextResult>;
  processingAckText?: string;
  messageLabel: string;
}

export type ExternalChannelEnvelopeResult =
  { ok: true; envelope: ExternalChannelConversationEnvelope } | { ok: false; reason: string };

export function buildExternalChannelInboundEnvelope(
  input: ExternalChannelInboundMessage,
): ExternalChannelEnvelopeResult {
  const text = input.text.trim();
  if (!text) return { ok: false, reason: 'empty-message' };
  return {
    ok: true,
    envelope: {
      channel: input.channel,
      scope: input.scopeParts.join(':'),
      text,
      inputKind: input.inputKind,
      metadata: input.metadata,
      monitorText: input.monitorText,
      sendText: input.sendText,
      processingAckText: input.processingAckText,
      messageLabel: input.messageLabel,
    },
  };
}
