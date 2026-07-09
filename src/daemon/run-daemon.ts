import { once } from 'node:events';
import { startControlServer, type ControlServer } from '../adapters/control/server.js';
import type { ChannelRuntimeState, DaemonStatus } from '../adapters/control/protocol.js';
import { loadFeishuChannelConfig } from '../channels/feishu/config.js';
import { startFeishuChannel } from '../channels/feishu/start.js';
import { loadWeChatChannelConfig } from '../channels/wechat/config.js';
import { startWeChatChannel } from '../channels/wechat/start.js';
import { createInstanceLock, InstanceLockHeldError, type InstanceLock } from '../core/infra/instance-lock.js';
import { createRuntimeLogger, type RuntimeLogger } from '../core/infra/logger.js';
import { detectUncleanRestart, markCleanShutdown, markRunning } from '../core/infra/lifecycle.js';
import { ensureRuntimeLayout, type RuntimeLayout } from '../core/infra/state-dir.js';

export interface DaemonRunResult {
  operation: 'daemon-run';
  dryRun: boolean;
  ready: boolean;
  socketPath: string;
  pid: number;
  channels: {
    feishu: ChannelRuntimeState;
    wechat: ChannelRuntimeState;
  };
  missing: {
    feishu: string[];
    wechat: string[];
  };
}

export interface DaemonStatusSnapshot {
  running: boolean;
  socketReachable: boolean;
  controlSocketPath: string;
  instanceLockPath: string;
  runningMarkerPath: string;
  daemonLogPath: string;
  uncleanRestart: boolean;
  pid?: number;
  startedAt?: string;
  channels?: DaemonStatus['channels'];
  error?: string;
}

export async function runDaemon(
  input: {
    dryRun?: boolean;
    json?: boolean;
    log?: (line: string) => void;
    waitForever?: boolean;
  } = {},
): Promise<DaemonRunResult> {
  const layout = ensureRuntimeLayout();
  const logger = createRuntimeLogger(layout.daemonLogPath);
  const feishu = loadFeishuChannelConfig();
  const wechat = loadWeChatChannelConfig();
  const result: DaemonRunResult = {
    operation: 'daemon-run',
    dryRun: input.dryRun === true,
    ready: feishu.ok || wechat.ok,
    socketPath: layout.controlSocketPath,
    pid: process.pid,
    channels: {
      feishu: feishu.ok ? 'ready' : 'disabled',
      wechat: wechat.ok ? 'ready' : 'disabled',
    },
    missing: {
      feishu: feishu.missing,
      wechat: wechat.missing,
    },
  };
  if (input.dryRun) return result;

  const runtime = await startDaemonRuntime({
    layout,
    logger,
    log: input.log,
    initialChannels: result.channels,
  });
  try {
    startConfiguredChannels({
      feishuReady: feishu.ok,
      wechatReady: wechat.ok,
      channels: result.channels,
      abortSignal: runtime.abortController.signal,
      logger,
      log: (line) => {
        logger.info(line);
        input.log?.(line);
      },
    });
    if (input.waitForever !== false) {
      await once(runtime.abortController.signal, 'abort');
    }
    return result;
  } finally {
    await runtime.close();
  }
}

