import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { assetLots } from "@/lib/db/schema";
import type { AssetResponse } from "@/lib/validators/assets";
import { getBaseCurrency, roundToCurrency } from "@/lib/format";

export type Db = BetterSQLite3Database<typeof schema>;

export function parseAssetRow(row: schema.Asset): AssetResponse {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AssetResponse["type"],
    currency: row.currency,
    symbolMap: row.symbolMap ? (JSON.parse(row.symbolMap) as Record<string, string>) : null,
    icon: row.icon,
    color: row.color,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Sum of lot quantities for an asset up to (and including) the given date. */
export function getHoldingsAtDate(db: Db, assetId: number, date: string): number {
  const [row] = db
    .select({
      total: sql<number>`coalesce(sum(${assetLots.quantity}), 0)`.mapWith(Number),
    })
    .from(assetLots)
    .where(and(eq(assetLots.assetId, assetId), lte(assetLots.date, date)))
    .all();
  return parseFloat((row?.total ?? 0).toFixed(8));
}

/** FIFO queue entry. */
interface FifoEntry {
  qty: number;
  price: number;
  /** Per-unit price in the configured base currency, snapshotted at lot creation. */
  priceBase: number;
  /** Native currency of the asset this lot belongs to (for per-currency rounding). */
  currency: string;
}

/**
 * Consume `quantity` units from the front of a FIFO buy queue.
 * Mutates the queue in-place and returns both the native and base cost of
 * consumed units. Rounding respects per-currency precision so JPY (0 decimals)
 * and BHD (3 decimals) come out clean.
 */
export function consumeFifo(
  queue: FifoEntry[],
  quantity: number
): { cost: number; costBase: number } {
  const baseCurrency = getBaseCurrency();
  let toConsume = quantity;
  let cost = 0;
  let costBase = 0;
  // All lots in a queue belong to one asset, so the native currency is shared.
  // Capture it from the first entry we touch so we can round at the end even
  // after the queue is fully drained.
  let nativeCurrency = baseCurrency;
  while (toConsume > 0 && queue.length > 0) {
    const front = queue[0];
    nativeCurrency = front.currency;
    const consumed = Math.min(front.qty, toConsume);
    cost += consumed * front.price;
    costBase += consumed * front.priceBase;
    front.qty -= consumed;
    toConsume -= consumed;
    if (front.qty <= 0) queue.shift();
  }
  return {
    cost: roundToCurrency(cost, nativeCurrency),
    costBase: roundToCurrency(costBase, baseCurrency),
  };
}

/**
 * FIFO cost basis (native + base) and earliest lot date for an asset up to
 * the given date. The asset's native currency is needed up-front so the queue
 * entries carry it for per-currency rounding inside `consumeFifo`.
 */
export function getCostBasisAtDate(
  db: Db,
  assetId: number,
  date: string,
  assetCurrency: string
): { costBasis: number; costBasisBase: number; earliestDate: string | null } {
  const lots = db
    .select({
      quantity: assetLots.quantity,
      pricePerUnit: assetLots.pricePerUnit,
      pricePerUnitBase: assetLots.pricePerUnitBase,
      date: assetLots.date,
    })
    .from(assetLots)
    .where(and(eq(assetLots.assetId, assetId), lte(assetLots.date, date)))
    .orderBy(asc(assetLots.date), asc(assetLots.id))
    .all();

  if (lots.length === 0) return { costBasis: 0, costBasisBase: 0, earliestDate: null };

  const queue: FifoEntry[] = [];
  for (const lot of lots) {
    if (lot.quantity > 0) {
      queue.push({
        qty: lot.quantity,
        price: lot.pricePerUnit,
        priceBase: lot.pricePerUnitBase,
        currency: assetCurrency,
      });
    } else {
      consumeFifo(queue, -lot.quantity);
    }
  }

  const baseCurrency = getBaseCurrency();
  const costBasis = roundToCurrency(
    queue.reduce((sum, e) => sum + e.qty * e.price, 0),
    assetCurrency
  );
  const costBasisBase = roundToCurrency(
    queue.reduce((sum, e) => sum + e.qty * e.priceBase, 0),
    baseCurrency
  );
  return { costBasis, costBasisBase, earliestDate: lots[0].date };
}
