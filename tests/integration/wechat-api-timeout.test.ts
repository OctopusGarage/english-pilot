import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  getWeChatUpdates,
  notifyWeChatStart,
  notifyWeChatStop,
  sendWeChatMessage,
} from '../../src/channels/wechat/api.js';
import { runWeChatUpdateStream } from '../../src/channels/wechat/update-stream.js';
import { loadWeChatSyncCursor } from '../../src/channels/wechat/state.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// Model fetch's separate header/body phases and its cooperative body abort.
function pendingBody(status = 200) {
  let body!: ReadableStreamDefaultController<Uint8Array>;
  let signal!: AbortSignal;
  const abort = () => body.error(new DOMException('aborted', 'AbortError'));
  const customFetch: typeof fetch = async (_url, init) => {
    signal = init!.signal!;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        body = controller;
        signal.addEventListener('abort', abort, { once: true });
      },
    });
    return new Response(stream, { status });
  };
  return {
    fetch: customFetch,
    get signal() {
      return signal;
    },
    complete(text: string) {
      signal.removeEventListener('abort', abort);
      body.enqueue(new TextEncoder().encode(text));
      body.close();
    },
    fail() {
      signal.removeEventListener('abort', abort);
      body.error(new Error('body failed'));
    },
  };
}

const options = { baseUrl: 'https://fixture.invalid', token: 'fixture' };

it.each(['updates', 'start', 'stop', 'send'] as const)(
  'keeps the %s deadline active while the body stalls',
  async (kind) => {
    vi.useFakeTimers();
    const body = pendingBody();
    const input = { ...options, fetch: body.fetch };
    const request =
      kind === 'updates'
        ? getWeChatUpdates({ ...input, syncCursor: 'previous', timeoutMs: 50 })
        : kind === 'start'
          ? notifyWeChatStart(input)
          : kind === 'stop'
            ? notifyWeChatStop(input)
            : sendWeChatMessage({ ...input, to: 'recipient', text: 'hello' });
    let settled = false;
    const observed = request.then(
      (value) => {
        settled = true;
        return value;
      },
      (error: Error) => {
        settled = true;
        return error.name;
      },
    );
    await vi.advanceTimersByTimeAsync(kind === 'updates' ? 50 : kind === 'send' ? 15_000 : 10_000);
    const settledAtDeadline = settled;
    const abortedAtDeadline = body.signal.aborted;
    // Complete the old implementation too, so red never leaves a pending read.
    if (!settled) body.complete('{"ret":0,"msgs":[],"get_updates_buf":"late"}');
    const result = await observed;
    expect(settledAtDeadline).toBe(true);
    expect(abortedAtDeadline).toBe(true);
    expect(result).toEqual(kind === 'updates' ? { ret: 0, msgs: [], get_updates_buf: 'previous' } : 'AbortError');
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('clears the deadline after a successful body completes and does not abort it later', async () => {
  vi.useFakeTimers();
  const body = pendingBody();
  const request = getWeChatUpdates({ ...options, fetch: body.fetch, syncCursor: '', timeoutMs: 50 });
  await vi.advanceTimersByTimeAsync(10);
  body.complete('{"ret":0,"msgs":[],"get_updates_buf":"next"}');
  expect(await request).toEqual({ ret: 0, msgs: [], get_updates_buf: 'next' });
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(100);
  expect(body.signal.aborted).toBe(false);
});

it.each(['json', 'http', 'body', 'fetch'] as const)('clears the deadline after a %s failure', async (failure) => {
  vi.useFakeTimers();
  const body = pendingBody(failure === 'http' ? 503 : 200);
  const request = getWeChatUpdates({
    ...options,
    fetch:
      failure === 'fetch'
        ? async () => {
            throw new Error('fetch failed');
          }
        : body.fetch,
    syncCursor: '',
    timeoutMs: 50,
  });
  const observed = request.catch((error: Error) => error);
  await vi.advanceTimersByTimeAsync(0);
  if (failure === 'body') body.fail();
  else if (failure !== 'fetch') body.complete(failure === 'json' ? '{invalid' : 'unavailable');
  const error = await observed;
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toMatch(
    failure === 'json' ? /JSON|property/i : failure === 'http' ? /HTTP 503: unavailable/ : /failed/,
  );
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps AbortError-empty updates and clears the deadline when the caller aborts a pending body', async () => {
  vi.useFakeTimers();
  const abort = new AbortController();
  const body = pendingBody();
  const request = getWeChatUpdates({
    ...options,
    fetch: body.fetch,
    syncCursor: 'previous',
    timeoutMs: 50,
    abortSignal: abort.signal,
  });
  await vi.advanceTimersByTimeAsync(0);
  abort.abort();
  expect(await request).toEqual({ ret: 0, msgs: [], get_updates_buf: 'previous' });
  expect(vi.getTimerCount()).toBe(0);
});

it('exits the production stream without retry, messages, or cursor writes on body cancellation', async () => {
  vi.useFakeTimers();
  const home = mkdtempSync(join(tmpdir(), 'ep-body-abort-'));
  vi.stubEnv('ENGLISH_PILOT_HOME', home);
  const abort = new AbortController();
  const body = pendingBody();
  const onMessage = vi.fn();
  const sleep = vi.fn(async () => {});
  const notifyStop = vi.fn(async () => {});
  let polls = 0;
  try {
    const running = runWeChatUpdateStream({
      account: { accountId: 'body-bot', ...options, savedAt: 'fixture' },
      abortSignal: abort.signal,
      getUpdates: (input) => {
        polls++;
        return getWeChatUpdates({ ...input, fetch: body.fetch });
      },
      onMessage,
      sleep,
      notifyStop,
    });
    await vi.advanceTimersByTimeAsync(0);
    abort.abort();
    await running;
    expect(polls).toBe(1);
    expect(onMessage).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
    expect(notifyStop).toHaveBeenCalledOnce();
    expect(loadWeChatSyncCursor('body-bot')).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
