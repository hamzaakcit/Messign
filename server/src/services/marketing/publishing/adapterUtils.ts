/**
 * Transient retry for adapters — 429 / 503 / 502 with exponential backoff.
 * 401 / 400 / other 4xx (non-429) fail fast (no retry).
 */
import { AdapterHttpError } from './types.js';

/**
 * Single send gate for legacy marketing adapters (ADR-004). `SEND_MODE` defaults to
 * `off` — any value other than exactly `live` (including unset, `sandbox`, or a typo)
 * keeps every adapter in mock mode regardless of configured credentials.
 */
export function isSendModeLive(): boolean {
  return process.env.SEND_MODE === 'live';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

export async function withTransientRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const base = options?.baseDelayMs ?? 400;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const retry =
        e instanceof AdapterHttpError &&
        e.isTransient &&
        attempt < maxAttempts - 1;
      if (!retry) throw e;
      const delay = Math.min(8000, base * 2 ** attempt);
      console.warn(`[adapterRetry] attempt ${attempt + 1}/${maxAttempts} transient error, wait ${delay}ms`, {
        message: e instanceof Error ? e.message : String(e),
      });
      await sleep(delay);
    }
  }
  throw lastErr;
}

/** Classify fetch Response for AdapterHttpError */
export function errorFromResponse(res: Response, bodyText: string): AdapterHttpError {
  return new AdapterHttpError(
    `HTTP ${res.status}: ${bodyText.slice(0, 500)}`,
    res.status,
    bodyText.slice(0, 200),
  );
}
