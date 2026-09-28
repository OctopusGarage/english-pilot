import { chmodSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startControlServer } from '../../src/adapters/control/server.js';

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, chmodSync: vi.fn(fs.chmodSync) };
});

let home: string;
let servers: Server[];
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'ep-ctl-'));
  servers = [];
  const listen = Server.prototype.listen;
  vi.spyOn(Server.prototype, 'listen').mockImplementation(function (
    this: Server,
    ...args: Parameters<Server['listen']>
  ) {
    servers.push(this);
    return listen.apply(this, args);
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers) await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(home, { recursive: true, force: true });
});

it('rejects and closes a bound control server when socket permission setup fails', async () => {
  const socketPath = join(home, 'control.sock');
  const primary = new Error('socket chmod denied');
  vi.mocked(chmodSync).mockImplementationOnce(() => {
    throw primary;
  });
  const input = {
    socketPath,
    getStatus: () => ({
      ok: true as const,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      channels: { feishu: 'disabled' as const, wechat: 'disabled' as const },
    }),
  };
  await expect(startControlServer(input)).rejects.toBe(primary);
  expect(servers[0]?.listening).toBe(false);
  expect(existsSync(socketPath)).toBe(false);
  const retry = await startControlServer(input);
  await retry.close();
});
