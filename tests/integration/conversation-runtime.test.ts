import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/adapters/cli.js';
import { runExternalChannelConversation } from '../../src/channels/conversation-runtime.js';

describe('external channel conversation runtime', () => {
  let previousHome: string | undefined;
  let home: string;

  beforeEach(() => {
    previousHome = process.env.ENGLISH_PILOT_HOME;
    home = mkdtempSync(join(tmpdir(), 'english-pilot-conversation-'));
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

  it('sends processing ack before the external agent reply for allowed messages', async () => {
    runCli(['config', 'set', 'externalAgentBackend', 'codex']);
    const sent: string[] = [];

    const result = await runExternalChannelConversation({
      channel: 'wechat',
      scope: 'wechat:account:user:dm',
      text: 'Please summarize this update.',
      inputKind: 'text',
      metadata: { messageId: 'msg-1' },
      messageLabel: 'msg-1',
      processingAckText: 'Received. Working on it...',
      monitorText: () => ({
        decision: 'ALLOW_SILENT',
        shouldReply: false,
        recorded: false,
      }),
      runAgent: async (options) => ({
        operation: 'external-agent-run',
        backend: 'codex',
        command: 'codex',
        args: ['exec'],
        cwd: '/tmp/project',
        promptStdin: options.prompt,
        dryRun: false,
        exitCode: 0,
        stdout: 'Agent reply',
        stderr: '',
        threadId: 'thread-1',
      }),
      sendText: async (text) => {
        sent.push(text);
        return { sent: true };
      },
    });

    expect(result).toEqual({ handled: true, replied: true });
    expect(sent).toEqual(['Received. Working on it...', 'Agent reply']);
  });

  it('sends only the coaching reply for blocked messages', async () => {
    runCli(['config', 'set', 'externalAgentBackend', 'codex']);
    const sent: string[] = [];

    const result = await runExternalChannelConversation({
      channel: 'feishu',
      scope: 'feishu:chat:user',
      text: '你好',
      inputKind: 'text',
      metadata: { messageId: 'msg-2' },
      messageLabel: 'msg-2',
      processingAckText: 'Received. Working on it...',
      monitorText: () => ({
        decision: 'BLOCK',
        shouldReply: true,
        replyText: 'Try this in English.',
        recorded: true,
      }),
      runAgent: async () => {
        throw new Error('blocked messages must not call the agent');
      },
      sendText: async (text) => {
        sent.push(text);
        return { sent: true };
      },
    });

    expect(result).toEqual({ handled: true, replied: true });
    expect(sent).toEqual(['Try this in English.']);
  });
});
