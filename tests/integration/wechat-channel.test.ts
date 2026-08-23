import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/adapters/cli.js';
import { getWeChatUpdates, sendWeChatMessage } from '../../src/channels/wechat/api.js';
import { loadWeChatChannelConfig } from '../../src/channels/wechat/config.js';
import { monitorWeChatTextMessage } from '../../src/channels/wechat/monitor.js';
import { runWeChatOnboarding } from '../../src/channels/wechat/onboarding.js';
import { handleWeChatMessage, monitorWeChatAccount } from '../../src/channels/wechat/start.js';
import {
  getWeChatAccountsDir,
  listWeChatAccounts,
  loadWeChatSyncCursor,
  saveWeChatAccount,
} from '../../src/channels/wechat/state.js';
import { runWeChatUpdateStream } from '../../src/channels/wechat/update-stream.js';
import { listLearningItems, listPromptEvents } from '../../src/storage/repository.js';

describe('WeChat long-connection channel', () => {
  let previousHome: string | undefined;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-wechat-'));
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

  it('enforces the long-poll timeout when the daemon supplies an abort signal', async () => {
    const daemonAbort = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const pending = getWeChatUpdates({
      baseUrl: 'https://ilinkai.weixin.qq.com',
      syncCursor: 'cursor-1',
      timeoutMs: 1,
      abortSignal: daemonAbort.signal,
      fetch: async (_url, init) => {
        requestSignal = init?.signal ?? undefined;
        return await new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
            once: true,
          });
        });
      },
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(requestSignal?.aborted).toBe(true);
    } finally {
      daemonAbort.abort();
      await pending;
    }
  });

  it('treats non-zero WeChat send errcode responses as delivery failures', async () => {
    await expect(
      sendWeChatMessage({
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'secret-token',
        to: 'wxid_owner@im.wechat',
        text: 'Reply',
        fetch: async () => jsonResponse({ errcode: 40001, errmsg: 'invalid credential' }),
      }),
    ).rejects.toThrow('WeChat sendmessage failed: errcode=40001 invalid credential');
  });

  it('loads local QR-login accounts and supports dry-run doctor output', () => {
    saveWeChatAccount({
      accountId: 'bot-im-bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      userId: 'wxid_owner@im.wechat',
    });

    const report = loadWeChatChannelConfig({
      WECHAT_ALLOWED_USERS: 'wxid_owner@im.wechat',
    });
    const dryRun = runCli(['wechat', 'start', '--dry-run', '--json']);

    expect(report).toMatchObject({
      ok: true,
      missing: [],
    });
    expect(report.config?.accounts).toHaveLength(1);
    expect(report.config?.allowedUsers.has('wxid_owner@im.wechat')).toBe(true);
    expect(report.config?.processingAckText).toBe('Received. Working on it...');
    expect(JSON.parse(dryRun.stdout)).toMatchObject({
      operation: 'wechat-long-connection-start',
      ready: true,
      wouldConnect: false,
      accountCount: 1,
    });
  });

  it('stores QR-login accounts with private file permissions after redirect confirmation', async () => {
    const logs: string[] = [];
    const calls: string[] = [];
    const result = await runWeChatOnboarding({
      timeoutMs: 1000,
      pollIntervalMs: 0,
      log: (line) => logs.push(line),
      fetch: async (url) => {
        calls.push(String(url));
        if (String(url).includes('get_bot_qrcode')) {
          return jsonResponse({
            qrcode: 'qr-token',
            qrcode_img_content: 'https://wechat.example.test/qr',
          });
        }
        if (calls.length === 2) {
          return jsonResponse({ status: 'scaned_but_redirect', redirect_host: 'redirect.wechat.example.test' });
        }
        return jsonResponse({
          status: 'confirmed',
          ilink_bot_id: 'bot@im.wechat',
          bot_token: 'secret-token',
          ilink_user_id: 'wxid_owner@im.wechat',
        });
      },
    });

    expect(result).toMatchObject({
      connected: true,
      message: 'Connected WeChat account bot-im-wechat.',
      account: {
        accountId: 'bot-im-wechat',
        token: 'secret-token',
        baseUrl: 'https://redirect.wechat.example.test',
        userId: 'wxid_owner@im.wechat',
      },
    });
    expect(calls[1]).toContain('https://ilinkai.weixin.qq.com/ilink/bot/get_qrcode_status');
    expect(calls[2]).toContain('https://redirect.wechat.example.test/ilink/bot/get_qrcode_status');
    expect(logs).toContain('Scan this QR code with WeChat to connect EnglishPilot:');
    expect(listWeChatAccounts()).toHaveLength(1);
    expect(statSync(join(getWeChatAccountsDir(), 'bot-im-wechat.json')).mode & 0o077).toBe(0);
  });

  it('fails QR onboarding before polling when the QR API omits the QR code', async () => {
    const calls: string[] = [];

    const result = await runWeChatOnboarding({
      timeoutMs: 1,
      pollIntervalMs: 0,
      log: () => undefined,
      fetch: async (url) => {
        calls.push(String(url));
        return jsonResponse({});
      },
    });

    expect(result).toEqual({
      connected: false,
      message: 'WeChat QR login did not return a QR code.',
    });
    expect(calls).toHaveLength(1);
    expect(listWeChatAccounts()).toEqual([]);
  });

  it('records blocked WeChat direct messages and prepares a copyable reply', () => {
    const result = monitorWeChatTextMessage(
      {
        accountId: 'bot-im-bot',
        senderId: 'wxid_owner@im.wechat',
        chatId: 'wxid_owner@im.wechat',
        chatType: 'dm',
        messageId: 'msg-1',
        text: '我想创建一个 new project，用来辅助英语学习。',
      },
      {
        accounts: [],
        allowedUsers: new Set(['wxid_owner@im.wechat']),
        replyMode: 'violation',
        botAgent: 'EnglishPilot/0.1.0',
      },
    );

    expect(result).toMatchObject({
      decision: 'BLOCK',
      shouldReply: true,
      recorded: true,
    });
    expect(result.replyText).toContain('Try this in English:');
    expect(result.replyText).toContain('I want to create a new project');
    expect(listPromptEvents()).toHaveLength(1);
    expect(listLearningItems()[0]).toMatchObject({
      suggested: expect.stringContaining('I want to create a new project'),
      tags: expect.arrayContaining(['wechat', 'channel']),
    });
  });

  it('records over-threshold WeChat messages without blocking in coach mode', () => {
    runCli(['config', 'use', 'coach']);

    const result = monitorWeChatTextMessage(
      {
        accountId: 'bot-im-bot',
        senderId: 'wxid_owner@im.wechat',
        chatId: 'wxid_owner@im.wechat',
        chatType: 'dm',
        messageId: 'msg-1',
        text: '我想创建一个 new project，用来辅助英语学习。',
      },
      {
        accounts: [],
        allowedUsers: new Set(['wxid_owner@im.wechat']),
        replyMode: 'violation',
        botAgent: 'EnglishPilot/0.1.0',
      },
    );

    expect(result).toMatchObject({
      decision: 'ALLOW_WITH_COACHING',
      shouldReply: false,
      recorded: true,
    });
    expect(result.replyText).toBeUndefined();
    expect(listPromptEvents()).toHaveLength(1);
    expect(listLearningItems()[0]).toMatchObject({
      suggested: expect.stringContaining('I want to create a new project'),
      tags: expect.arrayContaining(['wechat', 'channel']),
    });
  });

  it('routes allowed WeChat messages to the configured external agent backend', async () => {
    runCli(['config', 'use', 'force']);
    runCli(['config', 'set', 'externalAgentBackend', 'codex']);
    const sent: string[] = [];
    const prompts: string[] = [];
    const account = {
      accountId: 'bot-im-bot',
      token: 'secret-token',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      userId: 'wxid_owner@im.wechat',
      savedAt: '2026-07-09T00:00:00.000Z',
    };

    const result = await handleWeChatMessage({
      account,
      config: {
        accounts: [account],
        allowedUsers: new Set(['wxid_owner@im.wechat']),
        replyMode: 'violation',
        botAgent: 'EnglishPilot/0.1.0',
        processingAckText: 'Received. Working on it...',
      },
      message: {
        message_id: 'msg-1',
        from_user_id: 'wxid_owner@im.wechat',
        context_token: 'ctx-1',
        item_list: [
          {
            type: 1,
            text_item: {
              text: 'what is the weather about 广州',
            },
          },
        ],
      },
      runAgent: async (options) => {
        prompts.push(options.prompt);
        return {
          operation: 'external-agent-run',
          backend: 'codex',
          command: 'codex',
          args: ['exec'],
          cwd: '/tmp/project',
          promptStdin: options.prompt,
          dryRun: false,
          exitCode: 0,
          stdout: 'Here is a concise reply.',
          stderr: '',
        };
      },
      sendText: async (input) => {
        sent.push(input.text);
        return { sent: true };
      },
    });

    expect(result).toMatchObject({ handled: true, replied: true });
    expect(prompts[0]).toContain('"channel":"wechat"');
    expect(prompts[0]).toContain('what is the weather about 广州');
    expect(prompts[0]).toContain('<english_pilot_coaching>');
    expect(prompts[0]).toContain('Required: after the main reply');
    expect(prompts[0]).toContain('English note:');
    expect(prompts[0]).toContain('Do not omit it.');
    expect(sent).toEqual(['Received. Working on it...', 'Here is a concise reply.']);
  });

  it('sends WeChat group replies back to the room instead of direct messaging the sender', async () => {
    runCli(['config', 'set', 'externalAgentBackend', 'codex']);
    const recipients: string[] = [];
    const account = accountFixture();

    const result = await handleWeChatMessage({
      account,
      config: {
        accounts: [account],
        allowedUsers: new Set(['wxid_owner@im.wechat']),
        replyMode: 'violation',
        botAgent: 'EnglishPilot/0.1.0',
      },
      message: {
        ...wechatTextMessage('Please summarize this group thread.'),
        room_id: 'room-alpha@chatroom',
      },
      runAgent: async (options) => agentResult('codex', options.prompt, { threadId: 'group-thread' }),
      sendText: async (input) => {
        recipients.push(input.to);
        return { sent: true };
      },
    });

    expect(result).toMatchObject({ handled: true, replied: true });
    expect(recipients).toEqual(['room-alpha@chatroom']);
  });

  it('records the final English note from a WeChat agent reply', async () => {
    runCli(['config', 'set', 'externalAgentBackend', 'codex']);
    const account = accountFixture();
    const finalText = [
      'Here is the answer.',
      '',
      'English note: "what is the weather about 广州" -> "What is the weather like in Guangzhou?"',
      'Why: Use "What is the weather like in + place?" when asking about local weather.',
      'IPA: weather /ˈweðər/',
    ].join('\n');

    await handleWeChatMessage({
      account,
      config: {
        accounts: [account],
        allowedUsers: new Set(['wxid_owner@im.wechat']),
        replyMode: 'violation',
        botAgent: 'EnglishPilot/0.1.0',
      },
      message: wechatTextMessage('what is the weather about 广州'),
      runAgent: async (options) =>
        agentResult('codex', options.prompt, { threadId: 'codex-thread-wechat', stdout: finalText }),
      sendText: async () => ({ sent: true }),
    });

    expect(listLearningItems()).toContainEqual(
      expect.objectContaining({
        original: 'what is the weather about 广州',
        suggested: 'What is the weather like in Guangzhou?',
        scene: 'WeChat assistant English note',
        tags: ['assistant-note', 'wechat'],
        ipa: [{ word: 'weather', ipa: '/ˈweðər/' }],
      }),
    );
  });

  it('resumes the previous Codex thread for the same WeChat conversation scope', async () => {
    runCli(['config', 'set', 'externalAgentBackend', 'codex']);
    const threadIds: Array<string | undefined> = [];
    const account = accountFixture();
    const config = {
      accounts: [account],
      allowedUsers: new Set(['wxid_owner@im.wechat']),
      replyMode: 'violation' as const,
      botAgent: 'EnglishPilot/0.1.0',
    };

    await handleWeChatMessage({
      account,
      config,
      message: wechatTextMessage('Please remember this WeChat context.'),
      runAgent: async (options) => {
        threadIds.push(options.threadId);
        return agentResult('codex', options.prompt, { threadId: 'codex-thread-wechat', cwd: options.cwd });
      },
      sendText: async () => ({ sent: true }),
    });
    await handleWeChatMessage({
      account,
      config,
      message: wechatTextMessage('Continue from the same WeChat context.'),
      runAgent: async (options) => {
        threadIds.push(options.threadId);
        return agentResult('codex', options.prompt, { threadId: 'codex-thread-wechat', cwd: options.cwd });
      },
      sendText: async () => ({ sent: true }),
    });

    expect(threadIds).toEqual([undefined, 'codex-thread-wechat']);
  });

  it('clears a failed resumed Codex thread so the next message can recover', async () => {
    runCli(['config', 'set', 'externalAgentBackend', 'codex']);
    const threadIds: Array<string | undefined> = [];
    const account = accountFixture();
    const config = {
      accounts: [account],
      allowedUsers: new Set(['wxid_owner@im.wechat']),
      replyMode: 'violation' as const,
      botAgent: 'EnglishPilot/0.1.0',
    };
    let attempt = 0;

    const run = (text: string) =>
      handleWeChatMessage({
        account,
        config,
        message: wechatTextMessage(text),
        runAgent: async (options) => {
          threadIds.push(options.threadId);
          attempt += 1;
          if (attempt === 2)
            return {
              ...agentResult('codex', options.prompt, { cwd: options.cwd }),
              exitCode: 1,
              stderr: 'thread expired',
            };
          return agentResult('codex', options.prompt, {
            cwd: options.cwd,
            threadId: 'codex-thread-wechat',
            stdout: 'Recovered reply',
          });
        },
        sendText: async () => ({ sent: true }),
      });

    await run('Start this WeChat context.');
    const failed = await run('Continue the expired WeChat context.');
    const recovered = await run('Try this WeChat message again.');

    expect(failed).toMatchObject({ handled: true, replied: false, reason: 'agent-failed' });
    expect(recovered).toMatchObject({ handled: true, replied: true });
    expect(threadIds).toEqual([undefined, 'codex-thread-wechat', undefined]);
  });

  it('clears the active WeChat agent thread with /new', async () => {
    runCli(['config', 'set', 'externalAgentBackend', 'codex']);
    const threadIds: Array<string | undefined> = [];
    const sent: string[] = [];
    const account = accountFixture();
    const config = {
      accounts: [account],
      allowedUsers: new Set(['wxid_owner@im.wechat']),
      replyMode: 'violation' as const,
      botAgent: 'EnglishPilot/0.1.0',
    };

    await handleWeChatMessage({
      account,
      config,
      message: wechatTextMessage('Please remember this WeChat context.'),
      runAgent: async (options) => {
        threadIds.push(options.threadId);
        return agentResult('codex', options.prompt, { threadId: 'codex-thread-before-new', cwd: options.cwd });
      },
      sendText: async () => ({ sent: true }),
    });
    const reset = await handleWeChatMessage({
      account,
      config,
      message: wechatTextMessage('/new'),
      runAgent: async () => {
        throw new Error('/new must not call the agent');
      },
      sendText: async (input) => {
        sent.push(input.text);
        return { sent: true };
      },
    });
    await handleWeChatMessage({
      account,
      config,
      message: wechatTextMessage('Start a fresh WeChat context.'),
      runAgent: async (options) => {
        threadIds.push(options.threadId);
        return agentResult('codex', options.prompt, { threadId: 'codex-thread-after-new', cwd: options.cwd });
      },
      sendText: async () => ({ sent: true }),
    });

    expect(reset).toMatchObject({ handled: true, replied: true, reason: 'new-session' });
    expect(sent.join('\n')).toContain('Started a new EnglishPilot agent session.');
    expect(threadIds).toEqual([undefined, undefined]);
  });

  it('sends WeChat voice transcripts through the normal agent flow', async () => {
    runCli(['config', 'set', 'externalAgentBackend', 'codex']);
    const prompts: string[] = [];
    const account = accountFixture();

    const result = await handleWeChatMessage({
      account,
      config: {
        accounts: [account],
        allowedUsers: new Set(['wxid_owner@im.wechat']),
        replyMode: 'violation',
        botAgent: 'EnglishPilot/0.1.0',
      },
      message: {
        message_id: 'voice-msg-1',
        from_user_id: 'wxid_owner@im.wechat',
        item_list: [
          {
            type: 3,
            voice_item: {
              text: 'Please summarize my spoken update.',
            },
          },
        ],
      },
      runAgent: async (options) => {
        prompts.push(options.prompt);
        return agentResult('codex', options.prompt, { threadId: 'voice-thread' });
      },
      sendText: async () => ({ sent: true }),
    });

    expect(result).toMatchObject({ handled: true, replied: true });
    expect(prompts[0]).toContain('Please summarize my spoken update.');
    expect(prompts[0]).toContain('"inputKind":"voice"');
  });

  it('continues polling after transient WeChat update failures', async () => {
    const account = accountFixture();
    let attempts = 0;
    const logs: string[] = [];
    const delays: number[] = [];

    await monitorWeChatAccount({
      account,
      config: {
        accounts: [account],
        allowedUsers: new Set(['wxid_owner@im.wechat']),
        replyMode: 'violation',
        botAgent: 'EnglishPilot/0.1.0',
      },
      maxIterations: 2,
      log: (line) => logs.push(line),
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
      getUpdates: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('network down');
        return {
          ret: 0,
          msgs: [],
          get_updates_buf: 'cursor-after-reconnect',
        };
      },
      notifyStop: async () => {},
    });

    expect(attempts).toBe(2);
    expect(logs.join('\n')).toContain('network down');
    expect(logs.join('\n')).toContain('recovered after 1 failed attempt');
    expect(delays).toEqual([3000]);
  });

  it('uses exponential capped backoff for repeated WeChat update failures', async () => {
    const account = accountFixture();
    const delays: number[] = [];

    await monitorWeChatAccount({
      account,
      config: {
        accounts: [account],
        allowedUsers: new Set(['wxid_owner@im.wechat']),
        replyMode: 'violation',
        botAgent: 'EnglishPilot/0.1.0',
      },
      maxIterations: 5,
      log: () => {},
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
      getUpdates: async () => {
        throw new Error('network down');
      },
      notifyStop: async () => {},
    });

    expect(delays).toEqual([3000, 6000, 12000, 24000, 48000]);
  });

  it('retries non-zero WeChat getupdates errcode responses without advancing the cursor', async () => {
    const account = accountFixture();
    const cursors: string[] = [];
    const delays: number[] = [];
    let attempts = 0;

    await monitorWeChatAccount({
      account,
      config: {
        accounts: [account],
        allowedUsers: new Set(['wxid_owner@im.wechat']),
        replyMode: 'violation',
        botAgent: 'EnglishPilot/0.1.0',
      },
      maxIterations: 2,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
      getUpdates: async ({ syncCursor }) => {
        attempts += 1;
        cursors.push(syncCursor);
        if (attempts === 1) {
          return {
            errcode: 40001,
            errmsg: 'invalid credential',
            msgs: [],
            get_updates_buf: 'cursor-from-error',
          };
        }
        return {
          ret: 0,
          msgs: [],
          get_updates_buf: 'cursor-after-retry',
        };
      },
      notifyStop: async () => {},
    });

    expect(cursors).toEqual(['', '']);
    expect(delays).toEqual([3000]);
    expect(loadWeChatSyncCursor(account.accountId)).toBe('cursor-after-retry');
  });

  it('advances the WeChat sync cursor only after async message handling completes', async () => {
    const account = accountFixture();
    const handled: string[] = [];

    await runWeChatUpdateStream({
      account,
      botAgent: 'EnglishPilot/0.1.0',
      maxIterations: 1,
      getUpdates: async () => ({
        ret: 0,
        msgs: [wechatTextMessage('Please handle this before moving the cursor.')],
        get_updates_buf: 'cursor-after-message',
      }),
      notifyStop: async () => {},
      onMessage: async (message) => {
        expect(loadWeChatSyncCursor(account.accountId)).toBe('');
        handled.push(String(message.message_id));
      },
    });

    expect(handled).toEqual(['msg-44']);
    expect(loadWeChatSyncCursor(account.accountId)).toBe('cursor-after-message');
  });
});

function accountFixture() {
  return {
    accountId: 'bot-im-bot',
    token: 'secret-token',
    baseUrl: 'https://ilinkai.weixin.qq.com',
    userId: 'wxid_owner@im.wechat',
    savedAt: '2026-07-09T00:00:00.000Z',
  };
}

function wechatTextMessage(text: string) {
  return {
    message_id: `msg-${text.length}`,
    from_user_id: 'wxid_owner@im.wechat',
    item_list: [
      {
        type: 1,
        text_item: { text },
      },
    ],
  };
}

function agentResult(
  backend: 'claude' | 'codex',
  prompt: string,
  ids: { sessionId?: string; threadId?: string; cwd?: string; stdout?: string } = {},
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
    stdout: ids.stdout ?? 'Agent reply',
    stderr: '',
    ...ids,
  };
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  } as Response;
}
