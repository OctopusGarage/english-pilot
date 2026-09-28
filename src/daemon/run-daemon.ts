import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { startControlServer, type ControlServer } from '../adapters/control/server.js';
import type { ChannelRuntimeState, DaemonStatus } from '../adapters/control/protocol.js';
import { loadFeishuChannelConfig } from '../channels/feishu/config.js';
import { loadWeChatChannelConfig } from '../channels/wechat/config.js';
import { createInstanceLock, InstanceLockHeldError, type InstanceLock } from '../core/infra/instance-lock.js';
import { createRuntimeLogger, type RuntimeLogger } from '../core/infra/logger.js';
import { detectUncleanRestart, markCleanShutdown, markRunning } from '../core/infra/lifecycle.js';
import { ensureRuntimeLayout, type RuntimeLayout } from '../core/infra/state-dir.js';
import { defaultDaemonChannelRuntimes, startConfiguredChannelRuntimes } from './channel-lifecycle.js';
import { createWeChatDailyReviewDeliveryHandler } from './wechat-daily-review-delivery.js';

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
    startConfiguredChannelRuntimes({
      channels: result.channels,
      runtimes: defaultDaemonChannelRuntimes({
        feishuReady: feishu.ok,
        wechatReady: wechat.ok,
      }),
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
  } catch (error) {
    try {
      await runtime.close();
    } catch {
      // Preserve the runtime error after attempting every cleanup step.
    }
    throw error;
  }
  await runtime.close();
  return result;
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
  const abortController = new AbortController();
  let controlServer: ControlServer | undefined;
  const markerBefore = readMarkerContents(input.layout.runningMarkerPath);
  let ownsMarker = false;
  const signalHandler = (): void => abortController.abort();
  const close = async (): Promise<void> => {
    process.off('SIGINT', signalHandler);
    process.off('SIGTERM', signalHandler);
    abortController.abort();
    await closeRuntime({ controlServer, ownsMarker, lock, layout: input.layout, logger: input.logger });
  };
  // Lock ownership is established before touching the lifecycle marker/socket.
  // Keep rollback active from the marker write through all startup callbacks.
  try {
    const marker = markRunning(input.layout.runningMarkerPath);
    ownsMarker = true;
    controlServer = await startControlServer({
      socketPath: input.layout.controlSocketPath,
      getStatus: () => ({
        ok: true,
        pid: process.pid,
        startedAt: marker.startedAt,
        channels: input.initialChannels,
      }),
      deliverWeChatDailyReview: createWeChatDailyReviewDeliveryHandler({
        channels: input.initialChannels,
      }),
    });
    process.once('SIGINT', signalHandler);
    process.once('SIGTERM', signalHandler);
    input.logger.info(`EnglishPilot daemon started with pid ${process.pid}.`);
    input.log?.(`EnglishPilot daemon control socket: ${input.layout.controlSocketPath}`);
    return {
      abortController,
      close,
    };
  } catch (error) {
    // A failed write can still have created or truncated this attempt's marker.
    // Preserve an unchanged marker that predates the attempt.
    ownsMarker ||= readMarkerContents(input.layout.runningMarkerPath) !== markerBefore;
    try {
      await close();
    } catch {
      // Cleanup must attempt every owned resource and keep startup's error primary.
    }
    throw error;
  }
}

async function closeRuntime(input: {
  controlServer?: ControlServer;
  ownsMarker: boolean;
  lock: InstanceLock;
  layout: RuntimeLayout;
  logger: RuntimeLogger;
}): Promise<void> {
  const errors: unknown[] = [];
  for (const cleanup of [
    () => input.controlServer?.close(),
    () => {
      if (input.ownsMarker) markCleanShutdown(input.layout.runningMarkerPath);
    },
    () => input.lock.release(),
  ]) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw errors[0];
  input.logger.info('EnglishPilot daemon stopped cleanly.');
}

function readMarkerContents(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}
