import { getWeChatUpdates, notifyWeChatStart, notifyWeChatStop, type WeChatUpdateMessage } from './api.js';
import { loadWeChatSyncCursor, saveWeChatSyncCursor, type WeChatAccount } from './state.js';

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
        failures = 0;
      } catch (error) {
        failures += 1;
        input.log?.(
          `WeChat getupdates failed for ${input.account.accountId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        await wait(reconnectDelayMs(failures));
        continue;
      }
      if (updates.ret === -14 || updates.errcode === -14) {
        input.log?.(`WeChat session expired for ${input.account.accountId}; run english-pilot wechat setup again.`);
        try {
          await notifyStart({
            baseUrl: input.account.baseUrl,
            token: input.account.token,
            botAgent: input.botAgent,
          });
        } catch (error) {
          input.log?.(
            `WeChat session refresh notifyStart failed for ${input.account.accountId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        await wait(60_000);
        continue;
      }
      if (updates.ret && updates.ret !== 0) {
        input.log?.(`WeChat getupdates failed for ${input.account.accountId}: ${updates.errmsg ?? updates.ret}`);
        await wait(reconnectDelayMs(1));
        continue;
      }
      if (updates.longpolling_timeout_ms && updates.longpolling_timeout_ms > 0) {
        timeoutMs = updates.longpolling_timeout_ms;
      }
      if (updates.get_updates_buf) {
        cursor = updates.get_updates_buf;
        saveWeChatSyncCursor(input.account.accountId, cursor);
      }
      for (const message of updates.msgs ?? []) {
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
    } catch {
      // Shutdown notification is best-effort.
    }
  }
}

function reconnectDelayMs(failures: number): number {
  return Math.min(60_000, Math.max(3_000, failures * 3_000));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
