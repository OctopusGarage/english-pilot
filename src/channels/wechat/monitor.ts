import { monitorExternalChannelText, type ExternalChannelTextMonitorResult } from '../external-monitor.js';
import type { WeChatChannelConfig } from './config.js';

export interface WeChatInboundText {
  accountId: string;
  senderId: string;
  chatId: string;
  chatType: 'dm' | 'group';
  messageId: string;
  text: string;
}

export type WeChatMonitorResult = ExternalChannelTextMonitorResult;

export function monitorWeChatTextMessage(
  message: WeChatInboundText,
  channelConfig: WeChatChannelConfig,
): WeChatMonitorResult {
  return monitorExternalChannelText({
    text: message.text,
    replyMode: channelConfig.replyMode,
    source: 'wechat-channel',
    channelTag: 'wechat',
    coachingScene: 'WeChat chat coaching',
    quoteStyle: 'plain',
  });
}
