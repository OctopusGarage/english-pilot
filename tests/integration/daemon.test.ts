import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli, runCliAsync } from '../../src/adapters/cli.js';
import { createControlClient } from '../../src/adapters/control/client.js';
import { startControlServer } from '../../src/adapters/control/server.js';
import { createInstanceLock, InstanceLockHeldError } from '../../src/core/infra/instance-lock.js';
import { createRuntimeLogger } from '../../src/core/infra/logger.js';
import { detectUncleanRestart, markCleanShutdown, markRunning } from '../../src/core/infra/lifecycle.js';
import { ensureRuntimeLayout } from '../../src/core/infra/state-dir.js';
import { startConfiguredChannelRuntimes } from '../../src/daemon/channel-lifecycle.js';
import { getDaemonStatusSnapshot, runDaemon } from '../../src/daemon/run-daemon.js';
import { createWeChatDailyReviewDeliveryHandler } from '../../src/daemon/wechat-daily-review-delivery.js';
import { buildDailyReviewDeliveryPayload } from '../../src/integrations/daily-review-delivery.js';
import { findIntegrationTarget } from '../../src/integrations/targets.js';

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
    expect(statSync(layout.home).mode & 0o077).toBe(0);
    expect(statSync(layout.logsDir).mode & 0o077).toBe(0);
    expect(statSync(layout.runDir).mode & 0o077).toBe(0);
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

  it('recovers an abandoned daemon lock whose process is no longer alive', () => {
    const layout = ensureRuntimeLayout();
    writeFileSync(layout.instanceLockPath, JSON.stringify({ pid: -1, acquiredAt: '2026-07-09T00:00:00.000Z' }));

    const lock = createInstanceLock(layout.instanceLockPath, 789);
    expect(() => lock.acquire()).not.toThrow();
    expect(JSON.parse(readFileSync(layout.instanceLockPath, 'utf8'))).toMatchObject({ pid: 789 });
    lock.release();
  });

  it('recovers an abandoned malformed daemon lock left by an interrupted acquire', () => {
    const layout = ensureRuntimeLayout();
    writeFileSync(layout.instanceLockPath, '', 'utf8');

    const lock = createInstanceLock(layout.instanceLockPath, 789);
    expect(() => lock.acquire()).not.toThrow();
    expect(JSON.parse(readFileSync(layout.instanceLockPath, 'utf8'))).toMatchObject({ pid: 789 });
    lock.release();
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

  it('normalizes field-only runtime messages and omits undefined fields', () => {
    const layout = ensureRuntimeLayout();
    createRuntimeLogger(layout.daemonLogPath).debug('daemon.debug', 'diagnostic');
    createRuntimeLogger(layout.daemonLogPath).info('Daemon restarted', { pid: 42, omitted: undefined });
    createRuntimeLogger(layout.daemonLogPath).error('daemon.failure', { error: new Error('boom') });

    const lines = readFileSync(layout.daemonLogPath, 'utf8').trim().split('\n');
    expect(JSON.parse(lines[1])).toMatchObject({
      event: 'runtime.message',
      message: 'Daemon restarted',
      pid: 42,
    });
    expect(readFileSync(layout.daemonLogPath, 'utf8')).not.toContain('omitted');
    expect(JSON.parse(lines[2])).toMatchObject({
      error: { name: 'Error', message: 'boom' },
    });
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
      expect(statSync(layout.controlSocketPath).mode & 0o077).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('reports an actionable blocker when WeChat daily review delivery has no daemon socket', async () => {
    const result = await runCliAsync([
      'integrations',
      'deliver',
      '--target',
      'wechat',
      '--date',
      '2026-08-14',
      '--json',
    ]);

    expect(result).toMatchObject({
      exitCode: 1,
      stderr: '',
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      operation: 'wechat-daily-review-daemon-delivery',
      delivered: false,
      network: false,
      blocker: expect.stringContaining('EnglishPilot daemon is not reachable'),
    });
  });

  it('blocks WeChat daily review control delivery when the WeChat daemon channel is not running', async () => {
    const layout = ensureRuntimeLayout();
    const target = findIntegrationTarget('wechat');
    if (!target) throw new Error('missing wechat target');
    const server = await startControlServer({
      socketPath: layout.controlSocketPath,
      getStatus: () => ({
        ok: true,
        pid: 42,
        startedAt: '2026-08-14T00:00:00.000Z',
        channels: {
          feishu: 'disabled',
          wechat: 'ready',
        },
      }),
      deliverWeChatDailyReview: createWeChatDailyReviewDeliveryHandler({
        channels: {
          feishu: 'disabled',
          wechat: 'ready',
        },
        loadConfig: () => ({
          ok: false,
          missing: ['WECHAT_ACCOUNT', 'WECHAT_ALLOWED_USERS'],
          config: {
            accounts: [],
            allowedUsers: new Set(),
            replyMode: 'violation',
            botAgent: 'EnglishPilot/0.1.0',
          },
        }),
        sendText: async () => ({ sent: true }),
      }),
    });

    try {
      const result = await createControlClient(layout.controlSocketPath).deliverWeChatDailyReview(
        buildDailyReviewDeliveryPayload({ target, date: '2026-08-14', items: [] }),
      );

      expect(result).toMatchObject({
        operation: 'wechat-daily-review-daemon-delivery',
        delivered: false,
        network: false,
        blocker: expect.stringContaining('WeChat daemon channel is not running'),
      });
    } finally {
      await server.close();
    }
  });

  it('blocks WeChat daily review control delivery when no allowed account or recipient is ready', async () => {
    const layout = ensureRuntimeLayout();
    const target = findIntegrationTarget('wechat');
    if (!target) throw new Error('missing wechat target');
    const server = await startControlServer({
      socketPath: layout.controlSocketPath,
      getStatus: () => ({
        ok: true,
        pid: 42,
        startedAt: '2026-08-14T00:00:00.000Z',
        channels: {
          feishu: 'disabled',
          wechat: 'running',
        },
      }),
      deliverWeChatDailyReview: createWeChatDailyReviewDeliveryHandler({
        channels: {
          feishu: 'disabled',
          wechat: 'running',
        },
        loadConfig: () => ({
          ok: false,
          missing: ['WECHAT_ACCOUNT', 'WECHAT_ALLOWED_USERS'],
          config: {
            accounts: [],
            allowedUsers: new Set(),
            replyMode: 'violation',
            botAgent: 'EnglishPilot/0.1.0',
          },
        }),
        sendText: async () => {
          throw new Error('blocked delivery must not send');
        },
      }),
    });

    try {
      const result = await createControlClient(layout.controlSocketPath).deliverWeChatDailyReview(
        buildDailyReviewDeliveryPayload({ target, date: '2026-08-14', items: [] }),
      );

      expect(result).toMatchObject({
        operation: 'wechat-daily-review-daemon-delivery',
        delivered: false,
        network: false,
        accountCount: 0,
        recipientCount: 0,
        blocker: expect.stringContaining('WeChat long-connection account/channel is not ready'),
      });
    } finally {
      await server.close();
    }
  });

  it('delivers a prepared daily review payload through a fake WeChat long connection without leaking secrets', async () => {
    const layout = ensureRuntimeLayout();
    const target = findIntegrationTarget('wechat');
    if (!target) throw new Error('missing wechat target');
    const sent: Array<{ to: string; text: string; token?: string; baseUrl?: string }> = [];
    const account = {
      accountId: 'bot-im-bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      userId: 'wxid_owner@im.wechat',
      savedAt: '2026-08-14T00:00:00.000Z',
    };
    const server = await startControlServer({
      socketPath: layout.controlSocketPath,
      getStatus: () => ({
        ok: true,
        pid: 42,
        startedAt: '2026-08-14T00:00:00.000Z',
        channels: {
          feishu: 'disabled',
          wechat: 'running',
        },
      }),
      deliverWeChatDailyReview: createWeChatDailyReviewDeliveryHandler({
        channels: {
          feishu: 'disabled',
          wechat: 'running',
        },
        loadConfig: () => ({
          ok: true,
          missing: [],
          config: {
            accounts: [account],
            allowedUsers: new Set(['wxid_owner@im.wechat']),
            replyMode: 'violation',
            botAgent: 'EnglishPilot/0.1.0',
          },
        }),
        sendText: async (input) => {
          sent.push({
            to: input.to,
            text: input.text,
            token: input.account.token,
            baseUrl: input.account.baseUrl,
          });
          return { sent: true };
        },
      }),
    });

    try {
      const result = await createControlClient(layout.controlSocketPath).deliverWeChatDailyReview(
        buildDailyReviewDeliveryPayload({ target, date: '2026-08-14', items: [] }),
      );

      expect(sent).toEqual([
        expect.objectContaining({
          to: 'wxid_owner@im.wechat',
          text: expect.stringContaining('EnglishPilot Daily Review - 2026-08-14'),
        }),
      ]);
      expect(result).toMatchObject({
        operation: 'wechat-daily-review-daemon-delivery',
        delivered: true,
        network: true,
        accountCount: 1,
        recipientCount: 1,
        messagePreview: expect.stringContaining('EnglishPilot Daily Review - 2026-08-14'),
      });
      expect(JSON.stringify(result)).not.toContain('secret-token');
      expect(JSON.stringify(result)).not.toContain('ilinkai.weixin.qq.com');
    } finally {
      await server.close();
    }
  });

  it('times out when the daemon control socket accepts but never replies', async () => {
    const layout = ensureRuntimeLayout();
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(layout.controlSocketPath, () => {
        server.off('error', reject);
        resolve();
      });
    });

    try {
      const status = createControlClient(layout.controlSocketPath, { timeoutMs: 20 }).status();
      const bounded = Promise.race([
        status,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('client hung waiting for daemon control response')), 200);
        }),
      ]);

      await expect(bounded).rejects.toThrow('Timed out waiting for daemon control response after 20ms.');
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
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

  it('returns actionable usage for invalid service and daemon subcommands', () => {
    const service = runCli(['service', 'rotate']);
    const daemon = runCli(['daemon', 'restart']);

    expect(service).toMatchObject({
      exitCode: 1,
      stdout: '',
    });
    expect(service.stderr).toContain('english-pilot service install [--dry-run] [--json]');
    expect(service.stderr).toContain('english-pilot service pause');
    expect(service.stderr).toContain('english-pilot service resume');

    expect(daemon).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: 'Usage: english-pilot daemon status [--json]\n',
    });
  });

  it('prints daemon dry-run readiness from the async CLI without leaving runtime markers', async () => {
    const layout = ensureRuntimeLayout();

    const result = await runCliAsync(['run', '--dry-run']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('EnglishPilot daemon');
    expect(result.stdout).toContain('Ready: no');
    expect(result.stdout).toContain(`Control socket: ${layout.controlSocketPath}`);
    expect(result.stdout).toContain('Feishu: disabled (FEISHU_APP_ID');
    expect(result.stdout).toContain('WeChat: disabled (WECHAT_ACCOUNT, WECHAT_ALLOWED_USERS)');
    expect(existsSync(layout.instanceLockPath)).toBe(false);
    expect(existsSync(layout.runningMarkerPath)).toBe(false);
  });

  it('reports disabled channel readiness during a daemon dry run without acquiring the runtime lock', async () => {
    const result = await runDaemon({ dryRun: true });

    expect(result).toMatchObject({
      operation: 'daemon-run',
      dryRun: true,
      ready: false,
      channels: {
        feishu: 'disabled',
        wechat: 'disabled',
      },
      missing: {
        feishu: expect.arrayContaining(['FEISHU_APP_ID']),
        wechat: expect.arrayContaining(['WECHAT_ALLOWED_USERS']),
      },
    });
    expect(existsSync(ensureRuntimeLayout().instanceLockPath)).toBe(false);
  });

  it('cleans daemon runtime markers and lock when a non-persistent run exits', async () => {
    const layout = ensureRuntimeLayout();
    const logs: string[] = [];

    const result = await runDaemon({ waitForever: false, log: (line) => logs.push(line) });

    expect(result).toMatchObject({
      operation: 'daemon-run',
      dryRun: false,
      ready: false,
      socketPath: layout.controlSocketPath,
      channels: {
        feishu: 'disabled',
        wechat: 'disabled',
      },
    });
    expect(logs).toEqual([`EnglishPilot daemon control socket: ${layout.controlSocketPath}`]);
    expect(existsSync(layout.instanceLockPath)).toBe(false);
    expect(existsSync(layout.runningMarkerPath)).toBe(false);
    expect(readFileSync(layout.daemonLogPath, 'utf8')).toContain('EnglishPilot daemon stopped cleanly.');
  });

  it('fails fast without writing a running marker when another daemon owns the lock', async () => {
    const layout = ensureRuntimeLayout();
    const lock = createInstanceLock(layout.instanceLockPath);
    lock.acquire();

    try {
      await expect(runDaemon({ waitForever: false })).rejects.toBeInstanceOf(InstanceLockHeldError);
      expect(existsSync(layout.runningMarkerPath)).toBe(false);
    } finally {
      lock.release();
    }
  });

  it('exposes an unclean restart when the daemon socket is unavailable', async () => {
    const layout = ensureRuntimeLayout();
    markRunning(layout.runningMarkerPath, { pid: 456, startedAt: '2026-07-10T00:00:00.000Z' });

    await expect(getDaemonStatusSnapshot()).resolves.toMatchObject({
      running: false,
      socketReachable: false,
      uncleanRestart: true,
      pid: 456,
      startedAt: '2026-07-10T00:00:00.000Z',
      error: expect.any(String),
    });
  });

  it('runs dev services through the source watcher supervisor', () => {
    const wrapper = readFileSync('scripts/dev-launchd-wrapper.sh', 'utf8');

    expect(wrapper).toContain('dev-supervisor.mjs');
    expect(wrapper).not.toContain('npm run build');
    expect(wrapper).not.toContain('exec "$NODE_BIN" "$CLI_JS" run');
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

  it('tails launchd logs from ENGLISH_PILOT_HOME when service logs runs on macOS', () => {
    const fakeBin = join(home, 'fake-bin');
    const customHome = join(home, 'custom-runtime-home');
    const tailArgs = join(home, 'tail-args.log');
    mkdirSync(fakeBin, { recursive: true });
    mkdirSync(join(customHome, 'logs'), { recursive: true });
    writeExecutable(join(fakeBin, 'uname'), ['#!/bin/sh', 'echo Darwin', ''].join('\n'));
    writeExecutable(
      join(fakeBin, 'tail'),
      ['#!/bin/sh', 'printf "%s\\n" "$@" > "$TAIL_ARGS"', 'exit 0', ''].join('\n'),
    );

    const result = spawnSync('sh', ['scripts/service.sh', 'logs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: join(home, 'login-home'),
        ENGLISH_PILOT_HOME: customHome,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        TAIL_ARGS: tailArgs,
      },
    });

    expect(result).toMatchObject({ status: 0 });
    expect(readFileSync(tailArgs, 'utf8').trim().split('\n')).toEqual([
      '-n',
      '200',
      '-f',
      join(customHome, 'logs', 'launchd.out.log'),
      join(customHome, 'logs', 'launchd.err.log'),
    ]);
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

  it('reports a reachable daemon socket in doctor output', async () => {
    const layout = ensureRuntimeLayout();
    const server = await startControlServer({
      socketPath: layout.controlSocketPath,
      getStatus: () => ({
        ok: true,
        pid: 84,
        startedAt: '2026-07-10T12:00:00.000Z',
        channels: {
          feishu: 'running',
          wechat: 'disabled',
        },
      }),
    });

    try {
      const result = await runCliAsync(['doctor', '--json']);
      const report = JSON.parse(result.stdout);

      expect(report.daemon).toMatchObject({
        running: true,
        socketReachable: true,
        pid: 84,
        startedAt: '2026-07-10T12:00:00.000Z',
        controlSocketPath: layout.controlSocketPath,
      });
    } finally {
      await server.close();
    }
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
