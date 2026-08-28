/**
 * Typed provider failures.
 *
 * Several providers signal failure with HTTP 200 and an error envelope in the
 * JSON body rather than a status code. Returning `null` for those makes a
 * throttled call indistinguishable from "this symbol doesn't exist", which is
 * what let a rate-limited nightly refresh look like a successful no-op. Throw
 * these instead so `FinancialDataService` logs the cause and the caller can
 * tell a transient failure from a permanent one.
 */
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string
  ) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
  }
}

/** Quota exhausted or throttled — transient, worth retrying on the next run. */
export class ProviderRateLimitError extends ProviderError {
  constructor(provider: string, message: string) {
    super(provider, message);
    this.name = "ProviderRateLimitError";
  }
}
