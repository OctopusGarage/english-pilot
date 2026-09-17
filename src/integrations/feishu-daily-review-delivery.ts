import { spawn } from 'node:child_process';
import { cwd } from 'node:process';
import { buildChatDailyReview } from './chat-daily-review.js';
import type { DailyReviewSelection } from '../core/daily-review-selection.js';
import type { LearningItem } from '../storage/repository.js';
import type { LearningItemCleanupSummary } from '../storage/repository.js';

export interface FeishuDailyReviewNotifyRequest {
  title: string;
  session: string;
  part: number;
  total: number;
}

export type FeishuDailyReviewNotify = (
  message: string,
  request: FeishuDailyReviewNotifyRequest,
) => Promise<{ ok: boolean; error?: string }>;

export interface FeishuDailyReviewDeliveryResult {
  operation: 'feishu-daily-review-delivery';
  target: 'feishu';
  delivered: boolean;
  network: boolean;
  messagesSent: number;
  messageCount: number;
  session: string;
  messagePreview: string;
  cleanup?: LearningItemCleanupSummary;
  selection?: DailyReviewSelection;
  blocker?: string;
  errors?: string[];
}

export interface FeishuDailyReviewDeliveryInput {
  date: string;
  items?: LearningItem[];
  cleanupItems?: (date: string) => LearningItemCleanupSummary;
  loadItems?: () => LearningItem[];
  session?: string;
  maxItems?: number;
  maxCharsPerMessage?: number;
  maxMessages?: number;
  notify?: FeishuDailyReviewNotify;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export async function deliverFeishuDailyReview(
  input: FeishuDailyReviewDeliveryInput,
): Promise<FeishuDailyReviewDeliveryResult> {
  const session =
    input.session ??
    input.env?.ENGLISH_PILOT_FEISHU_SESSION ??
    input.env?.FEISHU_DAILY_REVIEW_SESSION ??
    defaultFeishuDailyReviewSession(input.cwd ?? cwd());
  let cleanup: LearningItemCleanupSummary | undefined;
  let items = input.items ?? [];
  try {
    cleanup = input.cleanupItems?.(input.date);
    if (input.loadItems) items = input.loadItems();
  } catch (error) {
    return {
      operation: 'feishu-daily-review-delivery',
      target: 'feishu',
      delivered: false,
      network: false,
      messagesSent: 0,
      messageCount: 0,
      session,
      messagePreview: '',
      blocker: `Daily review cleanup failed: ${sanitizeError(error)}`,
    };
  }
  const review = buildChatDailyReview({
    date: input.date,
    items,
    maxItems: input.maxItems,
    maxCharsPerMessage: input.maxCharsPerMessage,
    maxMessages: input.maxMessages,
  });
  const messages = review.messages;
  const notify = input.notify ?? createTcbNotify(input.env);
  const errors: string[] = [];
  let messagesSent = 0;

  for (const [index, message] of messages.entries()) {
    const result = await notify(message, {
      title: 'EnglishPilot Daily Review',
      session,
      part: index + 1,
      total: messages.length,
    });
    if (result.ok) {
      messagesSent += 1;
    } else {
      errors.push(`part ${index + 1}: ${result.error ?? 'unknown error'}`);
    }
  }

  return {
    operation: 'feishu-daily-review-delivery',
    target: 'feishu',
    delivered: errors.length === 0,
    network: true,
    messagesSent,
    messageCount: messages.length,
    session,
    messagePreview: previewMessage(messages[0] ?? ''),
    ...(cleanup ? { cleanup } : {}),
    selection: review.selection,
    ...(errors.length > 0
      ? {
          blocker: 'Feishu daily review delivery failed for one or more message chunks.',
          errors,
        }
      : {}),
  };
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim().slice(0, 160) || 'unknown storage error';
}

export function defaultFeishuDailyReviewSession(path: string): string {
  return `tmux_proj_${path.replace(/\//g, '-')}`;
}

function createTcbNotify(env: NodeJS.ProcessEnv | undefined): FeishuDailyReviewNotify {
  return async (message, request) =>
    runTcbNotify({
      command: env?.ENGLISH_PILOT_TCB_COMMAND ?? env?.TCB_COMMAND ?? 'tcb',
      message,
      title: request.title,
      session: request.session,
      env,
    });
}

function runTcbNotify(input: {
  command: string;
  message: string;
  title: string;
  session: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      input.command,
      [
        'notify',
        '--channel',
        'lark',
        '--session',
        input.session,
        '--title',
        input.title,
        '--source',
        'english-pilot',
        '--level',
        'info',
        '--stdin',
        '--json',
      ],
      {
        env: input.env ?? process.env,
        stdio: ['pipe', 'ignore', 'pipe'],
      },
    );
    const stderr: Buffer[] = [];
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error) => resolve({ ok: false, error: error.message }));
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: Buffer.concat(stderr).toString('utf8').trim() || `tcb exited ${code}` });
      }
    });
    child.stdin.end(input.message);
  });
}

function previewMessage(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 240);
}
