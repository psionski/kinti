import { eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { assets, assetLots, assetPrices, transactions } from "@/lib/db/schema";
import type {
  BuyAssetInput,
  SellAssetInput,
  CreateOpeningLotInput,
  AssetLotResponse,
} from "@/lib/validators/assets";
import type { TransactionResponse } from "@/lib/validators/transactions";
import { localToUtc, utcToLocal } from "@/lib/date-ranges";
import { getBaseCurrency, roundToCurrency } from "@/lib/format";
import type { FinancialDataService } from "./financial-data";

type Db = BetterSQLite3Database<typeof schema>;

function parseLot(row: schema.AssetLot): AssetLotResponse {
  return {
    id: row.id,
    assetId: row.assetId,
    quantity: row.quantity,
    pricePerUnit: row.pricePerUnit,
    pricePerUnitBase: row.pricePerUnitBase,
    date: row.date,
    transactionId: row.transactionId,
    notes: row.notes,
    createdAt: utcToLocal(row.createdAt),
  };
}

function parseTransaction(row: schema.Transaction): TransactionResponse {
  return {
    ...row,
    type: row.type as TransactionResponse["type"],
    tags: null,
    createdAt: utcToLocal(row.createdAt),
    updatedAt: utcToLocal(row.updatedAt),
  };
}

export class AssetLotService {
  constructor(
    private db: Db,
    private financialData?: FinancialDataService
  ) {}

  /** Record a price snapshot from a transaction — every buy/sell is a price observation. */
  private recordPriceSnapshot(assetId: number, pricePerUnit: number, date: string): void {
    this.db
      .insert(assetPrices)
      .values({
        assetId,
        pricePerUnit,
        recordedAt: localToUtc(date + "T00:00:00"),
      })
      .run();
  }

  /**
   * Deposit assets are 1-unit-per-unit-of-the-asset's-currency, regardless of
   * whether that currency is the base or a foreign one. Anything else corrupts
   * the cost basis. Centralised so buy/sell/createOpeningLot all enforce it.
   */
  private assertDepositPrice(asset: schema.Asset, pricePerUnit: number): void {
    if (asset.type === "deposit" && pricePerUnit !== 1) {
      throw new Error(
        `${asset.currency} deposit: pricePerUnit must be 1 (1 unit per ${asset.currency}). ` +
          `Use quantity to represent the ${asset.currency} amount ` +
          `(e.g. quantity: 5000 for a 5,000 ${asset.currency} deposit).`
      );
    }
  }

  /**
   * Convert a native total (in `currency`) to the base currency. Used by
   * buy/sell to denormalize amount_base on the synthetic transfer transaction
   * they create. Throws when no FX provider can resolve the rate.
   */
  private async toBase(total: number, currency: string, date: string): Promise<number> {
    const base = getBaseCurrency();
    if (currency === base) return roundToCurrency(total, base);
    if (!this.financialData) {
      throw new Error(
        `Cannot record ${currency} buy/sell without FinancialDataService — ` +
          `inject one when constructing AssetLotService.`
      );
    }
    const result = await this.financialData.convertToBase(total, currency, date);
    if (result === null) {
      throw new Error(
        `Cannot convert ${currency} → ${base} on ${date} — no FX provider has the rate.`
      );
    }
    return result.amountBase;
  }

  async buy(
    assetId: number,
    input: BuyAssetInput
  ): Promise<{ lot: AssetLotResponse; transaction: TransactionResponse }> {
    const asset = this.db.select().from(assets).where(eq(assets.id, assetId)).get();
    if (!asset) throw new Error(`Asset ${assetId} not found`);
    this.assertDepositPrice(asset, input.pricePerUnit);

    const total = roundToCurrency(input.quantity * input.pricePerUnit, asset.currency);
    // FX conversion happens before the SQLite transaction (which must be sync).
    const totalBase = await this.toBase(total, asset.currency, input.date);
    // Per-unit base price is pinned at lot creation. Derive it from totalBase
    // so it's consistent with the synthetic transaction's amount_base — same
    // FX call, same rate, no drift.
    const pricePerUnitBase = totalBase / input.quantity;

    const verb = asset.type === "deposit" ? "Deposit" : "Buy";
    const description =
      input.description ??
      `${verb} ${input.quantity} ${asset.name} @ ${input.pricePerUnit.toFixed(2)} ${asset.currency}`;

    return this.db.transaction(() => {
      const [txRow] = this.db
        .insert(transactions)
        .values({
          amount: -total,
          currency: asset.currency,
          amountBase: -totalBase,
          type: "transfer",
          description,
          date: input.date,
          notes: input.notes ?? null,
        })
        .returning()
        .all();

      const [lotRow] = this.db
        .insert(assetLots)
        .values({
          assetId,
          quantity: input.quantity,
          pricePerUnit: input.pricePerUnit,
          pricePerUnitBase,
          date: input.date,
          transactionId: txRow.id,
          notes: input.notes ?? null,
        })
        .returning()
        .all();

      this.recordPriceSnapshot(assetId, input.pricePerUnit, input.date);

      return { lot: parseLot(lotRow), transaction: parseTransaction(txRow) };
    });
  }

  async sell(
    assetId: number,
    input: SellAssetInput
  ): Promise<{ lot: AssetLotResponse; transaction: TransactionResponse }> {
    const asset = this.db.select().from(assets).where(eq(assets.id, assetId)).get();
    if (!asset) throw new Error(`Asset ${assetId} not found`);
    this.assertDepositPrice(asset, input.pricePerUnit);

    // Check sufficient holdings (race-prone outside the inner transaction, but
    // the same sanity check is repeated inside; the inner check is the
    // authoritative one).
    const [holdingsRow] = this.db
      .select({ total: sql<number>`coalesce(sum(${assetLots.quantity}), 0)`.mapWith(Number) })
      .from(assetLots)
      .where(eq(assetLots.assetId, assetId))
      .all();
    const currentHoldings = holdingsRow?.total ?? 0;
    if (input.quantity > currentHoldings) {
      throw new Error(`Insufficient holdings: have ${currentHoldings}, selling ${input.quantity}`);
    }

    const total = roundToCurrency(input.quantity * input.pricePerUnit, asset.currency);
    const totalBase = await this.toBase(total, asset.currency, input.date);
    // Sells store the proceeds-per-unit in base for parity with buys; FIFO
    // consumption uses the stored buy-side base price, not the sell.
    const pricePerUnitBase = totalBase / input.quantity;

    const verb = asset.type === "deposit" ? "Withdraw" : "Sell";
    const description =
      input.description ??
      `${verb} ${input.quantity} ${asset.name} @ ${input.pricePerUnit.toFixed(2)} ${asset.currency}`;

    return this.db.transaction(() => {
      // Re-check inside the inner transaction in case of concurrent writes.
      const [innerHoldings] = this.db
        .select({ total: sql<number>`coalesce(sum(${assetLots.quantity}), 0)`.mapWith(Number) })
        .from(assetLots)
        .where(eq(assetLots.assetId, assetId))
        .all();
      if (input.quantity > (innerHoldings?.total ?? 0)) {
        throw new Error(
          `Insufficient holdings: have ${innerHoldings?.total ?? 0}, selling ${input.quantity}`
        );
      }

      const [txRow] = this.db
        .insert(transactions)
        .values({
          amount: total,
          currency: asset.currency,
          amountBase: totalBase,
          type: "transfer",
          description,
          date: input.date,
          notes: input.notes ?? null,
        })
        .returning()
        .all();

      const [lotRow] = this.db
        .insert(assetLots)
        .values({
          assetId,
          quantity: -input.quantity,
          pricePerUnit: input.pricePerUnit,
          pricePerUnitBase,
          date: input.date,
          transactionId: txRow.id,
          notes: input.notes ?? null,
        })
        .returning()
        .all();

      this.recordPriceSnapshot(assetId, input.pricePerUnit, input.date);

      return { lot: parseLot(lotRow), transaction: parseTransaction(txRow) };
    });
  }

  /** Create an opening lot (no linked transaction) for onboarding — "I already own this." */
  async createOpeningLot(assetId: number, input: CreateOpeningLotInput): Promise<AssetLotResponse> {
    const asset = this.db.select().from(assets).where(eq(assets.id, assetId)).get();
    if (!asset) throw new Error(`Asset ${assetId} not found`);
    // Allow pricePerUnit === 0 for "I own this but don't know what I paid"
    // opening lots; only enforce the deposit rule when a price is given.
    if (input.pricePerUnit > 0) {
      this.assertDepositPrice(asset, input.pricePerUnit);
    }

    // Compute base-currency cost outside the SQLite transaction (which is sync).
    // For zero-cost opening lots ("I own this but don't know what I paid"),
    // we don't need an FX rate at all — both numbers are zero.
    const baseCurrency = getBaseCurrency();
    let pricePerUnitBase = input.pricePerUnit;
    if (input.pricePerUnit > 0 && asset.currency !== baseCurrency) {
      const total = roundToCurrency(input.quantity * input.pricePerUnit, asset.currency);
      const totalBase = await this.toBase(total, asset.currency, input.date);
      pricePerUnitBase = totalBase / input.quantity;
    }

    return this.db.transaction(() => {
      const [lotRow] = this.db
        .insert(assetLots)
        .values({
          assetId,
          quantity: input.quantity,
          pricePerUnit: input.pricePerUnit,
          pricePerUnitBase,
          date: input.date,
          transactionId: null,
          notes: input.notes ?? null,
        })
        .returning()
        .all();

      if (input.pricePerUnit > 0) {
        this.recordPriceSnapshot(assetId, input.pricePerUnit, input.date);
      }

      return parseLot(lotRow);
    });
  }

  listLots(assetId: number): AssetLotResponse[] {
    const asset = this.db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.id, assetId))
      .get();
    if (!asset) throw new Error(`Asset ${assetId} not found`);

    return this.db
      .select()
      .from(assetLots)
      .where(eq(assetLots.assetId, assetId))
      .orderBy(sql`${assetLots.date} DESC`)
      .all()
      .map(parseLot);
  }

  getLot(id: number): AssetLotResponse | null {
    const row = this.db.select().from(assetLots).where(eq(assetLots.id, id)).get();
    return row ? parseLot(row) : null;
  }
}
