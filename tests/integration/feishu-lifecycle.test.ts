import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NormalizedMessage, SendInput, SendResult } from '@larksuiteoapi/node-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startFeishuChannel } from '../../src/channels/feishu/start.js';
import type { FeishuChannelConfig } from '../../src/channels/feishu/config.js';
import { createRuntimeLogger } from '../../src/core/infra/logger.js';
import { listPromptEvents } from '../../src/storage/repository.js';

const disconnects: string[] = [];
const sent: string[] = [];
let onMessage: ((message: NormalizedMessage) => void) | undefined;

vi.mock('@larksuiteoapi/node-sdk', () => ({
  Domain: {
    Feishu: 'feishu',
    Lark: 'lark',
  },
  LoggerLevel: {
    info: 'info',
  },
  createLarkChannel: () => ({
    on: (event: string, handler: (message: NormalizedMessage) => void) => {
      if (event === 'message') onMessage = handler;
      return () => undefined;
    },
    connect: async () => undefined,
    send: async (_chatId: string, input: SendInput): Promise<SendResult> => {
      sent.push('markdown' in input ? input.markdown : '');
      return { messageId: 'reply-message' };
    },
    disconnect: async () => {
      disconnects.push('disconnect');
    },
  }),
}));

describe('Feishu channel lifecycle', () => {
  let home: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-feishu-lifecycle-'));
    process.env.ENGLISH_PILOT_HOME = home;
    writeFileSync(join(home, 'config.json'), JSON.stringify({ externalAgentBackend: 'off', rewriteBackend: 'off' }));
  });

  afterEach(() => {
    disconnects.length = 0;
    sent.length = 0;
    onMessage = undefined;
    if (previousHome === undefined) delete process.env.ENGLISH_PILOT_HOME;
    else process.env.ENGLISH_PILOT_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  });

  it('contains a rejected message assessment and processes the next SDK message', async () => {
    const lines: string[] = [];
    const logPath = join(home, 'event.log');
    await startFeishuChannel({
      config: configFixture(),
      log: (line) => lines.push(line),
      logger: createRuntimeLogger(logPath),
    });
    expect(onMessage).toBeTypeOf('function');

    // The daemon started with valid config; a later assessment sees a malformed file.
    writeFileSync(join(home, 'config.json'), '{invalid');
    onMessage!(messageFixture('bad-config-message', 'Please check the build.'));
    await vi.waitFor(() => {
      expect(lines).toContainEqual(expect.stringContaining('Failed to handle Feishu message bad-config-message:'));
    });
    const warnings = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((entry) => entry.event === 'feishu.message.handler_failed');
    expect(warnings).toEqual([
      expect.objectContaining({ level: 'warn', messageId: 'bad-config-message', error: expect.stringMatching(/JSON/) }),
    ]);
    expect(sent).toEqual([]);

    writeFileSync(join(home, 'config.json'), JSON.stringify({ externalAgentBackend: 'off', rewriteBackend: 'off' }));
    expect(listPromptEvents()).toEqual([]);
    onMessage!(messageFixture('next-message', '我想创建一个 new project，用来辅助英语学习。'));
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
      expect(sent[0]).toContain('Try this in English:');
    });
    expect(listPromptEvents()).toHaveLength(1);
    expect(lines.filter((line) => line.startsWith('Failed to handle Feishu message'))).toHaveLength(1);
  });

  it('disconnects the Feishu websocket when the daemon abort signal fires', async () => {
    const abortController = new AbortController();

    await startFeishuChannel({
      config: configFixture(),
      abortSignal: abortController.signal,
    });
    abortController.abort();
    await Promise.resolve();

    expect(disconnects).toEqual(['disconnect']);
  });
});

function messageFixture(messageId: string, content: string): NormalizedMessage {
  return {
    messageId,
    chatId: 'chat-id',
    chatType: 'p2p',
    senderId: 'ou_allowed',
    content,
    rawContentType: 'text',
    resources: [],
    mentions: [],
    mentionAll: false,
    mentionedBot: false,
    createTime: Date.now(),
  };
}

function configFixture(): FeishuChannelConfig {
  return {
    appId: 'cli_xxx',
    appSecret: 'secret',
    allowedOpenIds: new Set(['ou_allowed']),
    domain: 'feishu',
    replyMode: 'violation',
  };
}
