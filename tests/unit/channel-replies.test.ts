import { describe, expect, it } from 'vitest';
import { sendFeishuText } from '../../src/channels/feishu/replies.js';

describe('Feishu outbound replies', () => {
  it('retries a transient channel disconnect and preserves the message payload', async () => {
    let attempts = 0;
    const channel = {
      send: async (chatId: string, payload: { markdown: string }) => {
        attempts += 1;
        expect(chatId).toBe('chat-1');
        expect(payload).toEqual({ markdown: 'Working on it.' });
        if (attempts === 1) throw new Error('not_connected');
        return { message_id: 'message-1' } as never;
      },
    };

    await expect(sendFeishuText(channel, 'chat-1', 'Working on it.')).resolves.toMatchObject({
      sent: true,
      result: { message_id: 'message-1' },
    });
    expect(attempts).toBe(2);
  });

  it('surfaces a non-retryable channel failure without retrying', async () => {
    let attempts = 0;

    const result = await sendFeishuText(
      {
        send: async () => {
          attempts += 1;
          throw new Error('invalid chat id');
        },
      },
      'missing-chat',
      'Reply',
    );

    expect(result).toEqual({ sent: false, error: 'invalid chat id' });
    expect(attempts).toBe(1);
  });
});
