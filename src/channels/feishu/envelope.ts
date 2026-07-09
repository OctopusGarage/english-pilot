import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Client,
  Domain,
  type LarkChannel,
  type NormalizedMessage,
  type ResourceDescriptor,
} from '@larksuiteoapi/node-sdk';
import { findVoiceProvider } from '../../core/voice-providers.js';
import { transcribeVoiceAudio } from '../../core/voice-stt-gateway.js';
import type { ExternalChannelConversationEnvelope } from '../conversation-runtime.js';
import { isFeishuSenderAllowed } from './auth.js';
import { loadFeishuChannelConfig, type FeishuChannelConfig } from './config.js';
import { monitorFeishuTextMessage } from './monitor.js';
import { sendFeishuText } from './replies.js';

export type FeishuTranscribeVoice = (message: NormalizedMessage, resource: ResourceDescriptor) => Promise<string>;

export type FeishuEnvelopeResult =
  { ok: true; envelope: ExternalChannelConversationEnvelope } | { ok: false; reason: string };

export async function buildFeishuConversationEnvelope(input: {
  channel: Pick<LarkChannel, 'send'>;
  config: FeishuChannelConfig;
  message: NormalizedMessage;
  transcribeVoice?: FeishuTranscribeVoice;
}): Promise<FeishuEnvelopeResult> {
  const { channel, config, message } = input;
  if (!isFeishuSenderAllowed(message.senderId, config.allowedOpenIds)) {
    return { ok: false, reason: 'sender-not-allowed' };
  }
  const audio = findAudioResource(message);
  if (message.rawContentType !== 'text' && message.rawContentType !== 'post' && !audio) {
    return { ok: false, reason: 'unsupported-content-type' };
  }
  const inputKind = audio ? 'voice' : 'text';
  const text = audio
    ? (await (input.transcribeVoice ?? defaultTranscribeFeishuVoice)(message, audio)).trim()
    : message.content.trim();
  if (!text) return { ok: false, reason: 'empty-message' };

  return {
    ok: true,
    envelope: {
      channel: 'feishu',
      scope: feishuAgentScope(message),
      text,
      inputKind,
      metadata: {
        messageId: message.messageId,
        senderId: message.senderId,
        chatId: message.chatId,
        chatType: message.chatType,
      },
      monitorText: () =>
        monitorFeishuTextMessage(
          {
            text,
            messageId: message.messageId,
            senderId: message.senderId,
            chatId: message.chatId,
            chatType: message.chatType,
          },
          config,
        ),
      sendText: (replyText) => sendFeishuText(channel, message.chatId, replyText),
      messageLabel: message.messageId,
    },
  };
}

function feishuAgentScope(message: NormalizedMessage): string {
  return ['feishu', message.chatId, message.threadId ?? message.rootId ?? message.senderId].join(':');
}

function findAudioResource(message: NormalizedMessage): ResourceDescriptor | undefined {
  return message.resources.find((resource) => resource.type === 'audio');
}

async function defaultTranscribeFeishuVoice(message: NormalizedMessage, resource: ResourceDescriptor): Promise<string> {
  const config = loadFeishuChannelConfig();
  if (!config.config) throw new Error('Feishu channel config is required to download voice messages.');
  const provider = findVoiceProvider('local-whisper');
  if (!provider) throw new Error('Local Whisper provider is not available.');
  const audioPath = join(tmpdir(), `english-pilot-feishu-voice-${randomUUID()}.opus`);
  try {
    await downloadFeishuMessageResource(config.config, message.messageId, resource.fileKey, audioPath);
    return (await transcribeVoiceAudio({ provider, audioPath })).transcript;
  } finally {
    rmSync(audioPath, { force: true });
  }
}

async function downloadFeishuMessageResource(
  config: FeishuChannelConfig,
  messageId: string,
  fileKey: string,
  destPath: string,
): Promise<void> {
  const client = new Client({
    appId: config.appId,
    appSecret: config.appSecret,
    domain: config.domain === 'lark' ? Domain.Lark : Domain.Feishu,
  });
  const response = (await client.im.v1.messageResource.get({
    path: { message_id: messageId, file_key: fileKey },
    params: { type: 'file' },
  })) as { writeFile: (path: string) => Promise<unknown> };
  await response.writeFile(destPath);
}
