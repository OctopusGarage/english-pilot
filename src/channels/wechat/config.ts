import { listWeChatAccounts, type WeChatAccount } from './state.js';

export type WeChatReplyMode = 'silent' | 'violation' | 'always';

export interface WeChatChannelConfig {
  accounts: WeChatAccount[];
  allowedUsers: Set<string>;
  replyMode: WeChatReplyMode;
  botAgent: string;
  processingAckText?: string;
}

export interface WeChatChannelConfigReport {
  ok: boolean;
  missing: string[];
  config?: WeChatChannelConfig;
}

export function loadWeChatChannelConfig(env: NodeJS.ProcessEnv = process.env): WeChatChannelConfigReport {
  const accounts = listWeChatAccounts();
  const allowedUsers = new Set([
    ...parseList(env.WECHAT_ALLOWED_USERS),
    ...accounts.map((account) => account.userId).filter((userId): userId is string => Boolean(userId)),
  ]);
  const missing = [
    ...(accounts.length === 0 ? ['WECHAT_ACCOUNT'] : []),
    ...(allowedUsers.size === 0 && env.WECHAT_ALLOW_ALL_USERS !== 'true' ? ['WECHAT_ALLOWED_USERS'] : []),
  ];
  const config: WeChatChannelConfig = {
    accounts,
    allowedUsers,
    replyMode: parseReplyMode(env.WECHAT_REPLY_MODE),
    botAgent: sanitizeBotAgent(env.WECHAT_BOT_AGENT),
    processingAckText: parseProcessingAckText(env.WECHAT_PROCESSING_ACK, env.WECHAT_PROCESSING_ACK_TEXT),
  };
  return {
    ok: missing.length === 0,
    missing,
    config,
  };
}

export function isWeChatSenderAllowed(senderId: string, config: WeChatChannelConfig): boolean {
  if (process.env.WECHAT_ALLOW_ALL_USERS === 'true') return true;
  return config.allowedUsers.has(senderId);
}

export function formatWeChatChannelDoctor(report: WeChatChannelConfigReport): string {
  return [
    'WeChat long-connection channel',
    `Ready: ${report.ok ? 'yes' : 'no'}`,
    `Missing: ${report.missing.length > 0 ? report.missing.join(', ') : 'none'}`,
    ...(report.config
      ? [
          `Accounts: ${report.config.accounts.length}`,
          `Allowed users: ${report.config.allowedUsers.size}`,
          `Reply mode: ${report.config.replyMode}`,
          `Bot agent: ${report.config.botAgent}`,
          `Processing ack: ${report.config.processingAckText ? 'enabled' : 'disabled'}`,
        ]
      : []),
    '',
  ].join('\n');
}

export function parseList(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function parseReplyMode(value: string | undefined): WeChatReplyMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'silent' || normalized === 'always') return normalized;
  return 'violation';
}

function sanitizeBotAgent(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return 'EnglishPilot/0.1.0';
  return /^[\x20-\x7e]{1,256}$/.test(trimmed) ? trimmed : 'EnglishPilot/0.1.0';
}

function parseProcessingAckText(enabled: string | undefined, text: string | undefined): string | undefined {
  const normalized = enabled?.trim().toLowerCase();
  if (normalized === 'off' || normalized === 'false' || normalized === '0' || normalized === 'no') return undefined;
  const custom = text?.trim();
  return custom || 'Received. Working on it...';
}
