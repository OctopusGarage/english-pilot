import type { DailyReviewIntegrationPayload } from '../../integrations/daily-pack.js';

export type ChannelRuntimeState = 'disabled' | 'ready' | 'starting' | 'running' | 'failed';

export interface DaemonStatus {
  ok: boolean;
  pid: number;
  startedAt: string;
  channels: {
    feishu: ChannelRuntimeState;
    wechat: ChannelRuntimeState;
  };
  uncleanRestart?: boolean;
}

export interface WeChatDailyReviewDaemonDeliveryResult {
  operation: 'wechat-daily-review-daemon-delivery';
  delivered: boolean;
  network: boolean;
  accountCount: number;
  recipientCount: number;
  messagePreview: string;
  blocker?: string;
  errors?: string[];
}

export type ControlRequest =
  | {
      id: string;
      method: 'status';
    }
  | {
      id: string;
      method: 'wechat.dailyReview.deliver';
      payload: DailyReviewIntegrationPayload;
    };

export type ControlResponse =
  | {
      id: string;
      ok: true;
      result: DaemonStatus | WeChatDailyReviewDaemonDeliveryResult;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };
