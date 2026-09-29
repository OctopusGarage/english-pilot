import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createConnection, Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startControlServer, type ControlServer } from '../../src/adapters/control/server.js';
import { createControlClient } from '../../src/adapters/control/client.js';
import { ensureRuntimeLayout } from '../../src/core/infra/state-dir.js';
import { runDaemon } from '../../src/daemon/run-daemon.js';
import * as delivery from '../../src/daemon/wechat-daily-review-delivery.js';

let home: string;
let cleanups: Array<() => void | Promise<void>>;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'ep-close-'));
  vi.stubEnv('ENGLISH_PILOT_HOME', home);
  cleanups = [];
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.reverse()) await cleanup();
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

async function settlesWithin(promise: Promise<unknown>, ms = 150): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const status = () => ({
  ok: true,
  pid: process.pid,
  startedAt: 'audit',
  channels: { feishu: 'disabled' as const, wechat: 'disabled' as const },
});

async function connect(socketPath: string) {
  const socket = createConnection(socketPath);
  socket.on('error', () => {});
  cleanups.push(() => {
    socket.destroy();
  });
  await once(socket, 'connect');
  await new Promise<void>((resolve) => setImmediate(resolve));
  return socket;
}

function own(server: ControlServer) {
  cleanups.unshift(() => server.close().catch(() => {}));
  return server;
}

it('releases daemon ownership on shutdown while an idle control peer stays connected', async () => {
  const ready = deferred();
  const running = runDaemon({ log: () => ready.resolve() });
  cleanups.unshift(() => running.then(() => {}));
  await ready.promise;
  const layout = ensureRuntimeLayout();
  await connect(layout.controlSocketPath);
  process.emit('SIGTERM');
  expect(await settlesWithin(running)).toBe(true);
  expect(existsSync(layout.instanceLockPath)).toBe(false);
  expect(existsSync(layout.runningMarkerPath)).toBe(false);
  await expect(runDaemon({ waitForever: false })).resolves.toMatchObject({ operation: 'daemon-run' });
});

it('retains the daemon lock until an admitted delivery finishes after client disconnect', async () => {
  const ready = deferred(),
    entered = deferred(),
    gate = deferred();
  cleanups.push(gate.resolve);
  vi.spyOn(delivery, 'createWeChatDailyReviewDeliveryHandler').mockReturnValue(async () => {
    entered.resolve();
    await gate.promise;
    return {
      operation: 'wechat-daily-review-daemon-delivery',
      delivered: true,
      network: false,
      accountCount: 1,
      recipientCount: 1,
      messagePreview: 'review',
    };
  });
  let finished = false;
  const running = runDaemon({ log: () => ready.resolve() }).then(() => {
    finished = true;
  });
  // Resolve the admitted handler before joining the daemon during failed-test cleanup.
  cleanups.unshift(() => running);
  await ready.promise;
  const layout = ensureRuntimeLayout();
  const client = await connect(layout.controlSocketPath);
  client.write('{"id":"delivery","method":"wechat.dailyReview.deliver","payload":{}}\n');
  await entered.promise;
  client.destroy();
  await once(client, 'close');
  process.emit('SIGTERM');
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(finished).toBe(false);
  expect(existsSync(layout.instanceLockPath)).toBe(true);
  gate.resolve();
  await running;
  expect(existsSync(layout.instanceLockPath)).toBe(false);
  expect(existsSync(layout.runningMarkerPath)).toBe(false);
});

