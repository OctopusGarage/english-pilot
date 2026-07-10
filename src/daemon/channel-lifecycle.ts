import type { ChannelRuntimeState } from '../adapters/control/protocol.js';
import { startFeishuChannel } from '../channels/feishu/start.js';
import { startWeChatChannel } from '../channels/wechat/start.js';
import type { RuntimeLogger } from '../core/infra/logger.js';

export type DaemonChannelName = 'feishu' | 'wechat';

export type DaemonChannelStates = Record<DaemonChannelName, ChannelRuntimeState>;

export interface DaemonChannelRuntime {
  name: DaemonChannelName;
  ready: boolean;
  start: (input: { log: (line: string) => void; logger: RuntimeLogger; abortSignal: AbortSignal }) => Promise<unknown>;
}

export interface ChannelLifecycleSupervisorInput {
  channels: DaemonChannelStates;
  runtimes: readonly DaemonChannelRuntime[];
  abortSignal: AbortSignal;
  logger: RuntimeLogger;
  log: (line: string) => void;
}

export function defaultDaemonChannelRuntimes(input: {
  feishuReady: boolean;
  wechatReady: boolean;
}): DaemonChannelRuntime[] {
  return [
    {
      name: 'feishu',
      ready: input.feishuReady,
      start: ({ log, logger }) => startFeishuChannel({ log, logger }),
    },
    {
      name: 'wechat',
      ready: input.wechatReady,
      start: ({ log, logger, abortSignal }) => startWeChatChannel({ log, logger, abortSignal }),
    },
  ];
}

export function startConfiguredChannelRuntimes(input: ChannelLifecycleSupervisorInput): void {
  for (const runtime of input.runtimes) {
    if (!runtime.ready) continue;
    input.channels[runtime.name] = 'starting';
    input.logger.info(`${runtime.name}.channel.starting`, `${labelChannel(runtime.name)} channel is starting.`);
    void runtime
      .start({
        log: input.log,
        logger: input.logger,
        abortSignal: input.abortSignal,
      })
      .then(() => {
        input.channels[runtime.name] = 'running';
        input.logger.info(`${runtime.name}.channel.running`, `${labelChannel(runtime.name)} channel is running.`);
      })
      .catch((error) => {
        input.channels[runtime.name] = 'failed';
        const message = error instanceof Error ? error.message : String(error);
        input.logger.error(`${runtime.name}.channel.failed`, `${labelChannel(runtime.name)} channel failed.`, {
          error: message,
        });
        input.log(`${labelChannel(runtime.name)} channel failed: ${message}`);
      });
  }
}

function labelChannel(channel: DaemonChannelName): 'Feishu' | 'WeChat' {
  return channel === 'feishu' ? 'Feishu' : 'WeChat';
}
