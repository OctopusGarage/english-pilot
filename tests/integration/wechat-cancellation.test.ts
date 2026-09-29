import { mkdtempSync, rmSync } from 'node:fs';
import { getEventListeners } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getWeChatUpdates } from '../../src/channels/wechat/api.js';
import { runWeChatUpdateStream, type WeChatUpdateStreamInput } from '../../src/channels/wechat/update-stream.js';
import { loadWeChatSyncCursor, saveWeChatSyncCursor } from '../../src/channels/wechat/state.js';

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'ep-cancel-'));
  vi.stubEnv('ENGLISH_PILOT_HOME', home);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function input(overrides: Partial<WeChatUpdateStreamInput>): WeChatUpdateStreamInput {
  return {
    account: { accountId: 'cancel-bot', token: 'fixture', baseUrl: 'https://fixture.invalid', savedAt: 'audit' },
    maxIterations: 1,
    getUpdates: async () => ({ ret: 0, msgs: [], get_updates_buf: 'batch-cursor' }),
    notifyStart: async () => {},
    notifyStop: async () => {},
    onMessage: async () => {},
    ...overrides,
  };
}

it('does not dispatch a fetched batch or commit its cursor after cancellation', async () => {
  const abort = new AbortController();
  const messages: unknown[] = [];
  await runWeChatUpdateStream(
    input({
      abortSignal: abort.signal,
      getUpdates: async () => {
        abort.abort();
        return { ret: 0, msgs: [{ message_id: 1 }], get_updates_buf: 'stale' };
      },
      onMessage: (message) => {
        messages.push(message);
      },
    }),
  );
  expect(messages).toEqual([]);
  expect(loadWeChatSyncCursor('cancel-bot')).toBe('');
});

it('does not start another batch message or overwrite a replacement cursor after a pending handler is aborted', async () => {
  const abort = new AbortController(),
    entered = deferred(),
    gate = deferred();
  const messages: unknown[] = [];
  const running = runWeChatUpdateStream(
    input({
      abortSignal: abort.signal,
      getUpdates: async () => ({ ret: 0, msgs: [{ message_id: 1 }, { message_id: 2 }], get_updates_buf: 'stale' }),
      onMessage: async (message) => {
        messages.push(message.message_id);
        entered.resolve();
        await gate.promise;
      },
    }),
  );
  await entered.promise;
  abort.abort();
  saveWeChatSyncCursor('cancel-bot', 'replacement');
  gate.resolve();
  await running;
  expect(messages).toEqual([1]);
  expect(loadWeChatSyncCursor('cancel-bot')).toBe('replacement');
});

it('does not retry a non-AbortError that races cancellation', async () => {
  const abort = new AbortController();
  const waits: number[] = [];
  await runWeChatUpdateStream(
    input({
      abortSignal: abort.signal,
      getUpdates: async () => {
        abort.abort();
        throw new Error('network failure');
      },
      sleep: async (ms) => {
        waits.push(ms);
      },
    }),
  );
  expect(waits).toEqual([]);
});

it.each(['network', 'api', 'session'] as const)(
  'clears an owned %s retry timer on abort and enters stop finally',
  async (failure) => {
    vi.useFakeTimers();
    const abort = new AbortController();
    let stopped = 0;
    const running = runWeChatUpdateStream(
      input({
        abortSignal: abort.signal,
        getUpdates: async () => {
          if (failure === 'network') throw new Error('network failure');
          return { ret: failure === 'session' ? -14 : 1 };
        },
        notifyStop: async () => {
          stopped++;
        },
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    abort.abort();
    await vi.advanceTimersByTimeAsync(0);
    // Let the pre-fix stream finish too, so a red assertion never leaks its pending task.
    const pendingTimers = vi.getTimerCount(),
      stoppedOnAbort = stopped;
    await vi.runAllTimersAsync();
    await running;
    expect(pendingTimers).toBe(0);
    expect(stoppedOnAbort).toBe(1);
  },
);

it('does not schedule a session-expiry wait after abort during refresh', async () => {
  const abort = new AbortController();
  const waits: number[] = [];
  await runWeChatUpdateStream(
    input({
      abortSignal: abort.signal,
      getUpdates: async () => ({ ret: -14 }),
      notifyStart: async () => {
        abort.abort();
      },
      sleep: async (ms) => {
        waits.push(ms);
      },
    }),
  );
  expect(waits).toEqual([]);
});

it('keeps the production AbortError-empty behavior without retry on daemon abort', async () => {
  const abort = new AbortController(),
    entered = deferred();
  const waits: number[] = [];
  let stopped = 0;
  const running = runWeChatUpdateStream(
    input({
      abortSignal: abort.signal,
      getUpdates: (options) =>
        getWeChatUpdates({
          ...options,
          fetch: async (_url, init) => {
            entered.resolve();
            return new Promise<Response>((_resolve, reject) => {
              init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
                once: true,
              });
            });
          },
        }),
      sleep: async (ms) => {
        waits.push(ms);
      },
      notifyStop: async () => {
        stopped++;
      },
    }),
  );
  await entered.promise;
  abort.abort();
  await running;
  expect(waits).toEqual([]);
  expect(stopped).toBe(1);
});

it('keeps injected sleep and normal retries, and commits only completed batches', async () => {
  const waits: number[] = [],
    messages: unknown[] = [];
  let calls = 0;
  await runWeChatUpdateStream(
    input({
      maxIterations: 3,
      getUpdates: async () => {
        calls++;
        if (calls === 1) throw new Error('network');
        if (calls === 2) return { errcode: 1 };
        return { ret: 0, msgs: [{ message_id: 1 }], get_updates_buf: 'complete' };
      },
      sleep: async (ms) => {
        waits.push(ms);
      },
      onMessage: (message) => {
        messages.push(message.message_id);
      },
    }),
  );
  expect(waits).toEqual([3000, 3000]);
  expect(messages).toEqual([1]);
  expect(loadWeChatSyncCursor('cancel-bot')).toBe('complete');
});

it('removes the abort listener when an owned retry timer completes normally', async () => {
  vi.useFakeTimers();
  const abort = new AbortController();
  const running = runWeChatUpdateStream(
    input({
      abortSignal: abort.signal,
      getUpdates: async () => {
        throw new Error('network');
      },
    }),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(getEventListeners(abort.signal, 'abort')).toHaveLength(1);
  await vi.runAllTimersAsync();
  await running;
  expect(vi.getTimerCount()).toBe(0);
  expect(getEventListeners(abort.signal, 'abort')).toHaveLength(0);
});

it('runs stop finally on handler failure without committing the cursor, even when stop fails', async () => {
  let stopped = 0;
  await expect(
    runWeChatUpdateStream(
      input({
        getUpdates: async () => ({ ret: 0, msgs: [{ message_id: 1 }], get_updates_buf: 'stale' }),
        onMessage: async () => {
          throw new Error('handler failed');
        },
        notifyStop: async () => {
          stopped++;
          throw new Error('stop failed');
        },
      }),
    ),
  ).rejects.toThrow('handler failed');
  expect(stopped).toBe(1);
  expect(loadWeChatSyncCursor('cancel-bot')).toBe('');
});
