export interface SendWithRetryInput<T> {
  attempts?: number;
  delayMs?: (attempt: number) => number;
  send: () => Promise<T>;
  isRetryable: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

export interface SendWithRetryResult<T> {
  sent: boolean;
  result?: T;
  error?: string;
}

export async function sendWithRetry<T>(input: SendWithRetryInput<T>): Promise<SendWithRetryResult<T>> {
  const attempts = input.attempts ?? 3;
  const delayMs = input.delayMs ?? ((attempt) => 200 * (attempt + 1));
  const wait = input.sleep ?? sleep;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return { sent: true, result: await input.send() };
    } catch (error) {
      lastError = error;
      if (!input.isRetryable(error)) break;
      await wait(delayMs(attempt));
    }
  }
  return {
    sent: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
