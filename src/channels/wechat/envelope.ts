import { extractWeChatText, type WeChatUpdateMessage } from './api.js';
import { isWeChatSenderAllowed, type WeChatChannelConfig } from './config.js';
import { monitorWeChatTextMessage } from './monitor.js';
import { sendWeChatText } from './replies.js';
import { getWeChatContextToken, saveWeChatContextToken, type WeChatAccount } from './state.js';
import { buildExternalChannelInboundEnvelope, type ExternalChannelEnvelopeResult } from '../inbound-envelope.js';

export type WeChatEnvelopeResult = ExternalChannelEnvelopeResult;

export function buildWeChatConversationEnvelope(input: {
  account: WeChatAccount;
  config: WeChatChannelConfig;
  message: WeChatUpdateMessage;
  sendText?: typeof sendWeChatText;
}): WeChatEnvelopeResult {
  const senderId = String(input.message.from_user_id ?? '').trim();
  if (!senderId) return { ok: false, reason: 'missing-sender' };
  if (senderId === input.account.accountId) return { ok: false, reason: 'self-message' };
  if (!isWeChatSenderAllowed(senderId, input.config)) {
    return { ok: false, reason: 'sender-not-allowed' };
  }

  const extracted = extractWeChatTextWithKind(input.message);
  const text = extracted.text.trim();

  const contextToken = String(input.message.context_token ?? '').trim();
  if (contextToken) saveWeChatContextToken(input.account.accountId, senderId, contextToken);

  const chat = guessChat(input.message, input.account.accountId);
  const sendText = input.sendText ?? sendWeChatText;
  const contextTokenForReply = contextToken || getWeChatContextToken(input.account.accountId, senderId);
  const messageId = String(input.message.message_id ?? '');

  return buildExternalChannelInboundEnvelope({
    channel: 'wechat',
    scopeParts: wechatAgentScopeParts(input.account.accountId, senderId, chat),
    text,
    inputKind: extracted.inputKind,
    metadata: {
      accountId: input.account.accountId,
      senderId,
      chatId: chat.chatId,
      chatType: chat.chatType,
      messageId,
    },
    monitorText: () =>
      monitorWeChatTextMessage(
        {
          accountId: input.account.accountId,
          senderId,
          chatId: chat.chatId,
          chatType: chat.chatType,
          messageId,
          text,
        },
        input.config,
      ),
    sendText: (replyText) =>
      sendText({
        account: input.account,
        to: senderId,
        text: replyText,
        contextToken: contextTokenForReply,
        botAgent: input.config.botAgent,
      }),
    processingAckText: input.config.processingAckText,
    messageLabel: messageId,
  });
}

function guessChat(message: WeChatUpdateMessage, accountId: string): { chatType: 'dm' | 'group'; chatId: string } {
  const roomId = String(message.room_id ?? message.chat_room_id ?? '').trim();
  if (roomId) return { chatType: 'group', chatId: roomId };
  return { chatType: 'dm', chatId: String(message.from_user_id ?? accountId) };
}

function extractWeChatTextWithKind(message: WeChatUpdateMessage): { text: string; inputKind: 'text' | 'voice' } {
  for (const item of message.item_list ?? []) {
    if (item.type === 1 && item.text_item?.text) return { text: item.text_item.text, inputKind: 'text' };
  }
  for (const item of message.item_list ?? []) {
    if (item.type === 3 && item.voice_item?.text) return { text: item.voice_item.text, inputKind: 'voice' };
  }
  return { text: extractWeChatText(message), inputKind: 'text' };
}

function wechatAgentScopeParts(
  accountId: string,
  senderId: string,
  chat: { chatType: 'dm' | 'group'; chatId: string },
): string[] {
  return ['wechat', accountId, chat.chatId, chat.chatType === 'group' ? senderId : 'dm'];
}