export async function getDaemonStatusSnapshot(): Promise<DaemonStatusSnapshot> {
  const layout = ensureRuntimeLayout();
  const restart = detectUncleanRestart(layout.runningMarkerPath);
  try {
    const { createControlClient } = await import('../adapters/control/client.js');
    const status = await createControlClient(layout.controlSocketPath).status();
    return {
      running: true,
      socketReachable: true,
      controlSocketPath: layout.controlSocketPath,
      instanceLockPath: layout.instanceLockPath,
      runningMarkerPath: layout.runningMarkerPath,
      daemonLogPath: layout.daemonLogPath,
      uncleanRestart: false,
      pid: status.pid,
      startedAt: status.startedAt,
      channels: status.channels,
    };
  } catch (error) {
    return {
      running: false,
      socketReachable: false,
      controlSocketPath: layout.controlSocketPath,
      instanceLockPath: layout.instanceLockPath,
      runningMarkerPath: layout.runningMarkerPath,
      daemonLogPath: layout.daemonLogPath,
      uncleanRestart: restart.unclean,
      ...(restart.unclean && restart.pid !== undefined ? { pid: restart.pid } : {}),
      ...(restart.unclean && restart.startedAt !== undefined ? { startedAt: restart.startedAt } : {}),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function startDaemonRuntime(input: {
  layout: RuntimeLayout;
  logger: RuntimeLogger;
  log?: (line: string) => void;
  initialChannels: DaemonStatus['channels'];
}): Promise<{
  abortController: AbortController;
  close: () => Promise<void>;
}> {
  const lock = createInstanceLock(input.layout.instanceLockPath);
  try {
    lock.acquire();
  } catch (error) {
    if (error instanceof InstanceLockHeldError) throw error;
    throw new Error(`Unable to acquire daemon lock: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
  const marker = markRunning(input.layout.runningMarkerPath);
  const abortController = new AbortController();
  const controlServer = await startControlServer({
    socketPath: input.layout.controlSocketPath,
    getStatus: () => ({
      ok: true,
      pid: process.pid,
      startedAt: marker.startedAt,
      channels: input.initialChannels,
    }),
  });
  const signalHandler = (): void => abortController.abort();
  process.once('SIGINT', signalHandler);
  process.once('SIGTERM', signalHandler);
  input.logger.info(`EnglishPilot daemon started with pid ${process.pid}.`);
  input.log?.(`EnglishPilot daemon control socket: ${input.layout.controlSocketPath}`);
  return {
    abortController,
    close: async () => {
      process.off('SIGINT', signalHandler);
      process.off('SIGTERM', signalHandler);
      await closeRuntime({ controlServer, lock, layout: input.layout, logger: input.logger });
    },
  };
}

async function closeRuntime(input: {
  controlServer: ControlServer;
  lock: InstanceLock;
  layout: RuntimeLayout;
  logger: RuntimeLogger;
}): Promise<void> {
  await input.controlServer.close();
  markCleanShutdown(input.layout.runningMarkerPath);
  input.lock.release();
  input.logger.info('EnglishPilot daemon stopped cleanly.');
}

function startConfiguredChannels(input: {
  feishuReady: boolean;
  wechatReady: boolean;
  channels: DaemonRunResult['channels'];
  abortSignal: AbortSignal;
  logger: RuntimeLogger;
  log: (line: string) => void;
}): void {
  if (input.feishuReady) {
    input.channels.feishu = 'starting';
    input.logger.info('feishu.channel.starting', 'Feishu channel is starting.');
    void startFeishuChannel({ log: input.log, logger: input.logger })
      .then(() => {
        input.channels.feishu = 'running';
        input.logger.info('feishu.channel.running', 'Feishu channel is running.');
      })
      .catch((error) => {
        input.channels.feishu = 'failed';
        input.logger.error('feishu.channel.failed', 'Feishu channel failed.', {
          error: error instanceof Error ? error.message : String(error),
        });
        input.log(`Feishu channel failed: ${error instanceof Error ? error.message : String(error)}`);
      });
  }
  if (input.wechatReady) {
    input.channels.wechat = 'starting';
    input.logger.info('wechat.channel.starting', 'WeChat channel is starting.');
    void startWeChatChannel({ log: input.log, logger: input.logger, abortSignal: input.abortSignal })
      .then(() => {
        input.channels.wechat = 'running';
        input.logger.info('wechat.channel.running', 'WeChat channel is running.');
      })
      .catch((error) => {
        input.channels.wechat = 'failed';
        input.logger.error('wechat.channel.failed', 'WeChat channel failed.', {
          error: error instanceof Error ? error.message : String(error),
        });
        input.log(`WeChat channel failed: ${error instanceof Error ? error.message : String(error)}`);
      });
  }
}
