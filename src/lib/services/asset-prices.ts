import { Temporal } from "@js-temporal/polyfill";
import { and, eq, gte, lt } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { assets, assetPrices } from "@/lib/db/schema";
import type { RecordPriceInput, AssetPriceResponse } from "@/lib/validators/assets";
import { utcToLocal, localToUtc, isoToday, offsetDate } from "@/lib/date-ranges";
import { requireRow } from "@/lib/db/rows";
import { ValidationError } from "@/lib/errors";

type Db = BetterSQLite3Database<typeof schema>;

function parsePrice(row: schema.AssetPrice): AssetPriceResponse {
  return {
    id: row.id,
    assetId: row.assetId,
    pricePerUnit: row.pricePerUnit,
    recordedAt: utcToLocal(row.recordedAt),
  };
}

export class AssetPriceService {
  constructor(private db: Db) {}

  /**
   * Record a user-provided price for an asset.
   * If a price already exists for the same asset on the same calendar date,
   * it is updated instead of creating a duplicate.
   *
   * Deposits are rejected: one unit of a deposit is one unit of its currency by
   * definition, so `resolvePrice` answers 1 without consulting this table and a
   * mark stored here could never be read back. Failing loudly beats accepting a
   * write that would silently do nothing. What a foreign deposit is worth in
   * base moves with its exchange rate, which is FX data, not a mark.
   */
  record(assetId: number, input: RecordPriceInput): AssetPriceResponse {
    const asset = this.db
      .select({ id: assets.id, type: assets.type, currency: assets.currency })
      .from(assets)
      .where(eq(assets.id, assetId))
      .get();
    if (!asset) throw new Error(`Asset ${assetId} not found`);
    if (asset.type === "deposit") {
      throw new ValidationError(
        `Cannot set a price on a deposit: 1 unit is always 1 ${asset.currency}. ` +
          `Use deposit/withdraw to change the balance.`
      );
    }

    const recordedAt = input.recordedAt
      ? localToUtc(input.recordedAt)
      : Temporal.Now.instant().toString();

    // Local-day boundaries converted to UTC, matching how recordedAt is stored
    const date = input.recordedAt ? input.recordedAt.slice(0, 10) : isoToday();
    const nextDay = offsetDate(date, 1);
    const dayStartUtc = localToUtc(date + "T00:00:00");
    const dayEndUtc = localToUtc(nextDay + "T00:00:00");

    // Remove any existing price for this asset on the same calendar date
    this.db
      .delete(assetPrices)
      .where(
        and(
          eq(assetPrices.assetId, assetId),
          gte(assetPrices.recordedAt, dayStartUtc),
          lt(assetPrices.recordedAt, dayEndUtc)
        )
      )
      .run();

    const row = requireRow(
      this.db
        .insert(assetPrices)
        .values({ assetId, pricePerUnit: input.pricePerUnit, recordedAt })
        .returning()
        .all(),
      "asset price"
    );
    return parsePrice(row);
  }
}
