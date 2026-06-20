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
      expect.objectContaining({ count: expect.any(Number) }),
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
      expect.objectContaining({ err: expect.any(Error) }),
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
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining("Backup failed")
    );
    errorSpy.mockRestore();
  });
});
