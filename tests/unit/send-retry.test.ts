import { describe, expect, it } from 'vitest';
import { sendWithRetry } from '../../src/channels/send-retry.js';

describe('sendWithRetry', () => {
  it('does not wait after the final retryable failure', async () => {
    const delays: number[] = [];

    const result = await sendWithRetry({
      attempts: 3,
      send: async () => {
        throw new Error('ETIMEDOUT');
      },
      isRetryable: () => true,
      delayMs: (attempt) => attempt + 1,
      sleep: async (delay) => {
        delays.push(delay);
      },
    });

    expect(result).toEqual({ sent: false, error: 'ETIMEDOUT' });
    expect(delays).toEqual([1, 2]);
  });
});
