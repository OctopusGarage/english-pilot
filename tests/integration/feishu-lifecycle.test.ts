import { afterEach, describe, expect, it, vi } from 'vitest';
import { startFeishuChannel } from '../../src/channels/feishu/start.js';
import type { FeishuChannelConfig } from '../../src/channels/feishu/config.js';

const disconnects: string[] = [];

vi.mock('@larksuiteoapi/node-sdk', () => ({
  Domain: {
    Feishu: 'feishu',
    Lark: 'lark',
  },
  LoggerLevel: {
    info: 'info',
  },
  createLarkChannel: () => ({
    on: () => () => undefined,
    connect: async () => undefined,
    disconnect: async () => {
      disconnects.push('disconnect');
    },
  }),
}));

describe('Feishu channel lifecycle', () => {
  afterEach(() => {
    disconnects.length = 0;
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

function configFixture(): FeishuChannelConfig {
  return {
    appId: 'cli_xxx',
    appSecret: 'secret',
    allowedOpenIds: new Set(['ou_allowed']),
    domain: 'feishu',
    replyMode: 'violation',
  };
}
