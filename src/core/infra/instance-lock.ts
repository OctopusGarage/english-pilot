import { randomUUID } from 'node:crypto';
import { closeSync, fstatSync, linkSync, lstatSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

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
  let owned: { dev: number; ino: number; fd: number } | undefined;
  return {
    acquire() {
      if (owned) return;
      const temporaryPath = `${lockPath}.${randomUUID()}.tmp`;
      let ownsTemporary = false;
      let fd: number | undefined;
      let failure: unknown;
      try {
        const descriptor = openSync(temporaryPath, 'wx', 0o600);
        fd = descriptor;
        ownsTemporary = true;
        writeFileSync(fd, JSON.stringify({ pid, acquiredAt: new Date().toISOString() }), 'utf8');
        const identity = fstatSync(fd);
        // Publish only a complete record; exclusive linking never exposes an empty lock.
        for (;;) {
          try {
            linkSync(temporaryPath, lockPath);
            // Pin the inode until release so an unlinked record's identity cannot be reused.
            owned = { dev: identity.dev, ino: identity.ino, fd: descriptor };
            fd = undefined;
            break;
          } catch (error) {
            // Only publication contention can justify examining an existing lock.
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            const lockPid = readLockPid(lockPath);
            if (lockPid !== undefined && isProcessAlive(lockPid)) {
              throw new InstanceLockHeldError(lockPath, lockPid);
            }
            rmSync(lockPath, { force: true });
          }
        }
      } catch (error) {
        failure = error;
      }
      try {
        if (ownsTemporary) rmSync(temporaryPath, { force: true });
      } catch (error) {
        failure ??= error;
      }
      try {
        if (fd !== undefined) closeSync(fd);
      } catch (error) {
        failure ??= error;
      }
      if (failure !== undefined) {
        // An acquisition that throws must not retain a published lock.
        try {
          this.release();
        } catch {
          // Keep the acquisition/temporary-cleanup error primary.
        }
        throw failure;
      }
    },
    release() {
      if (!owned) return;
      try {
        const current = lstatSync(lockPath);
        if (current.dev === owned.dev && current.ino === owned.ino) rmSync(lockPath, { force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      closeSync(owned.fd);
      owned = undefined;
    },
  };
}

function readLockPid(lockPath: string): number | undefined {
  let raw: string;
  try {
    raw = readFileSync(lockPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  try {
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
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
