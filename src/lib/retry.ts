/**
 * Retry a promise-returning function on transient errors (5xx, 429, network).
 * Same semantics: throws after retries exhausted; no change to success path.
 */
const MAX_RETRIES = 2; // 2 retries = 3 attempts total
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 10000;

function isTransientError(e: unknown): boolean {
  if (e && typeof e === "object") {
    // Google APIs expose HTTP status on response; Node network failures expose code.
    const status = (e as { response?: { status?: number } }).response?.status;
    const code = (e as { code?: string }).code;
    if (status !== undefined && status >= 500 && status < 600) return true;
    if (status === 429) return true;
    if (typeof code === "string" && /^ECONN|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ENETUNREACH$/i.test(code))
      return true;
  }
  return false;
}

function delay(attempt: number): Promise<void> {
  // Exponential backoff is capped so transient failures do not stall a run indefinitely.
  const ms = Math.min(
    INITIAL_DELAY_MS * Math.pow(2, attempt),
    MAX_DELAY_MS
  );
  return new Promise((r) => setTimeout(r, ms));
}

export async function withTransientRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES && isTransientError(e)) {
        await delay(attempt);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}
