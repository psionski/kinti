import { Temporal } from "@js-temporal/polyfill";
import { and, eq, gte, lt } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { assets, assetPrices } from "@/lib/db/schema";
import type { RecordPriceInput, AssetPriceResponse } from "@/lib/validators/assets";
import { utcToLocal, localToUtc, isoToday, offsetDate } from "@/lib/date-ranges";
import { requireRow } from "@/lib/db/rows";

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
   */
  record(assetId: number, input: RecordPriceInput): AssetPriceResponse {
    const asset = this.db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.id, assetId))
      .get();
    if (!asset) throw new Error(`Asset ${assetId} not found`);

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
