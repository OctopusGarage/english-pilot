import { sendWeChatMessage } from './api.js';
import { sendWithRetry } from '../send-retry.js';
import type { WeChatAccount } from './state.js';

export interface WeChatSendTextResult {
  sent: boolean;
  error?: string;
}

export async function sendWeChatText(input: {
  account: WeChatAccount;
  to: string;
  text: string;
  contextToken?: string;
  botAgent?: string;
}): Promise<WeChatSendTextResult> {
  const result = await sendWithRetry({
    send: async () => {
      await sendWeChatMessage({
        baseUrl: input.account.baseUrl,
        token: input.account.token,
        to: input.to,
        text: input.text,
        contextToken: input.contextToken,
        botAgent: input.botAgent,
      });
    },
    isRetryable: isRetryableSendError,
  });
  return result.sent ? { sent: true } : { sent: false, error: result.error };
}

function isRetryableSendError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNRESET|ETIMEDOUT|timeout|fetch failed|rate/i.test(message);
}
