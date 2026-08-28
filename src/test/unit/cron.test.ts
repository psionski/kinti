// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("node-cron", () => ({
  default: { schedule: vi.fn() },
}));
vi.mock("@/lib/api/services", () => ({
  getRecurringService: vi.fn(),
  getFinancialDataService: vi.fn(),
  getAssetPriceService: vi.fn(),
}));
vi.mock("@/lib/services/backup", () => ({
  runBackup: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ all: vi.fn(() => []) })) })),
    })),
  })),
}));
describe("initCronJobs singleton guard", () => {
  beforeEach(() => {
    const g = globalThis as unknown as { __kintiCronInit?: boolean };
    delete g.__kintiCronInit;
    vi.clearAllMocks();
  });

  afterEach(() => {
    const g = globalThis as unknown as { __kintiCronInit?: boolean };
    delete g.__kintiCronInit;
  });

  it("sets the global flag and schedules three jobs on first call", async () => {
    const { initCronJobs } = await import("@/lib/cron");
    const cron = (await import("node-cron")).default;

    initCronJobs();

    const g = globalThis as unknown as { __kintiCronInit?: boolean };
    expect(g.__kintiCronInit).toBe(true);
    expect(cron.schedule).toHaveBeenCalledTimes(3);

    expect(cron.schedule).toHaveBeenCalledWith("0 2 * * *", expect.any(Function));
    expect(cron.schedule).toHaveBeenCalledWith("0 3 * * *", expect.any(Function));
    expect(cron.schedule).toHaveBeenCalledWith("0 4 * * *", expect.any(Function));
  });

  it("does not schedule duplicate jobs on second call", async () => {
    const { initCronJobs } = await import("@/lib/cron");
    const cron = (await import("node-cron")).default;

    initCronJobs();
    initCronJobs();

    expect(cron.schedule).toHaveBeenCalledTimes(3);
  });
});

describe("runRecurringJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls generatePending with no arguments", async () => {
    const { runRecurringJob } = await import("@/lib/cron");
    const { getRecurringService } = await import("@/lib/api/services");

    const mockGeneratePending = vi.fn().mockResolvedValue(3);
    vi.mocked(getRecurringService).mockReturnValue({
      generatePending: mockGeneratePending,
    } as unknown as ReturnType<typeof getRecurringService>);

    await runRecurringJob();

    expect(getRecurringService).toHaveBeenCalled();
    expect(mockGeneratePending).toHaveBeenCalledWith();
  });

  it("logs when transactions are generated", async () => {
    const { runRecurringJob } = await import("@/lib/cron");
    const { getRecurringService } = await import("@/lib/api/services");
    const { cronLogger } = await import("@/lib/logger");

    vi.mocked(getRecurringService).mockReturnValue({
      generatePending: vi.fn().mockResolvedValue(5),
    } as unknown as ReturnType<typeof getRecurringService>);

    const infoSpy = vi.spyOn(cronLogger, "info");
    await runRecurringJob();
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ count: 5 }),
      expect.stringContaining("Generated recurring transactions")
    );
    infoSpy.mockRestore();
  });

  it("does not log when zero transactions generated", async () => {
    const { runRecurringJob } = await import("@/lib/cron");
    const { getRecurringService } = await import("@/lib/api/services");
    const { cronLogger } = await import("@/lib/logger");

    vi.mocked(getRecurringService).mockReturnValue({
      generatePending: vi.fn().mockResolvedValue(0),
    } as unknown as ReturnType<typeof getRecurringService>);

    const infoSpy = vi.spyOn(cronLogger, "info");
    await runRecurringJob();
    expect(infoSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ count: expect.any(Number) as unknown }),
      expect.stringContaining("Generated recurring transactions")
    );
    infoSpy.mockRestore();
  });

  it("catches and logs errors without throwing", async () => {
    const { runRecurringJob } = await import("@/lib/cron");
    const { getRecurringService } = await import("@/lib/api/services");
    const { cronLogger } = await import("@/lib/logger");

    vi.mocked(getRecurringService).mockImplementation(() => {
      throw new Error("db locked");
    });

    const errorSpy = vi.spyOn(cronLogger, "error");
    await expect(runRecurringJob()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) as unknown }),
      expect.stringContaining("Failed to generate")
    );
    errorSpy.mockRestore();
  });
});

