import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/adapters/cli.js';
import { createControlClient } from '../src/adapters/control/client.js';
import { startControlServer } from '../src/adapters/control/server.js';
import { createInstanceLock, InstanceLockHeldError } from '../src/core/infra/instance-lock.js';
import { detectUncleanRestart, markCleanShutdown, markRunning } from '../src/core/infra/lifecycle.js';
import { ensureRuntimeLayout } from '../src/core/infra/state-dir.js';

describe('daemon runtime infrastructure', () => {
  let previousHome: string | undefined;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-daemon-'));
    process.env.ENGLISH_PILOT_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) {
      delete process.env.ENGLISH_PILOT_HOME;
    } else {
      process.env.ENGLISH_PILOT_HOME = previousHome;
    }
    rmSync(home, { recursive: true, force: true });
  });

  it('creates a stable runtime layout under ENGLISH_PILOT_HOME', () => {
    const layout = ensureRuntimeLayout();

    expect(layout.home).toBe(home);
    expect(layout.configPath).toBe(join(home, 'config.json'));
    expect(layout.sqlitePath).toBe(join(home, 'english-pilot.sqlite'));
    expect(layout.logsDir).toBe(join(home, 'logs'));
    expect(layout.runDir).toBe(join(home, 'run'));
    expect(layout.controlSocketPath).toBe(join(home, 'run', 'english-pilot.sock'));
    expect(existsSync(layout.logsDir)).toBe(true);
    expect(existsSync(layout.runDir)).toBe(true);
  });

  it('prevents duplicate daemon instances with an atomic lock', () => {
    const layout = ensureRuntimeLayout();
    const first = createInstanceLock(layout.instanceLockPath);
    first.acquire();

    expect(() => createInstanceLock(layout.instanceLockPath).acquire()).toThrow(InstanceLockHeldError);

    first.release();
    const second = createInstanceLock(layout.instanceLockPath);
    expect(() => second.acquire()).not.toThrow();
    second.release();
  });

  it('tracks unclean restart state with a running marker', () => {
    const layout = ensureRuntimeLayout();

    expect(detectUncleanRestart(layout.runningMarkerPath)).toEqual({
      unclean: false,
      path: layout.runningMarkerPath,
    });

    markRunning(layout.runningMarkerPath, { pid: 123, startedAt: '2026-07-09T00:00:00.000Z' });

    expect(detectUncleanRestart(layout.runningMarkerPath)).toMatchObject({
      unclean: true,
      pid: 123,
      startedAt: '2026-07-09T00:00:00.000Z',
    });

    markCleanShutdown(layout.runningMarkerPath);
    expect(detectUncleanRestart(layout.runningMarkerPath).unclean).toBe(false);
  });

  it('serves daemon status over a local control socket', async () => {
    const layout = ensureRuntimeLayout();
    const server = await startControlServer({
      socketPath: layout.controlSocketPath,
      getStatus: () => ({
        ok: true,
        pid: 42,
        startedAt: '2026-07-09T00:00:00.000Z',
        channels: {
          feishu: 'ready',
          wechat: 'disabled',
        },
      }),
    });

    try {
      const client = createControlClient(layout.controlSocketPath);
      await expect(client.status()).resolves.toMatchObject({
        ok: true,
        pid: 42,
        channels: {
          feishu: 'ready',
          wechat: 'disabled',
        },
      });
    } finally {
      await server.close();
    }
  });

  it('reports service and daemon commands from the CLI', () => {
    const help = runCli(['help']);
    const dryRun = runCli(['service', 'install', '--dry-run', '--json']);
    const devDryRun = runCli(['service', 'install-dev', '--dry-run', '--json']);
    const status = runCli(['daemon', 'status', '--json']);

    expect(help.stdout).toContain('english-pilot run [--dry-run] [--json]');
    expect(help.stdout).toContain('english-pilot service install [--dry-run] [--json]');
    expect(help.stdout).toContain('english-pilot service install-dev [--dry-run] [--json]');
    expect(JSON.parse(dryRun.stdout)).toMatchObject({
      operation: 'service-install',
      dryRun: true,
      devMode: false,
    });
    expect(JSON.parse(devDryRun.stdout)).toMatchObject({
      operation: 'service-install-dev',
      dryRun: true,
      devMode: true,
      launchdWrapper: 'scripts/dev-launchd-wrapper.sh',
    });
    expect(JSON.parse(status.stdout)).toMatchObject({
      running: false,
    });
  });

  it('includes daemon runtime paths in doctor output', () => {
    const layout = ensureRuntimeLayout();
    writeFileSync(
      layout.runningMarkerPath,
      JSON.stringify({
        pid: 999,
        startedAt: '2026-07-09T00:00:00.000Z',
      }),
      'utf8',
    );

    const result = runCli(['doctor', '--json']);
    const report = JSON.parse(result.stdout);

    expect(report.daemon).toMatchObject({
      running: false,
      socketReachable: false,
      uncleanRestart: true,
      controlSocketPath: layout.controlSocketPath,
      instanceLockPath: layout.instanceLockPath,
    });
    expect(readFileSync(layout.runningMarkerPath, 'utf8')).toContain('2026-07-09T00:00:00.000Z');
  });
});
