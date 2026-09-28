import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createInstanceLock, InstanceLockHeldError } from '../../src/core/infra/instance-lock.js';

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return {
    ...fs,
    openSync: vi.fn(fs.openSync),
    writeSync: vi.fn(fs.writeSync),
    writeFileSync: vi.fn(fs.writeFileSync),
    linkSync: vi.fn(fs.linkSync),
    readFileSync: vi.fn(fs.readFileSync),
    rmSync: vi.fn(fs.rmSync),
  };
});

let home: string;
let path: string;
beforeEach(() => {
  home = fs.mkdtempSync(join(tmpdir(), 'ep-lock-errors-'));
  path = join(home, '.instance.lock');
});
afterEach(() => {
  vi.mocked(fs.openSync).mockReset();
  vi.mocked(fs.writeSync).mockReset();
  vi.mocked(fs.writeFileSync).mockReset();
  vi.mocked(fs.linkSync).mockReset();
  vi.mocked(fs.readFileSync).mockReset();
  vi.mocked(fs.rmSync).mockReset();
  fs.rmSync(home, { recursive: true, force: true });
});

it('publishes a complete private record exclusively with mode 0600 and removes its temporary name', () => {
  const link = fs.linkSync;
  let observed = false;
  vi.mocked(link).mockImplementationOnce((source, destination) => {
    observed = true;
    expect(String(source)).not.toBe(path);
    expect(destination).toBe(path);
    expect(fs.existsSync(path)).toBe(false);
    expect(JSON.parse(fs.readFileSync(source, 'utf8'))).toMatchObject({ pid: process.pid });
    expect(fs.statSync(source).mode & 0o777).toBe(0o600);
    // Call the unmocked primitive after observing the real private file.
    return fsOriginal.linkSync(source, destination);
  });
  const lock = createInstanceLock(path);
  lock.acquire();
  expect(observed).toBe(true);
  expect(fs.readdirSync(home)).toEqual(['.instance.lock']);
  lock.release();
  expect(fs.readdirSync(home)).toEqual([]);
});

const fsOriginal = await vi.importActual<typeof import('node:fs')>('node:fs');

it.each(['EACCES', 'EIO'])('fails closed on %s reading an existing lock and cleans its private file', (code) => {
  const record = JSON.stringify({ pid: process.pid });
  fs.writeFileSync(path, record);
  const inode = fs.statSync(path).ino;
  const failure = Object.assign(new Error(`${code}: unable to read ${path}`), { code, path });
  vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
    throw failure;
  });
  const lock = createInstanceLock(path);
  let caught: unknown;
  try {
    lock.acquire();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBe(failure);
  expect(fs.readFileSync(path, 'utf8')).toBe(record);
  expect(fs.statSync(path).ino).toBe(inode);
  expect(fs.readdirSync(home)).toEqual(['.instance.lock']);
  lock.release();
  expect(fs.readFileSync(path, 'utf8')).toBe(record);
  // A failed read never claims ownership: retry still consults the real owner.
  expect(() => lock.acquire()).toThrow(InstanceLockHeldError);
  expect(fs.readdirSync(home)).toEqual(['.instance.lock']);
});

it('recovers when an existing lock disappears between publication contention and reading', () => {
  fs.writeFileSync(path, JSON.stringify({ pid: process.pid }));
  vi.mocked(fs.readFileSync).mockImplementationOnce((file, ...options) => {
    fsOriginal.rmSync(path);
    return fsOriginal.readFileSync(file, ...options);
  });
  const lock = createInstanceLock(path);
  lock.acquire();
  expect(JSON.parse(fs.readFileSync(path, 'utf8'))).toMatchObject({ pid: process.pid });
  expect(fs.readdirSync(home)).toEqual(['.instance.lock']);
  lock.release();
  expect(fs.readdirSync(home)).toEqual([]);
});

