import { monitorExternalChannelText, type ExternalChannelTextMonitorResult } from '../external-monitor.js';
import type { FeishuChannelConfig } from './config.js';

export interface FeishuInboundText {
  text: string;
  messageId: string;
  senderId: string;
  chatId: string;
  chatType: 'p2p' | 'group';
}

export type FeishuMonitorResult = ExternalChannelTextMonitorResult;

export function monitorFeishuTextMessage(
  message: FeishuInboundText,
  channelConfig: FeishuChannelConfig,
): FeishuMonitorResult {
  return monitorExternalChannelText({
    text: message.text,
    replyMode: channelConfig.replyMode,
    source: 'feishu-channel',
    channelTag: 'feishu',
    coachingScene: 'Feishu chat coaching',
    quoteStyle: 'markdown-blockquote',
  });
}