it.each(['resolve', 'reject'] as const)(
  'drains an admitted delivery after its client disconnects (%s)',
  async (outcome) => {
    const entered = deferred();
    const gate = deferred();
    let finished = false;
    cleanups.push(gate.resolve);
    const socketPath = join(home, 'control.sock');
    const server = own(
      await startControlServer({
        socketPath,
        getStatus: status,
        deliverWeChatDailyReview: async () => {
          entered.resolve();
          await gate.promise;
          finished = true;
          if (outcome === 'reject') throw new Error('delivery failed');
          return {
            operation: 'wechat-daily-review-daemon-delivery',
            delivered: true,
            network: false,
            accountCount: 1,
            recipientCount: 1,
            messagePreview: 'review',
          };
        },
      }),
    );
    const client = await connect(socketPath);
    client.write('{"id":"delivery","method":"wechat.dailyReview.deliver","payload":{}}\n');
    await entered.promise;
    client.destroy();
    await once(client, 'close');
    let closed = false;
    const closing = server.close().then(() => {
      closed = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(closed).toBe(false);
    gate.resolve();
    await closing;
    expect(finished).toBe(true);
  },
);

it('finishes an active response but admits no more requests once closing starts', async () => {
  const entered = deferred();
  const gate = deferred();
  cleanups.push(gate.resolve);
  let statusCalls = 0;
  const socketPath = join(home, 'control.sock');
  const server = own(
    await startControlServer({
      socketPath,
      getStatus: () => {
        statusCalls++;
        return status();
      },
      deliverWeChatDailyReview: async () => {
        entered.resolve();
        await gate.promise;
        return {
          operation: 'wechat-daily-review-daemon-delivery',
          delivered: true,
          network: false,
          accountCount: 1,
          recipientCount: 1,
          messagePreview: 'review',
        };
      },
    }),
  );
  const client = await connect(socketPath);
  client.write('{"id":"delivery","method":"wechat.dailyReview.deliver","payload":{}}\n');
  await entered.promise;
  const response = once(client, 'data');
  const closing = server.close();
  client.write('{"id":"late","method":"status"}\n');
  await new Promise<void>((resolve) => setImmediate(resolve));
  gate.resolve();
  const [data] = await response;
  client.end();
  await closing;
  expect(statusCalls).toBe(0);
  expect(JSON.parse(String(data))).toMatchObject({ id: 'delivery', ok: true, result: { delivered: true } });
});

it('contains errors from owned sockets and safely ignores a delayed response to a destroyed peer', async () => {
  const entered = deferred(),
    gate = deferred();
  cleanups.push(gate.resolve);
  const socketPath = join(home, 'control.sock');
  const server = own(
    await startControlServer({
      socketPath,
      getStatus: status,
      deliverWeChatDailyReview: async () => {
        entered.resolve();
        await gate.promise;
        throw new Error('late failure');
      },
    }),
  );
  const encoding = Socket.prototype.setEncoding;
  let accepted: Socket | undefined;
  vi.spyOn(Socket.prototype, 'setEncoding').mockImplementation(function (this: Socket, value) {
    accepted = encoding.call(this, value);
    return accepted;
  });
  const client = await connect(socketPath);
  client.write('{"id":"delivery","method":"wechat.dailyReview.deliver","payload":{}}\n');
  await entered.promise;
  expect(accepted).toBeDefined();
  expect(() => accepted!.emit('error', new Error('socket write failed'))).not.toThrow();
  gate.resolve();
  expect(await settlesWithin(server.close())).toBe(true);
});

it('preserves status and delivery errors for ordinary clients', async () => {
  const socketPath = join(home, 'control.sock');
  const server = own(
    await startControlServer({
      socketPath,
      getStatus: status,
      deliverWeChatDailyReview: () => {
        throw new Error('delivery failed');
      },
    }),
  );
  const client = createControlClient(socketPath);
  await expect(client.status()).resolves.toEqual(status());
  await expect(
    client.deliverWeChatDailyReview({} as Parameters<typeof client.deliverWeChatDailyReview>[0]),
  ).rejects.toThrow('delivery failed');
  await server.close();
});

it('does not unlink a replacement socket when an old server is closed again', async () => {
  const socketPath = join(home, 'control.sock');
  const oldServer = own(await startControlServer({ socketPath, getStatus: status }));
  await oldServer.close();
  const replacement = own(await startControlServer({ socketPath, getStatus: status }));
  await oldServer.close();
  expect(existsSync(socketPath)).toBe(true);
  await expect(createControlClient(socketPath).status()).resolves.toEqual(status());
  await replacement.close();
});

it('tracks a request before invoking a handler that synchronously starts shutdown', async () => {
  const entered = deferred(),
    gate = deferred();
  cleanups.push(gate.resolve);
  let closed = false;
  const socketPath = join(home, 'control.sock');
  const server = own(
    await startControlServer({
      socketPath,
      getStatus: status,
      deliverWeChatDailyReview: async () => {
        void server.close().then(() => {
          closed = true;
        });
        entered.resolve();
        await gate.promise;
        return {
          operation: 'wechat-daily-review-daemon-delivery',
          delivered: true,
          network: false,
          accountCount: 1,
          recipientCount: 1,
          messagePreview: 'review',
        };
      },
    }),
  );
  const client = await connect(socketPath);
  client.write('{"id":"delivery","method":"wechat.dailyReview.deliver","payload":{}}\n');
  await entered.promise;
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(closed).toBe(false);
  gate.resolve();
  await server.close();
  expect(closed).toBe(true);
});
