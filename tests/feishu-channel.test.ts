import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  NormalizedMessage,
  ResourceDescriptor,
  SendInput,
  SendOptions,
  SendResult,
} from '@larksuiteoapi/node-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/adapters/cli.js';
import { loadFeishuChannelConfig } from '../src/channels/feishu/config.js';
import { buildFeishuEnvValues } from '../src/channels/feishu/onboarding.js';
import { handleFeishuMessage } from '../src/channels/feishu/start.js';
import { listLearningItems, listPromptEvents } from '../src/storage/repository.js';

describe('Feishu long-connection channel', () => {
  let previousHome: string | undefined;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-feishu-'));
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

  it('maps QR onboarding credentials to the runtime env file shape', () => {
    expect(
      buildFeishuEnvValues({
        client_id: 'cli_xxx',
        client_secret: 'secret',
        user_info: {
          open_id: 'ou_user',
          tenant_brand: 'lark',
        },
      }),
    ).toEqual({
      FEISHU_APP_ID: 'cli_xxx',
      FEISHU_APP_SECRET: 'secret',
      FEISHU_ALLOWED_OPEN_IDS: 'ou_user',
      FEISHU_DOMAIN: 'lark',
      FEISHU_REPLY_MODE: 'violation',
    });
  });

  it('loads config from ~/.english-pilot/feishu.env and supports dry-run doctor output', () => {
    writeFileSync(
      join(home, 'feishu.env'),
      [
        'FEISHU_APP_ID="cli_xxx"',
        'FEISHU_APP_SECRET="secret"',
        'FEISHU_ALLOWED_OPEN_IDS="ou_user"',
        'FEISHU_DOMAIN="feishu"',
        '',
      ].join('\n'),
      'utf8',
    );

    const report = loadFeishuChannelConfig();
    const dryRun = runCli(['feishu', 'start', '--dry-run', '--json']);

    expect(report).toMatchObject({
      ok: true,
      missing: [],
    });
    expect(report.config?.allowedOpenIds.has('ou_user')).toBe(true);
    expect(JSON.parse(dryRun.stdout)).toMatchObject({
      operation: 'feishu-long-connection-start',
      ready: true,
      wouldConnect: false,
      allowedUsers: 1,
    });
  });

  it('records blocked Feishu messages and replies only for allowed users', async () => {
    const sent: Array<{ chatId: string; markdown: string }> = [];
    const config = {
      appId: 'cli_xxx',
      appSecret: 'secret',
      allowedOpenIds: new Set(['ou_allowed']),
      domain: 'feishu' as const,
      replyMode: 'violation' as const,
    };
    const channel = {
      send: async (chatId: string, input: SendInput, _options?: SendOptions): Promise<SendResult> => {
        sent.push({ chatId, markdown: 'markdown' in input ? input.markdown : '' });
        return { messageId: 'reply-message' };
      },
    };

    const blocked = await handleFeishuMessage({
      channel,
      config,
      message: messageFixture({ senderId: 'ou_allowed', content: '我想创建一个 new project，用来辅助英语学习。' }),
    });
    const ignored = await handleFeishuMessage({
      channel,
      config,
      message: messageFixture({ senderId: 'ou_other', content: '你好' }),
    });

    expect(blocked).toMatchObject({ handled: true, replied: true });
    expect(ignored).toMatchObject({ handled: false, replied: false, reason: 'sender-not-allowed' });
    expect(sent).toHaveLength(1);
    expect(sent[0].markdown).toContain('Try this in English:');
    expect(sent[0].markdown).toContain('I want to create a new project');
    expect(listPromptEvents()).toHaveLength(1);
    expect(listLearningItems()[0]).toMatchObject({
      suggested: expect.stringContaining('I want to create a new project'),
      tags: expect.arrayContaining(['feishu', 'channel']),
    });
  });

  it('routes allowed Feishu messages to the configured external agent backend', async () => {
    runCli(['config', 'set', 'externalAgentBackend', 'claude']);
    const sent: Array<{ chatId: string; markdown: string }> = [];
    const prompts: string[] = [];
    const config = {
      appId: 'cli_xxx',
      appSecret: 'secret',
      allowedOpenIds: new Set(['ou_allowed']),
      domain: 'feishu' as const,
      replyMode: 'violation' as const,
    };
    const channel = {
      send: async (chatId: string, input: SendInput, _options?: SendOptions): Promise<SendResult> => {
        sent.push({ chatId, markdown: 'markdown' in input ? input.markdown : '' });
        return { messageId: 'reply-message' };
      },
    };

    const result = await handleFeishuMessage({
      channel,
      config,
      message: messageFixture({
        senderId: 'ou_allowed',
        content: 'Please help me rewrite this project update.',
      }),
      runAgent: async (options) => {
        prompts.push(options.prompt);
        return {
          operation: 'external-agent-run',
          backend: 'claude',
          command: 'claude',
          args: ['-p'],
          cwd: '/tmp/project',
          promptStdin: options.prompt,
          dryRun: false,
          exitCode: 0,
          stdout: 'Here is a clearer version.',
          stderr: '',
        };
      },
    });

    expect(result).toMatchObject({ handled: true, replied: true });
    expect(prompts[0]).toContain('"channel":"feishu"');
    expect(prompts[0]).toContain('Please help me rewrite this project update.');
    expect(sent).toHaveLength(1);
    expect(sent[0].markdown).toContain('Here is a clearer version.');
  });

  it('resumes the previous Claude session for the same Feishu conversation scope', async () => {
    runCli(['config', 'set', 'externalAgentBackend', 'claude']);
    const sessionIds: Array<string | undefined> = [];
    const config = {
      appId: 'cli_xxx',
      appSecret: 'secret',
      allowedOpenIds: new Set(['ou_allowed']),
      domain: 'feishu' as const,
      replyMode: 'violation' as const,
    };
    const channel = fakeChannel();

    await handleFeishuMessage({
      channel,
      config,
      message: messageFixture({
        chatId: 'chat-1',
        senderId: 'ou_allowed',
        content: 'Please remember this context.',
      }),
      runAgent: async (options) => {
        sessionIds.push(options.sessionId);
        return agentResult('claude', options.prompt, { sessionId: 'claude-session-feishu', cwd: options.cwd });
      },
    });
    await handleFeishuMessage({
      channel,
      config,
      message: messageFixture({
        chatId: 'chat-1',
        senderId: 'ou_allowed',
        content: 'Continue from the same context.',
      }),
      runAgent: async (options) => {
        sessionIds.push(options.sessionId);
        return agentResult('claude', options.prompt, { sessionId: 'claude-session-feishu', cwd: options.cwd });
      },
    });

    expect(sessionIds).toEqual([undefined, 'claude-session-feishu']);
  });

  it('clears the active Feishu agent session with /new', async () => {
    runCli(['config', 'set', 'externalAgentBackend', 'claude']);
    const sessionIds: Array<string | undefined> = [];
    const sent: string[] = [];
    const config = {
      appId: 'cli_xxx',
      appSecret: 'secret',
      allowedOpenIds: new Set(['ou_allowed']),
      domain: 'feishu' as const,
      replyMode: 'violation' as const,
    };
    const channel = {
      send: async (_chatId: string, input: SendInput, _options?: SendOptions): Promise<SendResult> => {
        sent.push('markdown' in input ? input.markdown : '');
        return { messageId: 'reply-message' };
      },
    };

    await handleFeishuMessage({
      channel,
      config,
      message: messageFixture({ chatId: 'chat-1', senderId: 'ou_allowed', content: 'Please remember this context.' }),
      runAgent: async (options) => {
        sessionIds.push(options.sessionId);
        return agentResult('claude', options.prompt, { sessionId: 'claude-session-before-new', cwd: options.cwd });
      },
    });
    const reset = await handleFeishuMessage({
      channel,
      config,
      message: messageFixture({ chatId: 'chat-1', senderId: 'ou_allowed', content: '/new' }),
      runAgent: async () => {
        throw new Error('/new must not call the agent');
      },
    });
    await handleFeishuMessage({
      channel,
      config,
      message: messageFixture({ chatId: 'chat-1', senderId: 'ou_allowed', content: 'Start a fresh context.' }),
      runAgent: async (options) => {
        sessionIds.push(options.sessionId);
        return agentResult('claude', options.prompt, { sessionId: 'claude-session-after-new', cwd: options.cwd });
      },
    });

    expect(reset).toMatchObject({ handled: true, replied: true, reason: 'new-session' });
    expect(sent.join('\n')).toContain('Started a new EnglishPilot agent session.');
    expect(sessionIds).toEqual([undefined, undefined]);
  });

  it('transcribes Feishu audio messages before applying the normal agent flow', async () => {
    runCli(['config', 'set', 'externalAgentBackend', 'claude']);
    const prompts: string[] = [];
    const config = {
      appId: 'cli_xxx',
      appSecret: 'secret',
      allowedOpenIds: new Set(['ou_allowed']),
      domain: 'feishu' as const,
      replyMode: 'violation' as const,
    };
    const audio: ResourceDescriptor = { type: 'audio', fileKey: 'audio-key-1' };

    const result = await handleFeishuMessage({
      channel: fakeChannel(),
      config,
      message: messageFixture({
        rawContentType: 'audio',
        content: '',
        resources: [audio],
      }),
      transcribeVoice: async (message, resource) => {
        expect(message.messageId).toBe('message-id');
        expect(resource).toBe(audio);
        return 'Please summarize this voice message.';
      },
      runAgent: async (options) => {
        prompts.push(options.prompt);
        return agentResult('claude', options.prompt, { sessionId: 'voice-session' });
      },
    });

    expect(result).toMatchObject({ handled: true, replied: true });
    expect(prompts[0]).toContain('Please summarize this voice message.');
    expect(prompts[0]).toContain('"inputKind":"voice"');
  });
});

function messageFixture(overrides: Partial<NormalizedMessage>): NormalizedMessage {
  return {
    messageId: 'message-id',
    chatId: 'chat-id',
    chatType: 'p2p',
    senderId: 'ou_allowed',
    content: 'hello',
    rawContentType: 'text',
    resources: [],
    mentions: [],
    mentionAll: false,
    mentionedBot: false,
    createTime: Date.now(),
    ...overrides,
  };
}

function fakeChannel(): Pick<import('@larksuiteoapi/node-sdk').LarkChannel, 'send'> {
  return {
    send: async (): Promise<SendResult> => ({ messageId: 'reply-message' }),
  };
}

function agentResult(
  backend: 'claude' | 'codex',
  prompt: string,
  ids: { sessionId?: string; threadId?: string; cwd?: string } = {},
) {
  return {
    operation: 'external-agent-run' as const,
    backend,
    command: backend,
    args: backend === 'claude' ? ['-p'] : ['exec'],
    cwd: ids.cwd ?? '/tmp/project',
    promptStdin: prompt,
    dryRun: false,
    exitCode: 0,
    stdout: 'Agent reply',
    stderr: '',
    ...ids,
  };
}
