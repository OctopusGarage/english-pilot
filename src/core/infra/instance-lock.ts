import { closeSync, existsSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

export class InstanceLockHeldError extends Error {
  constructor(
    readonly lockPath: string,
    readonly pid?: number,
  ) {
    super(pid ? `EnglishPilot daemon is already running with pid ${pid}.` : 'EnglishPilot daemon is already running.');
    this.name = 'InstanceLockHeldError';
  }
}

export interface InstanceLock {
  acquire(): void;
  release(): void;
}

export function createInstanceLock(lockPath: string, pid = process.pid): InstanceLock {
  let acquired = false;
  return {
    acquire() {
      if (acquired) return;
      try {
        const fd = openSync(lockPath, 'wx');
        closeSync(fd);
        writeFileSync(lockPath, JSON.stringify({ pid, acquiredAt: new Date().toISOString() }), 'utf8');
        acquired = true;
      } catch (error) {
        if (!existsSync(lockPath)) throw error;
        const lockPid = readLockPid(lockPath);
        if (lockPid !== undefined && !isProcessAlive(lockPid)) {
          rmSync(lockPath, { force: true });
          this.acquire();
          return;
        }
        throw new InstanceLockHeldError(lockPath, lockPid);
      }
    },
    release() {
      if (!acquired) return;
      const lockPid = readLockPid(lockPath);
      if (lockPid === pid || lockPid === undefined) {
        rmSync(lockPath, { force: true });
      }
      acquired = false;
    },
  };
}

function readLockPid(lockPath: string): number | undefined {
  try {
    const raw = readFileSync(lockPath, 'utf8');
    const parsed = JSON.parse(raw) as { pid?: unknown };
    return typeof parsed.pid === 'number' ? parsed.pid : undefined;
  } catch {
    return undefined;
  }
}

function isProcessAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
