import { existsSync, rmSync } from 'node:fs';
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
  const server = createServer((socket) => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        void handleLine(line, socket, input);
        newline = buffer.indexOf('\n');
      }
    });
  });
  await listen(server, input.socketPath);
  return {
    close: async () => {
      await close(server);
      if (existsSync(input.socketPath)) rmSync(input.socketPath, { force: true });
    },
  };
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
  socket.write(`${JSON.stringify(response)}\n`);
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
      resolve();
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
