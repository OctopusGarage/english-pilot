import type { LarkChannel, SendResult } from '@larksuiteoapi/node-sdk';
import { sendWithRetry } from '../send-retry.js';

export interface FeishuSendTextResult {
  sent: boolean;
  result?: SendResult;
  error?: string;
}

export async function sendFeishuText(
  channel: Pick<LarkChannel, 'send'>,
  chatId: string,
  markdown: string,
): Promise<FeishuSendTextResult> {
  return sendWithRetry({
    send: () => channel.send(chatId, { markdown }),
    isRetryable: isRetryableSendError,
  });
}

function isRetryableSendError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /send_timeout|not_connected|ECONNRESET|ETIMEDOUT/i.test(message);
}
