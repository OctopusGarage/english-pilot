import { createConnection } from 'node:net';
import type { ControlRequest, ControlResponse, DaemonStatus } from './protocol.js';

export interface ControlClient {
  status(): Promise<DaemonStatus>;
}

export function createControlClient(socketPath: string): ControlClient {
  return {
    status: () => request(socketPath, { id: `${Date.now()}-${Math.random()}`, method: 'status' }),
  };
}

async function request(socketPath: string, payload: ControlRequest): Promise<DaemonStatus> {
  const response = await rawRequest(socketPath, payload);
  if (!response.ok) throw new Error(response.error);
  return response.result;
}

function rawRequest(socketPath: string, payload: ControlRequest): Promise<ControlResponse> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let buffer = '';
    socket.setEncoding('utf8');
    socket.once('connect', () => {
      socket.write(`${JSON.stringify(payload)}\n`);
    });
    socket.once('error', reject);
    socket.on('data', (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      socket.end();
      try {
        resolve(JSON.parse(buffer.slice(0, newline)) as ControlResponse);
      } catch (error) {
        reject(error);
      }
    });
  });
}
