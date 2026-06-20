import { existsSync, rmSync } from "fs";
import { resetDb } from "@/lib/db";
import { getSettingsService } from "@/lib/api/services";
import { clearTimezoneCache } from "@/lib/date-ranges";
import { dbLogger } from "@/lib/logger";

const DB_PATH = process.env.DATABASE_URL ?? "./data/kinti.db";

/** Returns true if the database is populated with sample/seed data. */
export function hasSampleData(): boolean {
  return getSettingsService().get("sample_data") === "true";
}

/**
 * Delete the sample-data database so a fresh one is created on next access.
 * Refuses to run unless the database is flagged as sample data — this
 * prevents accidentally wiping a real account.
 */
export function clearSampleData(): void {
  if (!hasSampleData()) {
    throw new Error(
      "This database is not flagged as sample data — refusing to delete to protect real financial data"
    );
  }

  // Close the live connection and clear cached state
  resetDb();
  clearTimezoneCache();

  // Delete the database file and any WAL/SHM companions
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = DB_PATH + suffix;
    if (existsSync(p)) rmSync(p);
  }

  dbLogger.info("Database cleared — fresh DB will be created on next access");
}
