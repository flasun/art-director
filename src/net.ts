export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Exponential backoff capped at 8s, with jitter to avoid thundering herds. */
export function defaultBackoff(attempt: number): number {
  return Math.min(8000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

export interface RetryOptions {
  /** Additional attempts after the first (default 3). */
  retries?: number;
  /** Per-attempt wall-clock timeout (default 120s). */
  timeoutMs?: number;
  backoff?: (attempt: number) => number;
}

/**
 * fetch with per-attempt timeouts and retry on transient failures
 * (network errors, timeouts, 408/429/5xx). Non-retryable statuses are
 * returned as-is — callers keep their own !ok error reporting. A render
 * costs real money, so one flaky 502 should never sink a round.
 */
export async function fetchWithRetry(url: string, init?: RequestInit, opts?: RetryOptions): Promise<Response> {
  const retries = opts?.retries ?? 3;
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const backoff = opts?.backoff ?? defaultBackoff;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, backoff(attempt - 1)));
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      lastError = error as Error;
      continue;
    }
    if (!isRetryableStatus(res.status) || attempt === retries) return res;
    await res.body?.cancel().catch(() => {});
  }
  throw new Error(`${url} failed after ${retries + 1} attempts: ${lastError?.message ?? "retryable status"}`);
}
