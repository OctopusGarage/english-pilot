import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/adapters/cli.js';
import { createControlClient } from '../../src/adapters/control/client.js';
import { startControlServer } from '../../src/adapters/control/server.js';
import { createInstanceLock, InstanceLockHeldError } from '../../src/core/infra/instance-lock.js';
import { createRuntimeLogger } from '../../src/core/infra/logger.js';
import { detectUncleanRestart, markCleanShutdown, markRunning } from '../../src/core/infra/lifecycle.js';
import { ensureRuntimeLayout } from '../../src/core/infra/state-dir.js';
import { startConfiguredChannelRuntimes } from '../../src/daemon/channel-lifecycle.js';

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

  it('writes structured JSONL runtime logs with contextual fields', () => {
    const layout = ensureRuntimeLayout();
    const logger = createRuntimeLogger(layout.daemonLogPath).child({
      component: 'wechat',
      accountId: 'bot-im-bot',
    });

    logger.warn('wechat.getupdates.retry', 'WeChat getupdates failed; retrying.', {
      failures: 2,
      delayMs: 6000,
      error: 'fetch failed',
    });

    const [line] = readFileSync(layout.daemonLogPath, 'utf8').trim().split('\n');
    const event = JSON.parse(line);
    expect(event).toMatchObject({
      level: 'warn',
      event: 'wechat.getupdates.retry',
      message: 'WeChat getupdates failed; retrying.',
      component: 'wechat',
      accountId: 'bot-im-bot',
      failures: 2,
      delayMs: 6000,
      error: 'fetch failed',
    });
    expect(event.time).toEqual(expect.any(String));
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

  it('supervises configured channel lifecycle state transitions', async () => {
    const layout = ensureRuntimeLayout();
    const logger = createRuntimeLogger(layout.daemonLogPath);
    const channels = {
      feishu: 'ready' as const,
      wechat: 'ready' as const,
    };
    const logs: string[] = [];
    const abortController = new AbortController();

    startConfiguredChannelRuntimes({
      channels,
      abortSignal: abortController.signal,
      logger,
      log: (line) => logs.push(line),
      runtimes: [
        {
          name: 'feishu',
          ready: true,
          start: async () => undefined,
        },
        {
          name: 'wechat',
          ready: true,
          start: async () => {
            throw new Error('network unavailable');
          },
        },
      ],
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(channels).toEqual({
      feishu: 'running',
      wechat: 'failed',
    });
    expect(logs).toContain('WeChat channel failed: network unavailable');
    expect(readFileSync(layout.daemonLogPath, 'utf8')).toContain('wechat.channel.failed');
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
      daemonLogPath: join(home, 'logs', 'daemon.log'),
    });
  });

  it('terminates an existing daemon lock holder before kickstarting launchd restart', async () => {
    const fakeBin = join(home, 'fake-bin');
    const calls = join(home, 'calls.log');
    const layout = ensureRuntimeLayout();
    const daemon = spawn(process.execPath, ['-e', 'setInterval(() => undefined, 1000)'], {
      stdio: 'ignore',
    });
    mkdirSync(fakeBin, { recursive: true });
    writeFileSync(layout.instanceLockPath, JSON.stringify({ pid: daemon.pid, acquiredAt: '2026-07-10T00:00:00.000Z' }));

    writeExecutable(join(fakeBin, 'uname'), ['#!/bin/sh', 'echo Darwin', ''].join('\n'));
    writeExecutable(
      join(fakeBin, 'id'),
      ['#!/bin/sh', 'if [ "$1" = "-u" ]; then echo 501; else /usr/bin/id "$@"; fi', ''].join('\n'),
    );
    writeExecutable(
      join(fakeBin, 'ps'),
      [
        '#!/bin/sh',
        'echo "node /tmp/node_modules/@octopusgarage/english-pilot/dist/src/bin/english-pilot.js run"',
        '',
      ].join('\n'),
    );
    writeExecutable(join(fakeBin, 'sleep'), ['#!/bin/sh', 'exit 0', ''].join('\n'));
    writeExecutable(
      join(fakeBin, 'launchctl'),
      ['#!/bin/sh', 'echo "launchctl $*" >> "$CALLS"', 'exit 0', ''].join('\n'),
    );

    try {
      const result = spawnSync('sh', ['scripts/service.sh', 'restart'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          ENGLISH_PILOT_HOME: home,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
          CALLS: calls,
        },
      });

      expect(result).toMatchObject({ status: 0 });
      expect(result.stdout).toContain(`Stopping existing EnglishPilot daemon pid ${daemon.pid}.`);
      await expectProcessToExit(daemon.pid);
      expect(readFileSync(calls, 'utf8').trim().split('\n')).toEqual([
        'launchctl kickstart -k gui/501/com.octopusgarage.english-pilot',
      ]);
    } finally {
      if (daemon.pid !== undefined && isProcessAliveForTest(daemon.pid)) daemon.kill('SIGKILL');
    }
  });

  it('includes the active Node bin directory in generated launchd service PATH', () => {
    const fakeBin = join(home, 'fake-node-bin');
    const calls = join(home, 'launchctl-calls.log');
    mkdirSync(fakeBin, { recursive: true });
    writeExecutable(join(fakeBin, 'node'), ['#!/bin/sh', 'echo fake-node "$@"', ''].join('\n'));
    writeExecutable(join(fakeBin, 'npm'), ['#!/bin/sh', 'echo fake-npm "$@"', ''].join('\n'));
    writeExecutable(join(fakeBin, 'launchctl'), ['#!/bin/sh', 'echo "$*" >> "$CALLS"', 'exit 0', ''].join('\n'));
    writeExecutable(
      join(fakeBin, 'id'),
      ['#!/bin/sh', 'if [ "$1" = "-u" ]; then echo 501; else /usr/bin/id "$@"; fi', ''].join('\n'),
    );

    const result = spawnSync('sh', ['scripts/install-launchd.sh'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        CALLS: calls,
      },
    });

    expect(result).toMatchObject({ status: 0 });
    const plist = readFileSync(join(home, 'Library', 'LaunchAgents', 'com.octopusgarage.english-pilot.plist'), 'utf8');
    expect(plist).toContain(
      `<string>${fakeBin}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>`,
    );
    expect(readFileSync(calls, 'utf8')).toContain('bootstrap gui/501');
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
      daemonLogPath: layout.daemonLogPath,
    });
    expect(readFileSync(layout.runningMarkerPath, 'utf8')).toContain('2026-07-09T00:00:00.000Z');
  });
});

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content, 'utf8');
  chmodSync(path, 0o755);
}

async function expectProcessToExit(pid: number | undefined): Promise<void> {
  expect(pid).toEqual(expect.any(Number));
  for (let index = 0; index < 20; index += 1) {
    if (!isProcessAliveForTest(pid!)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Process ${pid} is still alive.`);
}

function isProcessAliveForTest(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
