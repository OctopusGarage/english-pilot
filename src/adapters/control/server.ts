import { chmodSync, existsSync, rmSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import type {
  ControlRequest,
  ControlResponse,
  DaemonStatus,
  WeChatDailyReviewDaemonDeliveryResult,
} from './protocol.js';

export interface ControlServer {
  close(): Promise<void>;
}

export async function startControlServer(input: {
  socketPath: string;
  getStatus: () => DaemonStatus;
  deliverWeChatDailyReview?: (
    payload: Extract<ControlRequest, { method: 'wechat.dailyReview.deliver' }>['payload'],
  ) => Promise<WeChatDailyReviewDaemonDeliveryResult> | WeChatDailyReviewDaemonDeliveryResult;
}): Promise<ControlServer> {
  if (existsSync(input.socketPath)) rmSync(input.socketPath, { force: true });
  const sockets = new Map<Socket, number>();
  const requests = new Set<Promise<void>>();
  let closing = false;
  let closingPromise: Promise<void> | undefined;
  const server = createServer((socket) => {
    if (closing) {
      socket.destroy();
      return;
    }
    sockets.set(socket, 0);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      if (closing) return;
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0 && !closing) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        sockets.set(socket, (sockets.get(socket) ?? 0) + 1);
        const request = Promise.resolve()
          .then(() => handleLine(line, socket, input))
          .catch(() => {
            socket.destroy();
          })
          .finally(() => {
            requests.delete(request);
            if (!sockets.has(socket)) return;
            const active = sockets.get(socket)! - 1;
            sockets.set(socket, active);
            if (closing && active === 0) socket.destroy();
          });
        requests.add(request);
        newline = buffer.indexOf('\n');
      }
    });
  });
  const shutdown = (): Promise<void> => {
    closingPromise ??= (async () => {
      closing = true;
      // Observe listener errors immediately, but drain admitted work before throwing.
      const stopped = close(server).then(
        () => undefined,
        (error: unknown) => ({ error }),
      );
      for (const [socket, active] of sockets) {
        if (active === 0) socket.destroy();
      }
      await Promise.all(requests);
      for (const socket of sockets.keys()) socket.destroy();
      const failure = await stopped;
      if (failure) throw failure.error;
      if (existsSync(input.socketPath)) rmSync(input.socketPath, { force: true });
    })();
    return closingPromise;
  };
  try {
    await listen(server, input.socketPath);
  } catch (error) {
    if (server.listening) {
      try {
        await shutdown();
      } catch {
        // Preserve the original listen/permission failure.
      }
    }
    throw error;
  }
  return { close: shutdown };
}

async function handleLine(
  line: string,
  socket: Socket,
  input: {
    getStatus: () => DaemonStatus;
    deliverWeChatDailyReview?: (
      payload: Extract<ControlRequest, { method: 'wechat.dailyReview.deliver' }>['payload'],
    ) => Promise<WeChatDailyReviewDaemonDeliveryResult> | WeChatDailyReviewDaemonDeliveryResult;
  },
): Promise<void> {
  const response = await buildResponse(line, input);
  if (socket.destroyed || socket.writableEnded) return;
  await new Promise<void>((resolve) => {
    socket.write(`${JSON.stringify(response)}\n`, () => resolve());
  });
}

async function buildResponse(
  line: string,
  input: {
    getStatus: () => DaemonStatus;
    deliverWeChatDailyReview?: (
      payload: Extract<ControlRequest, { method: 'wechat.dailyReview.deliver' }>['payload'],
    ) => Promise<WeChatDailyReviewDaemonDeliveryResult> | WeChatDailyReviewDaemonDeliveryResult;
  },
): Promise<ControlResponse> {
  try {
    const request = JSON.parse(line) as Partial<ControlRequest>;
    const id = typeof request.id === 'string' ? request.id : 'unknown';
    if (request.method === 'status') {
      return { id, ok: true, result: input.getStatus() };
    }
    if (request.method === 'wechat.dailyReview.deliver') {
      if (!input.deliverWeChatDailyReview)
        return { id, ok: false, error: 'WeChat daily review delivery is unavailable.' };
      if (!request.payload) return { id, ok: false, error: 'WeChat daily review delivery payload is required.' };
      return { id, ok: true, result: await input.deliverWeChatDailyReview(request.payload) };
    }
    return { id, ok: false, error: 'Unsupported control method.' };
  } catch (error) {
    return {
      id: 'unknown',
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function listen(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.off('error', reject);
      try {
        chmodSync(socketPath, 0o600);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
