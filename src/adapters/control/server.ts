import { existsSync, rmSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import type { ControlRequest, ControlResponse, DaemonStatus } from './protocol.js';

export interface ControlServer {
  close(): Promise<void>;
}

export async function startControlServer(input: {
  socketPath: string;
  getStatus: () => DaemonStatus;
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
        handleLine(line, socket, input.getStatus);
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

function handleLine(line: string, socket: Socket, getStatus: () => DaemonStatus): void {
  const response = buildResponse(line, getStatus);
  socket.write(`${JSON.stringify(response)}\n`);
}

function buildResponse(line: string, getStatus: () => DaemonStatus): ControlResponse {
  try {
    const request = JSON.parse(line) as Partial<ControlRequest>;
    const id = typeof request.id === 'string' ? request.id : 'unknown';
    if (request.method === 'status') {
      return { id, ok: true, result: getStatus() };
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
