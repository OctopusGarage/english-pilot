import { createConnection } from 'node:net';
import type { DailyReviewIntegrationPayload } from '../../integrations/daily-pack.js';
import type {
  ControlRequest,
  ControlResponse,
  DaemonStatus,
  WeChatDailyReviewDaemonDeliveryResult,
} from './protocol.js';

export interface ControlClient {
  status(): Promise<DaemonStatus>;
  deliverWeChatDailyReview(payload: DailyReviewIntegrationPayload): Promise<WeChatDailyReviewDaemonDeliveryResult>;
}

export interface ControlClientOptions {
  timeoutMs?: number;
}

const DEFAULT_CONTROL_REQUEST_TIMEOUT_MS = 2_000;

export function createControlClient(socketPath: string, options: ControlClientOptions = {}): ControlClient {
  return {
    status: async () => {
      const result = await request(socketPath, { id: requestId(), method: 'status' }, options);
      if (!('ok' in result)) throw new Error('Daemon returned an invalid status response.');
      return result;
    },
    deliverWeChatDailyReview: async (payload) => {
      const result = await request(
        socketPath,
        { id: requestId(), method: 'wechat.dailyReview.deliver', payload },
        options,
      );
      if ('ok' in result) throw new Error('Daemon returned an invalid WeChat delivery response.');
      return result;
    },
  };
}

async function request(
  socketPath: string,
  payload: ControlRequest,
  options: ControlClientOptions,
): Promise<DaemonStatus | WeChatDailyReviewDaemonDeliveryResult> {
  const response = await rawRequest(socketPath, payload, options);
  if (!response.ok) throw new Error(response.error);
  return response.result;
}

function requestId(): string {
  return `${Date.now()}-${Math.random()}`;
}

function rawRequest(
  socketPath: string,
  payload: ControlRequest,
  options: ControlClientOptions,
): Promise<ControlResponse> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let buffer = '';
    let settled = false;
    const timeoutMs = options.timeoutMs ?? DEFAULT_CONTROL_REQUEST_TIMEOUT_MS;
    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      callback();
    };
    socket.setEncoding('utf8');
    socket.once('connect', () => {
      socket.write(`${JSON.stringify(payload)}\n`);
    });
    socket.once('error', (error) => {
      settle(() => reject(error));
    });
    socket.once('close', () => {
      settle(() => reject(new Error('Daemon control socket closed before sending a response.')));
    });
    socket.setTimeout(timeoutMs, () => {
      settle(() => {
        socket.destroy();
        reject(new Error(`Timed out waiting for daemon control response after ${timeoutMs}ms.`));
      });
    });
    socket.on('data', (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      settle(() => {
        socket.end();
        try {
          resolve(JSON.parse(buffer.slice(0, newline)) as ControlResponse);
        } catch (error) {
          reject(error);
        }
      });
    });
  });
}
