interface RetryOpts {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, maxAttempts: number, message: string) => void;
}

function getErrMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRetryableError(err: unknown): boolean {
  const msg = getErrMessage(err).toLowerCase();
  return (
    msg.includes('404') ||
    msg.includes('timeout') ||
    msg.includes('network') ||
    msg.includes('temporar') ||
    msg.includes('fetch')
  );
}

export async function withDecryptRetry<T>(run: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 10;
  const baseDelayMs = opts.baseDelayMs ?? 1200;
  const maxDelayMs = opts.maxDelayMs ?? 6000;

  let attempt = 0;
  while (true) {
    try {
      return await run();
    } catch (err: unknown) {
      attempt++;
      if (!isRetryableError(err) || attempt >= maxAttempts) {
        throw err;
      }

      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      opts.onRetry?.(attempt, maxAttempts, getErrMessage(err));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
