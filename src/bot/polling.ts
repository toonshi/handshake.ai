/**
 * Helpers for Telegram long-polling — transient network errors are normal;
 * the library retries automatically. We avoid spamming the console.
 */

const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

const TRANSIENT_PATTERN =
  /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|ENOTFOUND|network|socket hang up/i;

export function isTransientPollingError(err: unknown): boolean {
  const nested = (err as { error?: { code?: string; message?: string } })?.error;
  const code =
    (err as { code?: string })?.code ??
    nested?.code ??
    (err as { cause?: { code?: string } })?.cause?.code;

  if (code && TRANSIENT_CODES.has(code)) return true;

  const message =
    err instanceof Error
      ? err.message
      : nested?.message ?? String(err);

  return TRANSIENT_PATTERN.test(message);
}

/** Throttled logger for repeated transient polling failures */
export function createPollingErrorLogger(prefix = '[Bot]') {
  let transientCount = 0;
  let lastLogAt = 0;
  const THROTTLE_MS = 30_000;

  return (err: unknown) => {
    if (isTransientPollingError(err)) {
      transientCount++;
      const now = Date.now();
      if (now - lastLogAt >= THROTTLE_MS) {
        const summary =
          err instanceof Error ? err.message : String(err);
        console.warn(
          `${prefix} Network glitch during Telegram polling (${transientCount} since last log): ${summary}. Retrying…`
        );
        transientCount = 0;
        lastLogAt = now;
      }
      return;
    }

    console.error(`${prefix} Polling error:`, err);
  };
}
