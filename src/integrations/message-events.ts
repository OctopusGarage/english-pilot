import type { IntegrationMessageCoachingPayload } from './message-coaching.js';
import { buildIntegrationMessageCoachingPayload, buildIntegrationMessageLearningItem } from './message-coaching.js';
import type { IntegrationTarget } from './targets.js';
import type { LearningItem, LearningItemDraft } from '../core/learning-card.js';

export interface IntegrationInboundMessageEvent {
  target: IntegrationTarget;
  text: string;
  messageId?: string;
  senderId?: string;
}

export interface IntegrationEventCoachingResult {
  event: IntegrationInboundMessageEvent;
  coaching: IntegrationMessageCoachingPayload;
  recorded: boolean;
  item?: LearningItem;
}

export function buildIntegrationEventCoaching(input: {
  target: IntegrationTarget;
  event: unknown;
  allowedTerms?: string[];
  record?: boolean;
  recordLearningItem?: (draft: LearningItemDraft) => LearningItem;
}): IntegrationEventCoachingResult {
  const event = normalizeInboundMessageEvent(input.target, input.event);
  const coaching = buildIntegrationMessageCoachingPayload(input.target, event.text, input.allowedTerms ?? []);
  const draft = input.record ? buildIntegrationMessageLearningItem(coaching) : undefined;
  const item = draft && input.recordLearningItem ? input.recordLearningItem(draft) : undefined;
  return {
    event,
    coaching,
    recorded: item !== undefined,
    ...(item ? { item } : {}),
  };
}

export function normalizeInboundMessageEvent(
  target: IntegrationTarget,
  event: unknown,
): IntegrationInboundMessageEvent {
  if (!isRecord(event)) throw new Error('Integration event must be a JSON object.');
  if (target.id === 'feishu') return normalizeFeishuEvent(target, event);
  if (target.id === 'wechat') return normalizeWechatEvent(target, event);
  throw new Error('Integration event coaching is only available for feishu or wechat.');
}

function normalizeFeishuEvent(
  target: IntegrationTarget,
  envelope: Record<string, unknown>,
): IntegrationInboundMessageEvent {
  const event = readRecord(envelope, 'event') ?? envelope;
  const message = readRecord(event, 'message') ?? event;
  const content = parseMaybeJson(readUnknown(message, 'content'));
  const text = (
    typeof content === 'string'
      ? content
      : (stringField(content, 'text') ?? stringField(content, 'content') ?? stringField(message, 'text'))
  )?.trim();
  if (!text) throw new Error('Feishu event does not contain text message content.');
  const sender = readRecord(event, 'sender');
  const senderId = readRecord(sender, 'sender_id');
  return {
    target,
    text,
    messageId: stringField(message, 'message_id'),
    senderId: stringField(senderId, 'open_id') ?? stringField(senderId, 'user_id'),
  };
}

function normalizeWechatEvent(
  target: IntegrationTarget,
  event: Record<string, unknown>,
): IntegrationInboundMessageEvent {
  const text = (stringField(event, 'Content') ?? stringField(event, 'content'))?.trim();
  if (!text) throw new Error('WeChat event does not contain text message content.');
  return {
    target,
    text,
    messageId: stringField(event, 'MsgId') ?? stringField(event, 'msgId'),
    senderId: stringField(event, 'FromUserName') ?? stringField(event, 'fromUserName'),
  };
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function readUnknown(value: Record<string, unknown>, key: string): unknown {
  return value[key];
}

function readRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const child = value[key];
  return isRecord(child) ? child : undefined;
}

function stringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === 'string' && field.length > 0 ? field : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
