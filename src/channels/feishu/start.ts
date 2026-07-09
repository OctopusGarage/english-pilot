import {
  createLarkChannel,
  Domain,
  LoggerLevel,
  type LarkChannel,
  type NormalizedMessage,
  type ResourceDescriptor,
} from '@larksuiteoapi/node-sdk';
import { loadFeishuChannelConfig, type FeishuChannelConfig } from './config.js';
import { buildFeishuConversationEnvelope } from './envelope.js';
import { loadConfig } from '../../core/config.js';
import { runExternalAgent } from '../../agent/runner.js';
import { runExternalChannelConversation } from '../conversation-runtime.js';

export interface FeishuStartPreview {
  operation: 'feishu-long-connection-start';
  ready: boolean;
  wouldConnect: boolean;
  domain?: 'feishu' | 'lark';
  allowedUsers?: number;
  agentBackend?: 'off' | 'claude' | 'codex';
  missing: string[];
}

export async function startFeishuChannel(
  input: {
    config?: FeishuChannelConfig;
    dryRun?: boolean;
    log?: (line: string) => void;
  } = {},
): Promise<FeishuStartPreview> {
  const report = input.config
    ? {
        ok: true,
        missing: [],
        path: '',
        config: input.config,
      }
    : loadFeishuChannelConfig();
  if (!report.ok || !report.config) {
    return {
      operation: 'feishu-long-connection-start',
      ready: false,
      wouldConnect: false,
      missing: report.missing,
    };
  }
  const preview = {
    operation: 'feishu-long-connection-start' as const,
    ready: true,
    wouldConnect: !input.dryRun,
    domain: report.config.domain,
    allowedUsers: report.config.allowedOpenIds.size,
    agentBackend: loadConfig().externalAgentBackend,
    missing: [],
  };
  if (input.dryRun) return preview;

  const channel = createChannel(report.config);
  channel.on('message', (message) => {
    void handleFeishuMessage({ channel, config: report.config as FeishuChannelConfig, message, log: input.log });
  });
  await channel.connect();
  input.log?.(`EnglishPilot Feishu channel is listening on ${report.config.domain}.`);
  return preview;
}

export async function handleFeishuMessage(input: {
  channel: Pick<LarkChannel, 'send'>;
  config: FeishuChannelConfig;
  message: NormalizedMessage;
  log?: (line: string) => void;
  runAgent?: typeof runExternalAgent;
  transcribeVoice?: (message: NormalizedMessage, resource: ResourceDescriptor) => Promise<string>;
}): Promise<{ handled: boolean; replied: boolean; reason?: string }> {
  const { channel, config, message } = input;
  try {
    const envelope = await buildFeishuConversationEnvelope({
      channel,
      config,
      message,
      transcribeVoice: input.transcribeVoice,
    });
    if (!envelope.ok) return { handled: false, replied: false, reason: envelope.reason };
    return runExternalChannelConversation({
      ...envelope.envelope,
      runAgent: input.runAgent ?? runExternalAgent,
      log: input.log,
    });
  } catch (error) {
    input.log?.(
      `Failed to handle Feishu message ${message.messageId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { handled: false, replied: false, reason: 'handler-error' };
  }
}

function createChannel(config: FeishuChannelConfig): LarkChannel {
  return createLarkChannel({
    appId: config.appId,
    appSecret: config.appSecret,
    domain: config.domain === 'lark' ? Domain.Lark : Domain.Feishu,
    loggerLevel: LoggerLevel.info,
    policy: {
      requireMention: false,
    },
    safety: {
      dedup: {
        ttl: 30 * 60 * 1000,
      },
    },
  });
}
