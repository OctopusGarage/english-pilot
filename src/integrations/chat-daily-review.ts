import { buildReviewCleanupPlan } from '../core/review-cleanup.js';
import type { LearningItem } from '../storage/repository.js';

const DEFAULT_MAX_ITEMS = 12;
const DEFAULT_MAX_CHARS_PER_MESSAGE = 1_000;
const DEFAULT_MAX_MESSAGES = 3;
const TRUNCATION_NOTICE = '[truncated; see the linked report/logs for full details]';

export interface ChatDailyReviewMessageInput {
  date: string;
  items: LearningItem[];
  maxItems?: number;
  maxCharsPerMessage?: number;
  maxMessages?: number;
}

export function buildChatDailyReviewMessages(input: ChatDailyReviewMessageInput): string[] {
  const maxItems = input.maxItems ?? DEFAULT_MAX_ITEMS;
  const maxCharsPerMessage = input.maxCharsPerMessage ?? DEFAULT_MAX_CHARS_PER_MESSAGE;
  const maxMessages = input.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const dueItems = input.items.filter((item) => item.nextReviewAt <= input.date);
  const selectedItems = selectChatReviewItems(dueItems, maxItems);
  const blocks = selectedItems.map(formatChatReviewItem);
  const header = [
    `EnglishPilot Daily Review - ${input.date}`,
    `Due: ${dueItems.length} | Selected: ${selectedItems.length}`,
  ];
  if (blocks.length === 0) {
    blocks.push('No high-quality review items are due today after filtering.');
  }
  return chunkChatMessages({
    header,
    blocks,
    maxCharsPerMessage,
    maxMessages,
  });
}

function selectChatReviewItems(items: LearningItem[], maxItems: number): LearningItem[] {
  const noisy = new Set(buildReviewCleanupPlan(items).candidates.map((candidate) => candidate.id));
  return items
    .filter((item) => !noisy.has(item.id))
    .filter((item) => item.suggested.trim().length > 0 && item.original.trim().length > 0)
    .filter((item) => item.suggested.trim() !== item.original.trim())
    .filter((item) => item.suggested.length <= 220 && item.original.length <= 220)
    .slice(0, Math.max(0, maxItems));
}

function formatChatReviewItem(item: LearningItem, index: number): string {
  const lines = [`${index + 1}. ${oneLine(item.suggested)}`, `Original: ${oneLine(item.original)}`];
  const ipa = (item.ipa ?? []).slice(0, 3).filter((entry) => entry.word && entry.ipa);
  if (ipa.length > 0) {
    lines.push(`IPA: ${ipa.map((entry) => `${entry.word} ${entry.ipa}`).join('; ')}`);
  }
  return lines.join('\n');
}

function chunkChatMessages(input: {
  header: string[];
  blocks: string[];
  maxCharsPerMessage: number;
  maxMessages: number;
}): string[] {
  const maxChars = Math.max(200, input.maxCharsPerMessage);
  const maxMessages = Math.max(1, input.maxMessages);
  const messages: string[] = [];
  let truncated = false;

  for (const block of input.blocks) {
    const candidate = appendBlock(messages.at(-1), block, input.header);
    if (candidate.length <= maxChars && messages.length > 0) {
      messages[messages.length - 1] = candidate;
      continue;
    }
    if (messages.length >= maxMessages) {
      truncated = true;
      break;
    }
    const next = [...input.header, '', block].join('\n');
    messages.push(next.length <= maxChars ? next : next.slice(0, maxChars - TRUNCATION_NOTICE.length - 2));
  }

  if (truncated && messages.length > 0) {
    messages[messages.length - 1] = appendTruncationNotice(messages[messages.length - 1], maxChars);
  }

  return withPartLabels(messages, maxChars);
}

function appendBlock(current: string | undefined, block: string, header: string[]): string {
  return current ? `${current}\n\n${block}` : [...header, '', block].join('\n');
}

function appendTruncationNotice(message: string, maxChars: number): string {
  const suffix = `\n\n${TRUNCATION_NOTICE}`;
  if (message.length + suffix.length <= maxChars) return `${message}${suffix}`;
  return `${message.slice(0, Math.max(0, maxChars - suffix.length)).trimEnd()}${suffix}`;
}

function withPartLabels(messages: string[], maxChars: number): string[] {
  if (messages.length <= 1) return messages;
  const total = messages.length;
  return messages.map((message, index) => {
    const label = `Part ${index + 1}/${total}\n`;
    if (label.length + message.length <= maxChars) return `${label}${message}`;
    const bodyMax = maxChars - label.length;
    if (message.includes(TRUNCATION_NOTICE)) {
      return `${label}${appendTruncationNotice(message.replace(TRUNCATION_NOTICE, '').trimEnd(), bodyMax)}`;
    }
    return `${label}${message.slice(0, bodyMax)}`;
  });
}

function oneLine(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
