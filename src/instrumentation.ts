export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { existsSync } = await import("fs");
    const { initCronJobs } = await import("@/lib/cron");
    const { getSettingsService } = await import("@/lib/api/services");
    const { setUserTimezone } = await import("@/lib/date-ranges");
    const { setBaseCurrencyCache } = await import("@/lib/format");

    const dbPath = process.env.DATABASE_URL ?? "./data/kinti.db";
    const isFirstRun = !existsSync(dbPath);

    if (isFirstRun) {
      const { seed } = await import("@/lib/db/seed");
      await seed();
    }

    const settings = getSettingsService();
    const tz = settings.getTimezone();
    if (tz) setUserTimezone(tz);

    const baseCurrency = settings.getBaseCurrency();
    if (baseCurrency) setBaseCurrencyCache(baseCurrency);

    initCronJobs();
  }
}