it('does not reclaim an existing malformed lock when its private write fails', () => {
  fs.writeFileSync(path, '');
  const failure = new Error('private write failed');
  vi.mocked(fs.writeSync).mockImplementationOnce(() => {
    throw failure;
  });
  vi.mocked(fs.writeFileSync).mockImplementationOnce(() => {
    throw failure;
  });
  const lock = createInstanceLock(path);
  expect(() => lock.acquire()).toThrow(failure);
  lock.release();
  expect(fs.readFileSync(path, 'utf8')).toBe('');
  expect(fs.readdirSync(home)).toEqual(['.instance.lock']);
});

it('does not interpret a non-contention publication error as a stale-lock signal', () => {
  fs.writeFileSync(path, '');
  const failure = Object.assign(new Error('publication denied'), { code: 'EPERM' });
  vi.mocked(fs.linkSync).mockImplementationOnce(() => {
    throw failure;
  });
  const lock = createInstanceLock(path);
  expect(() => lock.acquire()).toThrow(failure);
  lock.release();
  expect(fs.readFileSync(path, 'utf8')).toBe('');
  expect(fs.readdirSync(home)).toEqual(['.instance.lock']);
});

it('cleans the private file when a published live owner rejects contention', () => {
  fs.writeFileSync(path, JSON.stringify({ pid: process.pid }));
  expect(() => createInstanceLock(path).acquire()).toThrow(InstanceLockHeldError);
  expect(fs.readdirSync(home)).toEqual(['.instance.lock']);
});

it('does not remove an unowned temporary path when exclusive private creation fails', () => {
  const failure = Object.assign(new Error('private open failed'), { code: 'EEXIST' });
  vi.mocked(fs.openSync).mockImplementationOnce((temporary) => {
    fsOriginal.writeFileSync(temporary, 'unowned');
    throw failure;
  });
  expect(() => createInstanceLock(path).acquire()).toThrow(failure);
  const names = fs.readdirSync(home);
  expect(names).toHaveLength(1);
  expect(fs.readFileSync(join(home, names[0]), 'utf8')).toBe('unowned');
  expect(fs.existsSync(path)).toBe(false);
});

it('retains release ownership when removal fails so the owner can retry cleanup', () => {
  const lock = createInstanceLock(path);
  lock.acquire();
  const failure = new Error('release failed');
  vi.mocked(fs.rmSync).mockImplementationOnce(() => {
    throw failure;
  });
  expect(() => lock.release()).toThrow(failure);
  expect(fs.existsSync(path)).toBe(true);
  lock.release();
  expect(fs.existsSync(path)).toBe(false);
});

it('rolls back publication if removing its private name fails without claiming acquisition', () => {
  const failure = new Error('temporary cleanup failed');
  vi.mocked(fs.rmSync).mockImplementationOnce(() => {
    throw failure;
  });
  const lock = createInstanceLock(path);
  expect(() => lock.acquire()).toThrow(failure);
  expect(fs.existsSync(path)).toBe(false);
  lock.release();
});

it('leaves a same-PID replacement intact when releasing the previous published inode', () => {
  const lock = createInstanceLock(path);
  lock.acquire();
  fs.rmSync(path);
  fs.writeFileSync(path, JSON.stringify({ pid: process.pid, replacement: true }));
  lock.release();
  expect(JSON.parse(fs.readFileSync(path, 'utf8'))).toMatchObject({ replacement: true });
});

it.each([-1, undefined])('retains abandoned recovery and release/reacquire for PID %s', (pid) => {
  fs.writeFileSync(path, pid === undefined ? '' : JSON.stringify({ pid }));
  const lock = createInstanceLock(path);
  lock.acquire();
  expect(JSON.parse(fs.readFileSync(path, 'utf8'))).toMatchObject({ pid: process.pid });
  expect(fs.readdirSync(home)).toEqual(['.instance.lock']);
  lock.release();
  lock.acquire();
  lock.release();
  expect(fs.readdirSync(home)).toEqual([]);
});
