import { describe, expect, it, vi } from 'vitest';
import { sendWeChatText } from '../../src/channels/wechat/replies.js';
import { sendWeChatMessage } from '../../src/channels/wechat/api.js';

vi.mock('../../src/channels/wechat/api.js', () => ({
  sendWeChatMessage: vi.fn(),
}));

describe('WeChat outbound replies', () => {
  it('passes account, recipient, context, and agent metadata to the API', async () => {
    vi.mocked(sendWeChatMessage).mockResolvedValueOnce(undefined);

    await expect(
      sendWeChatText({
        account: { accountId: 'bot-1', token: 'token', baseUrl: 'https://wechat.test', savedAt: '2026-01-01' },
        to: 'user-1',
        text: 'Working on it.',
        contextToken: 'context-1',
        botAgent: 'agent-1',
      }),
    ).resolves.toEqual({ sent: true });
    expect(sendWeChatMessage).toHaveBeenCalledWith({
      baseUrl: 'https://wechat.test',
      token: 'token',
      to: 'user-1',
      text: 'Working on it.',
      contextToken: 'context-1',
      botAgent: 'agent-1',
    });
  });

  it('surfaces a non-retryable WeChat API failure', async () => {
    vi.mocked(sendWeChatMessage).mockClear();
    vi.mocked(sendWeChatMessage).mockRejectedValueOnce(new Error('invalid recipient'));

    await expect(
      sendWeChatText({
        account: { accountId: 'bot-1', token: 'token', baseUrl: 'https://wechat.test', savedAt: '2026-01-01' },
        to: 'user-1',
        text: 'Reply',
      }),
    ).resolves.toEqual({ sent: false, error: 'invalid recipient' });
    expect(sendWeChatMessage).toHaveBeenCalledTimes(1);
  });
});
