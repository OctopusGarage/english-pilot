import { describe, expect, it } from 'vitest';
import { sendWithRetry } from '../../src/channels/send-retry.js';

describe('sendWithRetry', () => {
  it('retries a retryable send failure and returns the successful result', async () => {
    let attempts = 0;
    const delays: number[] = [];

    const result = await sendWithRetry({
      attempts: 3,
      delayMs: (attempt) => 100 + attempt,
      send: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary disconnect');
        return 'sent';
      },
      isRetryable: (error) => error instanceof Error && error.message === 'temporary disconnect',
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    expect(result).toEqual({ sent: true, result: 'sent' });
    expect(attempts).toBe(2);
    expect(delays).toEqual([100]);
  });

  it('returns a non-retryable failure without attempting the send again', async () => {
    let attempts = 0;
    const delays: number[] = [];

    const result = await sendWithRetry({
      send: async () => {
        attempts += 1;
        throw new Error('permission denied');
      },
      isRetryable: () => false,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    expect(result).toEqual({ sent: false, error: 'permission denied' });
    expect(attempts).toBe(1);
    expect(delays).toEqual([]);
  });

  it('returns the final error after exhausting retry attempts', async () => {
    let attempts = 0;
    const delays: number[] = [];

    const result = await sendWithRetry({
      attempts: 2,
      delayMs: (attempt) => attempt + 1,
      send: async () => {
        attempts += 1;
        throw 'gateway unavailable';
      },
      isRetryable: () => true,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    expect(result).toEqual({ sent: false, error: 'gateway unavailable' });
    expect(attempts).toBe(2);
    expect(delays).toEqual([1, 2]);
  });
});
