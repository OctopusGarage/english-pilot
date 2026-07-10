import { getWeChatUpdates, notifyWeChatStart, notifyWeChatStop, type WeChatUpdateMessage } from './api.js';
import { loadWeChatSyncCursor, saveWeChatSyncCursor, type WeChatAccount } from './state.js';
import type { RuntimeLogger } from '../../core/infra/logger.js';

export interface WeChatUpdateStreamInput {
  account: WeChatAccount;
  botAgent?: string;
  log?: (line: string) => void;
  abortSignal?: AbortSignal;
  maxIterations?: number;
  getUpdates?: typeof getWeChatUpdates;
  notifyStart?: typeof notifyWeChatStart;
  notifyStop?: typeof notifyWeChatStop;
  sleep?: (ms: number) => Promise<void>;
  logger?: RuntimeLogger;
  onMessage: (message: WeChatUpdateMessage) => void;
}

export async function runWeChatUpdateStream(input: WeChatUpdateStreamInput): Promise<void> {
  let cursor = loadWeChatSyncCursor(input.account.accountId);
  let timeoutMs = 35_000;
  let failures = 0;
  let iterations = 0;
  const getUpdates = input.getUpdates ?? getWeChatUpdates;
  const notifyStart = input.notifyStart ?? notifyWeChatStart;
  const notifyStop = input.notifyStop ?? notifyWeChatStop;
  const wait = input.sleep ?? sleep;
  const logger = input.logger?.child({
    component: 'wechat',
    accountId: input.account.accountId,
  });
  logger?.info('wechat.stream.start', 'WeChat update stream started.');
  try {
    while (!input.abortSignal?.aborted && (input.maxIterations === undefined || iterations < input.maxIterations)) {
      iterations += 1;
      let updates: Awaited<ReturnType<typeof getWeChatUpdates>>;
      try {
        updates = await getUpdates({
          baseUrl: input.account.baseUrl,
          token: input.account.token,
          syncCursor: cursor,
          timeoutMs,
          abortSignal: input.abortSignal,
          botAgent: input.botAgent,
        });
        if (failures > 0) {
          input.log?.(
            `WeChat getupdates recovered after ${failures} failed ${failures === 1 ? 'attempt' : 'attempts'} for ${input.account.accountId}.`,
          );
          logger?.info('wechat.getupdates.recovered', 'WeChat getupdates recovered after transient failures.', {
            failures,
          });
        }
        failures = 0;
      } catch (error) {
        failures += 1;
        const delayMs = reconnectDelayMs(failures);
        input.log?.(
          `WeChat getupdates failed for ${input.account.accountId} (attempt ${failures}, retry in ${Math.round(
            delayMs / 1000,
          )}s): ${errorSummary(error)}`,
        );
        logger?.warn('wechat.getupdates.retry', 'WeChat getupdates failed; retrying.', {
          failures,
          delayMs,
          error: errorSummary(error),
        });
        await wait(delayMs);
        continue;
      }
      if (updates.ret === -14 || updates.errcode === -14) {
        input.log?.(`WeChat session expired for ${input.account.accountId}; run english-pilot wechat setup again.`);
        logger?.warn('wechat.session.expired', 'WeChat session expired; setup must be refreshed.', {
          ret: updates.ret,
          errcode: updates.errcode,
          errmsg: updates.errmsg,
        });
        try {
          await notifyStart({
            baseUrl: input.account.baseUrl,
            token: input.account.token,
            botAgent: input.botAgent,
          });
        } catch (error) {
          input.log?.(
            `WeChat session refresh notifyStart failed for ${input.account.accountId}: ${errorSummary(error)}`,
          );
          logger?.warn('wechat.session.refresh_failed', 'WeChat session refresh notifyStart failed.', {
            error: errorSummary(error),
          });
        }
        await wait(60_000);
        continue;
      }
      if (updates.ret && updates.ret !== 0) {
        const delayMs = reconnectDelayMs(1);
        input.log?.(
          `WeChat getupdates failed for ${input.account.accountId} (ret=${updates.ret}, retry in ${Math.round(
            delayMs / 1000,
          )}s): ${updates.errmsg ?? 'unknown error'}`,
        );
        logger?.warn('wechat.getupdates.api_error', 'WeChat getupdates returned a non-zero status.', {
          ret: updates.ret,
          errcode: updates.errcode,
          errmsg: updates.errmsg,
          delayMs,
        });
        await wait(delayMs);
        continue;
      }
      if (updates.longpolling_timeout_ms && updates.longpolling_timeout_ms > 0) {
        timeoutMs = updates.longpolling_timeout_ms;
        logger?.debug('wechat.getupdates.timeout_updated', 'WeChat long polling timeout updated.', { timeoutMs });
      }
      if (updates.get_updates_buf) {
        cursor = updates.get_updates_buf;
        saveWeChatSyncCursor(input.account.accountId, cursor);
      }
      for (const message of updates.msgs ?? []) {
        logger?.info('wechat.message.received', 'WeChat message received from update stream.', {
          messageId: message.message_id,
          fromUserId: message.from_user_id,
          messageType: message.message_type,
        });
        input.onMessage(message);
      }
    }
  } finally {
    try {
      await notifyStop({
        baseUrl: input.account.baseUrl,
        token: input.account.token,
        botAgent: input.botAgent,
      });
      logger?.info('wechat.stream.stop', 'WeChat update stream stopped.');
    } catch (error) {
      // Shutdown notification is best-effort.
      logger?.warn('wechat.stream.stop_notify_failed', 'WeChat stop notification failed.', {
        error: errorSummary(error),
      });
    }
  }
}

function reconnectDelayMs(failures: number): number {
  return Math.min(60_000, 3_000 * 2 ** Math.max(0, failures - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errorSummary(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
