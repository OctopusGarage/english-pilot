import { getWeChatUpdates, notifyWeChatStart, notifyWeChatStop, type WeChatUpdateMessage } from './api.js';
import { loadWeChatChannelConfig, type WeChatChannelConfig } from './config.js';
import { buildWeChatConversationEnvelope } from './envelope.js';
import { sendWeChatText } from './replies.js';
import type { WeChatAccount } from './state.js';
import { runWeChatUpdateStream } from './update-stream.js';
import { loadConfig } from '../../core/config.js';
import type { RuntimeLogger } from '../../core/infra/logger.js';
import { runExternalAgent } from '../../agent/runner.js';
import { runExternalChannelConversation } from '../conversation-runtime.js';

export interface WeChatStartPreview {
  operation: 'wechat-long-connection-start';
  ready: boolean;
  wouldConnect: boolean;
  accountCount: number;
  allowedUsers: number;
  agentBackend?: 'off' | 'claude' | 'codex';
  missing: string[];
}

export async function startWeChatChannel(
  input: {
    config?: WeChatChannelConfig;
    dryRun?: boolean;
    log?: (line: string) => void;
    logger?: RuntimeLogger;
    abortSignal?: AbortSignal;
  } = {},
): Promise<WeChatStartPreview> {
  const report = input.config
    ? {
        ok: true,
        missing: [],
        config: input.config,
      }
    : loadWeChatChannelConfig();
  const config = report.config;
  const preview = {
    operation: 'wechat-long-connection-start' as const,
    ready: report.ok,
    wouldConnect: report.ok && !input.dryRun,
    accountCount: config?.accounts.length ?? 0,
    allowedUsers: config?.allowedUsers.size ?? 0,
    agentBackend: loadConfig().externalAgentBackend,
    missing: report.missing,
  };
  if (input.dryRun || !report.ok || !config) return preview;

  input.log?.(`EnglishPilot WeChat channel is starting ${config.accounts.length} account monitor(s).`);
  input.logger?.info('wechat.channel.starting', 'EnglishPilot WeChat channel is starting account monitors.', {
    accountCount: config.accounts.length,
    allowedUsers: config.allowedUsers.size,
    replyMode: config.replyMode,
  });
  await Promise.all(
    config.accounts.map(async (account) => {
      try {
        await notifyWeChatStart({
          baseUrl: account.baseUrl,
          token: account.token,
          botAgent: config.botAgent,
        });
      } catch (error) {
        input.log?.(
          `WeChat notifyStart failed for ${account.accountId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        input.logger?.warn('wechat.notify_start.failed', 'WeChat notifyStart failed.', {
          accountId: account.accountId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      void monitorWeChatAccount({
        account,
        config,
        log: input.log,
        logger: input.logger,
        abortSignal: input.abortSignal,
      });
    }),
  );
  return preview;
}

export async function handleWeChatMessage(input: {
  account: WeChatAccount;
  config: WeChatChannelConfig;
  message: WeChatUpdateMessage;
  log?: (line: string) => void;
  logger?: RuntimeLogger;
  runAgent?: typeof runExternalAgent;
  sendText?: typeof sendWeChatText;
}): Promise<{ handled: boolean; replied: boolean; reason?: string }> {
  const envelope = buildWeChatConversationEnvelope({
    account: input.account,
    config: input.config,
    message: input.message,
    sendText: input.sendText,
  });
  if (!envelope.ok) return { handled: false, replied: false, reason: envelope.reason };
  return runExternalChannelConversation({
    ...envelope.envelope,
    runAgent: input.runAgent ?? runExternalAgent,
    log: input.log,
    logger: input.logger,
  });
}

export async function monitorWeChatAccount(input: {
  account: WeChatAccount;
  config: WeChatChannelConfig;
  log?: (line: string) => void;
  logger?: RuntimeLogger;
  abortSignal?: AbortSignal;
  maxIterations?: number;
  getUpdates?: typeof getWeChatUpdates;
  notifyStart?: typeof notifyWeChatStart;
  notifyStop?: typeof notifyWeChatStop;
  sleep?: (ms: number) => Promise<void>;
}): Promise<void> {
  await runWeChatUpdateStream({
    account: input.account,
    botAgent: input.config.botAgent,
    log: input.log,
    logger: input.logger,
    abortSignal: input.abortSignal,
    maxIterations: input.maxIterations,
    getUpdates: input.getUpdates,
    notifyStart: input.notifyStart,
    notifyStop: input.notifyStop,
    sleep: input.sleep,
    onMessage: (message) => {
      void handleWeChatMessage({
        account: input.account,
        config: input.config,
        message,
        log: input.log,
        logger: input.logger,
      });
    },
  });
}
