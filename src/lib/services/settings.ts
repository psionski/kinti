import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { settings } from "@/lib/db/schema";
import { CurrencySchema } from "@/lib/validators/common";

type Db = BetterSQLite3Database<typeof schema>;

export class SettingsService {
  constructor(private db: Db) {}

  /** Get a setting value by key. Returns null if not set. */
  get(key: string): string | null {
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get();
    return row?.value ?? null;
  }

  /** Set a setting value (upsert). */
  set(key: string, value: string): void {
    this.db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();
  }

  /** Delete a setting by key. Returns true if it existed. */
  delete(key: string): boolean {
    const existing = this.db
      .select({ key: settings.key })
      .from(settings)
      .where(eq(settings.key, key))
      .get();
    if (!existing) return false;
    this.db.delete(settings).where(eq(settings.key, key)).run();
    return true;
  }

  /** List all settings as key-value pairs. */
  list(): Array<{ key: string; value: string }> {
    return this.db.select().from(settings).all();
  }

  /** Get the user's IANA timezone. Returns null if not yet configured. */
  getTimezone(): string | null {
    return this.get("timezone");
  }

  /** Set the user's IANA timezone. Throws on invalid identifier. */
  setTimezone(tz: string): void {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
      throw new Error(`Invalid IANA timezone: ${tz}`);
    }
    this.set("timezone", tz);
  }

  /**
   * Get the configured base currency (ISO 4217). Returns null if not yet
   * configured. All portfolio-level valuations and report aggregations are
   * denominated in this currency.
   */
  getBaseCurrency(): string | null {
    return this.get("base_currency");
  }

  /**
   * Set the base currency. Throws if already set — base currency is immutable
   * once configured. Migrating between base currencies requires a fresh DB.
   */
  setBaseCurrency(currency: string): void {
    const parsed = CurrencySchema.parse(currency);
    const existing = this.getBaseCurrency();
    if (existing !== null && existing !== parsed) {
      throw new Error(
        `Base currency is immutable: already set to ${existing}. ` +
          `Migrating between base currencies requires a fresh database.`
      );
    }
    this.set("base_currency", parsed);
  }
}
