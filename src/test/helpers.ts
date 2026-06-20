import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";
import * as schema from "@/lib/db/schema";
import { settings } from "@/lib/db/schema";
import { ensureFtsTriggers } from "@/lib/db/index";
import { setBaseCurrencyCache } from "@/lib/format";

const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../drizzle");

interface MakeTestDbOptions {
  /**
   * Base currency to seed in the settings table and the global cache.
   * Defaults to "EUR" so existing tests keep working unchanged.
   */
  baseCurrency?: string;
  /**
   * If false, the settings table is left empty (no base_currency row seeded).
   * Set this in tests that need a pristine settings table — e.g. tests for
   * SettingsService itself that count rows or expect missing keys.
   */
  seedBaseCurrency?: boolean;
}

/** Creates a fresh in-memory SQLite DB with migrations applied. Use in tests. */
export function makeTestDb(options: MakeTestDbOptions = {}) {
  const baseCurrency = options.baseCurrency ?? "EUR";
  const seed = options.seedBaseCurrency ?? true;
  const client = new Database(":memory:");
  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");
  const db = drizzle({ client, schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  ensureFtsTriggers(client);

  if (seed) {
    // Seed the base currency so service-layer code that calls getBaseCurrency()
    // (e.g. price-resolver, transactions service, format helpers) sees the
    // expected value during tests.
    db.insert(settings).values({ key: "base_currency", value: baseCurrency }).run();
    setBaseCurrencyCache(baseCurrency);
  }

  return db;
}
