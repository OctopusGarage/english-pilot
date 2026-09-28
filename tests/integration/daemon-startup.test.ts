import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as control from '../../src/adapters/control/server.js';
import * as lifecycle from '../../src/core/infra/lifecycle.js';
import { createInstanceLock, InstanceLockHeldError } from '../../src/core/infra/instance-lock.js';
import { ensureRuntimeLayout } from '../../src/core/infra/state-dir.js';
import { runDaemon } from '../../src/daemon/run-daemon.js';
import * as channels from '../../src/daemon/channel-lifecycle.js';

describe('daemon startup rollback', () => {
  let previousHome: string | undefined;
  let home: string;
  let servers: control.ControlServer[];
  const startServer = control.startControlServer;
  const cleanMarker = lifecycle.markCleanShutdown;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    home = mkdtempSync(join(tmpdir(), 'ep-start-'));
    process.env.ENGLISH_PILOT_HOME = home;
    servers = [];
    vi.spyOn(control, 'startControlServer').mockImplementation(async (input) => {
      const server = await startServer(input);
      servers.push(server);
      return server;
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Also close servers leaked by the pre-fix implementation in the red run.
    for (const server of servers) await server.close().catch(() => {});
    if (previousHome === undefined) delete process.env.ENGLISH_PILOT_HOME;
    else process.env.ENGLISH_PILOT_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  });

  function expectReleased(): void {
    const layout = ensureRuntimeLayout();
    expect(existsSync(layout.instanceLockPath)).toBe(false);
    expect(existsSync(layout.runningMarkerPath)).toBe(false);
    expect(process.listenerCount('SIGINT')).toBe(0);
    expect(process.listenerCount('SIGTERM')).toBe(0);
  }

  it('releases lock and marker after socket obstruction, allowing same-process retry', async () => {
    const layout = ensureRuntimeLayout();
    mkdirSync(layout.controlSocketPath);
    await expect(runDaemon({ waitForever: false })).rejects.toMatchObject({ code: 'ERR_FS_EISDIR' });
    expectReleased();
    // The obstructing directory is not a resource created by this attempt.
    expect(existsSync(layout.controlSocketPath)).toBe(true);
    rmSync(layout.controlSocketPath, { recursive: true });
    await expect(runDaemon({ waitForever: false })).resolves.toMatchObject({ operation: 'daemon-run' });
    expectReleased();
    expect(existsSync(layout.controlSocketPath)).toBe(false);
  });

  it('releases the acquired lock when marker creation fails without deleting the obstruction', async () => {
    const layout = ensureRuntimeLayout();
    mkdirSync(layout.runningMarkerPath);
    await expect(runDaemon({ waitForever: false })).rejects.toMatchObject({ code: 'EISDIR' });
    expect(existsSync(layout.instanceLockPath)).toBe(false);
    expect(existsSync(layout.runningMarkerPath)).toBe(true);
    rmSync(layout.runningMarkerPath, { recursive: true });
    await expect(runDaemon({ waitForever: false })).resolves.toMatchObject({ operation: 'daemon-run' });
    expectReleased();
  });

  it('rolls back a partially written marker when its creation throws', async () => {
    const mark = lifecycle.markRunning;
    const primary = new Error('marker write failed');
    vi.spyOn(lifecycle, 'markRunning').mockImplementationOnce((path, marker) => {
      mark(path, marker);
      // Simulate writeFileSync creating/truncating a file before an I/O error.
      writeFileSync(path, '{"pid":');
      throw primary;
    });
    await expect(runDaemon({ waitForever: false })).rejects.toBe(primary);
    expectReleased();
  });

  it('releases owned resources on signal-driven shutdown', async () => {
    await expect(
      runDaemon({
        log: () => {
          setImmediate(() => process.emit('SIGTERM'));
        },
      }),
    ).resolves.toMatchObject({ operation: 'daemon-run' });
    expectReleased();
    expect(existsSync(ensureRuntimeLayout().controlSocketPath)).toBe(false);
  });

  it('preserves a pre-existing marker if startup fails before writing its own marker', async () => {
    const layout = ensureRuntimeLayout();
    lifecycle.markRunning(layout.runningMarkerPath, { pid: -1, startedAt: '2026-01-01T00:00:00Z' });
    const before = readFileSync(layout.runningMarkerPath, 'utf8');
    const primary = new Error('marker creation denied');
    vi.spyOn(lifecycle, 'markRunning').mockImplementationOnce(() => {
      throw primary;
    });
    await expect(runDaemon({ waitForever: false })).rejects.toBe(primary);
    expect(existsSync(layout.instanceLockPath)).toBe(false);
    expect(readFileSync(layout.runningMarkerPath, 'utf8')).toBe(before);
  });

  it('closes the server and removes signal handlers when startup logging throws', async () => {
    const primary = new Error('startup callback failed');
    await expect(
      runDaemon({
        waitForever: false,
        log: () => {
          throw primary;
        },
      }),
    ).rejects.toBe(primary);
    expectReleased();
    expect(existsSync(ensureRuntimeLayout().controlSocketPath)).toBe(false);
    await expect(runDaemon({ waitForever: false })).resolves.toMatchObject({ operation: 'daemon-run' });
  });

  it('releases marker and lock even when server close rejects', async () => {
    const cleanup = new Error('server close failed');
    vi.mocked(control.startControlServer).mockImplementationOnce(async (input) => {
      const server = await startServer(input);
      servers.push(server);
      return {
        close: async () => {
          await server.close();
          throw cleanup;
        },
      };
    });
    await expect(runDaemon({ waitForever: false })).rejects.toBe(cleanup);
    expectReleased();
  });

  it('keeps the startup error primary while attempting all cleanup steps', async () => {
    const primary = new Error('startup failed');
    vi.spyOn(lifecycle, 'markCleanShutdown').mockImplementationOnce((path) => {
      cleanMarker(path);
      throw new Error('marker cleanup failed');
    });
    await expect(
      runDaemon({
        waitForever: false,
        log: () => {
          throw primary;
        },
      }),
    ).rejects.toBe(primary);
    expectReleased();
  });

  it('keeps a runtime error primary when shutdown also fails', async () => {
    const primary = new Error('channel lifecycle failed');
    vi.spyOn(channels, 'startConfiguredChannelRuntimes').mockImplementationOnce(() => {
      throw primary;
    });
    vi.mocked(control.startControlServer).mockImplementationOnce(async (input) => {
      const server = await startServer(input);
      servers.push(server);
      return {
        close: async () => {
          await server.close();
          throw new Error('close failed');
        },
      };
    });
    await expect(runDaemon({ waitForever: false })).rejects.toBe(primary);
    expectReleased();
    expect(existsSync(ensureRuntimeLayout().controlSocketPath)).toBe(false);
  });

  it('leaves another attempt’s lock, marker and server intact when acquisition fails', async () => {
    const layout = ensureRuntimeLayout();
    const lock = createInstanceLock(layout.instanceLockPath);
    lock.acquire();
    lifecycle.markRunning(layout.runningMarkerPath);
    const markerBefore = readFileSync(layout.runningMarkerPath, 'utf8');
    const lockBefore = readFileSync(layout.instanceLockPath, 'utf8');
    try {
      await expect(runDaemon({ waitForever: false })).rejects.toBeInstanceOf(InstanceLockHeldError);
      expect(readFileSync(layout.runningMarkerPath, 'utf8')).toBe(markerBefore);
      expect(readFileSync(layout.instanceLockPath, 'utf8')).toBe(lockBefore);
      expect(servers).toHaveLength(0);
    } finally {
      lifecycle.markCleanShutdown(layout.runningMarkerPath);
      lock.release();
    }
  });
});
