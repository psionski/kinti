import { asc, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { assets, assetLots } from "@/lib/db/schema";
import type {
  CreateAssetInput,
  UpdateAssetInput,
  AssetResponse,
  AssetWithMetrics,
} from "@/lib/validators/assets";
import { resolvePrice } from "./price-resolver";
import { findCachedFxRate } from "./fx-cache";
import { isoToday, utcToLocal } from "@/lib/date-ranges";
import { getBaseCurrency, roundToCurrency } from "@/lib/format";

type Db = BetterSQLite3Database<typeof schema>;

function parseAsset(row: schema.Asset): AssetResponse {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AssetResponse["type"],
    currency: row.currency,
    symbolMap: row.symbolMap ? (JSON.parse(row.symbolMap) as Record<string, string>) : null,
    icon: row.icon,
    color: row.color,
    notes: row.notes,
    createdAt: utcToLocal(row.createdAt),
    updatedAt: utcToLocal(row.updatedAt),
  };
}

export class AssetService {
  constructor(private db: Db) {}

  create(input: CreateAssetInput): AssetResponse {
    // Default currency to the configured base when the caller omits it. Done
    // here rather than in the Zod schema because Zod can't default to a
    // runtime value that's read from settings.
    const currency = input.currency ?? getBaseCurrency();
    const [row] = this.db
      .insert(assets)
      .values({
        name: input.name,
        type: input.type,
        currency,
        symbolMap: input.symbolMap ? JSON.stringify(input.symbolMap) : null,
        icon: input.icon ?? null,
        color: input.color ?? null,
        notes: input.notes ?? null,
      })
      .returning()
      .all();
    return parseAsset(row);
  }

  getById(id: number): AssetWithMetrics | null {
    const row = this.db.select().from(assets).where(eq(assets.id, id)).get();
    if (!row) return null;
    return this.attachMetrics(parseAsset(row));
  }

  list(): AssetWithMetrics[] {
    const rows = this.db.select().from(assets).all();
    return rows.map((row) => this.attachMetrics(parseAsset(row)));
  }

  update(id: number, input: UpdateAssetInput): AssetResponse | null {
    const updates: Partial<schema.NewAsset> = {
      updatedAt: sql`(datetime('now'))` as unknown as string,
    };
    if (input.name !== undefined) updates.name = input.name;
    if (input.type !== undefined) updates.type = input.type;
    if (input.currency !== undefined) updates.currency = input.currency;
    if ("symbolMap" in input)
      updates.symbolMap = input.symbolMap ? JSON.stringify(input.symbolMap) : null;
    if ("icon" in input) updates.icon = input.icon ?? null;
    if ("color" in input) updates.color = input.color ?? null;
    if ("notes" in input) updates.notes = input.notes ?? null;

    const [row] = this.db.update(assets).set(updates).where(eq(assets.id, id)).returning().all();
    return row ? parseAsset(row) : null;
  }

  delete(id: number): boolean {
    const result = this.db.delete(assets).where(eq(assets.id, id)).run();
    return result.changes > 0;
  }

  private attachMetrics(asset: AssetResponse): AssetWithMetrics {
    // FIFO cost basis: fetch all lots chronologically and simulate the queue.
    // Each sell consumes the oldest buy lots first, so the remaining queue
    // represents the actual cost of current holdings.
    const lots = this.db
      .select({
        quantity: assetLots.quantity,
        pricePerUnit: assetLots.pricePerUnit,
        pricePerUnitBase: assetLots.pricePerUnitBase,
      })
      .from(assetLots)
      .where(eq(assetLots.assetId, asset.id))
      .orderBy(asc(assetLots.date), asc(assetLots.id))
      .all();

    const queue: Array<{ qty: number; price: number; priceBase: number }> = [];
    for (const lot of lots) {
      if (lot.quantity > 0) {
        queue.push({
          qty: lot.quantity,
          price: lot.pricePerUnit,
          priceBase: lot.pricePerUnitBase,
        });
      } else {
        let toConsume = -lot.quantity;
        while (toConsume > 0 && queue.length > 0) {
          const front = queue[0];
          if (front.qty <= toConsume) {
            toConsume -= front.qty;
            queue.shift();
          } else {
            front.qty -= toConsume;
            toConsume = 0;
          }
        }
      }
    }

    const baseCurrency = getBaseCurrency();
    const currentHoldings = parseFloat(queue.reduce((sum, e) => sum + e.qty, 0).toFixed(8));
    const costBasis = roundToCurrency(
      queue.reduce((sum, e) => sum + e.qty * e.price, 0),
      asset.currency
    );
    const costBasisBase = roundToCurrency(
      queue.reduce((sum, e) => sum + e.qty * e.priceBase, 0),
      baseCurrency
    );

    // Unified price resolution: user override → market → lot → deposit
    const resolved = resolvePrice(this.db, asset);
    const pricePerUnit = resolved?.price ?? null;

    const currentValue =
      pricePerUnit !== null
        ? roundToCurrency(currentHoldings * pricePerUnit, asset.currency)
        : null;
    const pnl =
      currentValue !== null ? roundToCurrency(currentValue - costBasis, asset.currency) : null;

    // Convert current value to base currency using a cached FX rate.
    // For base-currency assets the rate is 1; for foreign currencies we look up
    // the most recent rate within the 7-day cache window. If none is cached
    // (e.g. nightly cron hasn't run yet), currentValueBase is null and the
    // portfolio sum simply skips this asset rather than mixing units.
    let currentValueBase: number | null = null;
    if (currentValue !== null) {
      if (asset.currency === baseCurrency) {
        currentValueBase = currentValue;
      } else {
        const rate = findCachedFxRate(this.db, asset.currency, baseCurrency, isoToday());
        if (rate !== null) {
          currentValueBase = roundToCurrency(currentValue * rate, baseCurrency);
        }
      }
    }
    const pnlBase =
      currentValueBase !== null
        ? roundToCurrency(currentValueBase - costBasisBase, baseCurrency)
        : null;

    return {
      ...asset,
      currentHoldings,
      costBasis,
      costBasisBase,
      currentValue,
      currentValueBase,
      pnl,
      pnlBase,
      latestPrice: pricePerUnit,
    };
  }
}