describe("runBackupJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls runBackup and logs the result", async () => {
    const { runBackupJob } = await import("@/lib/cron");
    const { runBackup } = await import("@/lib/services/backup");
    const { cronLogger } = await import("@/lib/logger");

    vi.mocked(runBackup).mockResolvedValue({ path: "/backups/test.db", rotatedCount: 2 });

    const infoSpy = vi.spyOn(cronLogger, "info");
    await runBackupJob();

    expect(runBackup).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/backups/test.db", rotated: 2 }),
      expect.stringContaining("Backup saved")
    );
    infoSpy.mockRestore();
  });

  it("catches and logs errors without throwing", async () => {
    const { runBackupJob } = await import("@/lib/cron");
    const { runBackup } = await import("@/lib/services/backup");
    const { cronLogger } = await import("@/lib/logger");

    vi.mocked(runBackup).mockRejectedValue(new Error("disk full"));

    const errorSpy = vi.spyOn(cronLogger, "error");
    await expect(runBackupJob()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) as unknown }),
      expect.stringContaining("Backup failed")
    );
    errorSpy.mockRestore();
  });
});

describe("runMarketPriceJob", () => {
  // A price refresh that fails silently is worse than one that fails loudly:
  // the portfolio keeps showing the last price it had, which is indistinguishable
  // from a price that simply didn't move. Every asset it can't price has to
  // reach the log with its symbols attached.
  interface PriceOutcome {
    result?: { price: number; stale: boolean } | null;
    error?: Error;
  }

  async function runWithAssets(outcomes: Record<string, PriceOutcome>): Promise<void> {
    const { getDb } = await import("@/lib/db");
    const { getFinancialDataService } = await import("@/lib/api/services");

    const rows = Object.keys(outcomes).map((symbol, i) => ({
      id: i + 1,
      symbolMap: JSON.stringify({ "alpha-vantage": symbol }),
      currency: "EUR",
    }));

    vi.mocked(getDb).mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ all: () => rows }) }) }),
    } as unknown as ReturnType<typeof getDb>);

    vi.mocked(getFinancialDataService).mockReturnValue({
      getPrice: vi.fn((map: Record<string, string>) => {
        const outcome = outcomes[map["alpha-vantage"]!]!;
        if (outcome.error) return Promise.reject(outcome.error);
        return Promise.resolve(outcome.result ?? null);
      }),
      backfillTransactionRates: vi.fn().mockResolvedValue({ pairs: 0, fetched: 0 }),
      backfillAssetCurrencyRates: vi.fn().mockResolvedValue({ currencies: 0, fetched: 0 }),
    } as unknown as ReturnType<typeof getFinancialDataService>);

    const { runMarketPriceJob } = await import("@/lib/cron");
    await runMarketPriceJob();
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("names the assets no provider could price", async () => {
    const { cronLogger } = await import("@/lib/logger");
    const warnSpy = vi.spyOn(cronLogger, "warn");

    await runWithAssets({
      SXR8: { result: { price: 100, stale: false } },
      WEBN: { result: null },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        failures: expect.arrayContaining([
          expect.objectContaining({ symbols: ["WEBN"], reason: "no data" }),
        ]) as unknown,
      }),
      expect.stringContaining("could not be priced")
    );
    warnSpy.mockRestore();
  });

  it("treats a stale-cache fallback as a failure, not a refresh", async () => {
    const { cronLogger } = await import("@/lib/logger");
    const infoSpy = vi.spyOn(cronLogger, "info");

    // getPrice answers, but only by replaying an old cached row — the whole
    // point of the run was to fetch something newer.
    await runWithAssets({ WEBN: { result: { price: 12.76, stale: true } } });

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ warmed: 0, failed: 1, total: 1 }),
      expect.stringContaining("Market price refresh complete")
    );
    infoSpy.mockRestore();
  });

  it("records why a provider threw", async () => {
    const { ProviderRateLimitError } = await import("@/lib/providers/errors");
    const { cronLogger } = await import("@/lib/logger");
    const warnSpy = vi.spyOn(cronLogger, "warn");

    await runWithAssets({
      WEBN: { error: new ProviderRateLimitError("alpha-vantage", "25 requests per day") },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        failures: expect.arrayContaining([
          expect.objectContaining({
            symbols: ["WEBN"],
            reason: expect.stringContaining("25 requests per day") as unknown,
          }),
        ]) as unknown,
      }),
      expect.stringContaining("could not be priced")
    );
    warnSpy.mockRestore();
  });

  it("reports a summary even when every asset refreshed cleanly", async () => {
    const { cronLogger } = await import("@/lib/logger");
    const infoSpy = vi.spyOn(cronLogger, "info");
    const warnSpy = vi.spyOn(cronLogger, "warn");

    await runWithAssets({
      SXR8: { result: { price: 100, stale: false } },
      WEBN: { result: { price: 12.816, stale: false } },
    });

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ warmed: 2, failed: 0, total: 2 }),
      expect.stringContaining("Market price refresh complete")
    );
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("could not be priced")
    );
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
