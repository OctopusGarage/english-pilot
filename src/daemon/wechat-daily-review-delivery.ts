import type { DailyReviewIntegrationPayload } from '../integrations/daily-pack.js';
import type { WeChatChannelConfigReport } from '../channels/wechat/config.js';
import { loadWeChatChannelConfig } from '../channels/wechat/config.js';
import { sendWeChatText, type WeChatSendTextResult } from '../channels/wechat/replies.js';
import type { DaemonStatus, WeChatDailyReviewDaemonDeliveryResult } from '../adapters/control/protocol.js';

export interface WeChatDailyReviewDeliveryHandlerInput {
  channels: DaemonStatus['channels'];
  loadConfig?: () => WeChatChannelConfigReport;
  sendText?: typeof sendWeChatText;
}

export function createWeChatDailyReviewDeliveryHandler(input: WeChatDailyReviewDeliveryHandlerInput) {
  return async (payload: DailyReviewIntegrationPayload): Promise<WeChatDailyReviewDaemonDeliveryResult> => {
    const preview = previewMessage(payload.pack.markdown);
    const base = {
      operation: 'wechat-daily-review-daemon-delivery' as const,
      delivered: false,
      network: false,
      accountCount: 0,
      recipientCount: 0,
      messagePreview: preview,
    };
    if (payload.target.id !== 'wechat') {
      return { ...base, blocker: 'WeChat daemon delivery only accepts target `wechat`.' };
    }
    if (input.channels.wechat !== 'running') {
      return { ...base, blocker: `WeChat daemon channel is not running (state: ${input.channels.wechat}).` };
    }

    const report = (input.loadConfig ?? loadWeChatChannelConfig)();
    const config = report.config;
    if (!report.ok || !config) {
      return {
        ...base,
        accountCount: config?.accounts.length ?? 0,
        recipientCount: config?.allowedUsers.size ?? 0,
        blocker: `WeChat long-connection account/channel is not ready: ${report.missing.join(', ') || 'unknown'}.`,
      };
    }
    const account = config.accounts[0];
    const recipients = [...config.allowedUsers];
    if (!account || recipients.length === 0) {
      return {
        ...base,
        accountCount: config.accounts.length,
        recipientCount: recipients.length,
        blocker: 'WeChat long-connection delivery requires at least one QR-login account and one allowed user.',
      };
    }

    const send = input.sendText ?? sendWeChatText;
    const errors: string[] = [];
    for (const recipient of recipients) {
      const result = await send({
        account,
        to: recipient,
        text: payload.pack.markdown,
        botAgent: config.botAgent,
      });
      if (!result.sent) errors.push(sanitizeError(result));
    }

    return {
      operation: 'wechat-daily-review-daemon-delivery',
      delivered: errors.length === 0,
      network: true,
      accountCount: config.accounts.length,
      recipientCount: recipients.length,
      messagePreview: preview,
      ...(errors.length > 0 ? { blocker: 'WeChat long-connection delivery failed.', errors } : {}),
    };
  };
}

function previewMessage(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function sanitizeError(result: WeChatSendTextResult): string {
  return (result.error ?? 'unknown error')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, '[redacted-id]');
}
