// @vitest-environment node
/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeTestDb } from "../helpers";
import { triggerSymbolBackfill } from "@/lib/services/symbol-backfill";
import * as schema from "@/lib/db/schema";
import type { AssetResponse } from "@/lib/validators/assets";
import type { FinancialDataService } from "@/lib/services/financial-data";

type TestDb = ReturnType<typeof makeTestDb>;

let db: TestDb;

beforeEach(() => {
  db = makeTestDb();
});

function insertAsset(
  overrides: Partial<typeof schema.assets.$inferInsert> = {}
): typeof schema.assets.$inferSelect {
  return db
    .insert(schema.assets)
    .values({
      name: "Test Asset",
      type: "investment",
      currency: "EUR",
      ...overrides,
    })
    .returning()
    .get();
}

function toAssetResponse(
  row: typeof schema.assets.$inferSelect,
  symbolMap: AssetResponse["symbolMap"]
): AssetResponse {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AssetResponse["type"],
    currency: row.currency,
    symbolMap,
    icon: row.icon,
    color: row.color,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mockFinancialDataService(): FinancialDataService {
  return {
    ensurePriceHistory: vi.fn(async () => {}),
  } as unknown as FinancialDataService;
}

describe("triggerSymbolBackfill", () => {
  it("does nothing when asset has no symbolMap", () => {
    const asset = insertAsset();
    const fds = mockFinancialDataService();

    triggerSymbolBackfill(db, fds, toAssetResponse(asset, null));

    expect(fds.ensurePriceHistory).not.toHaveBeenCalled();
  });

  it("backfills from earliest lot date to today", async () => {
    const asset = insertAsset({ symbolMap: JSON.stringify({ coingecko: "bitcoin" }) });
    const fds = mockFinancialDataService();

    // Insert a lot with an early date
    db.insert(schema.assetLots)
      .values({
        assetId: asset.id,
        quantity: 1,
        pricePerUnit: 8500000,
        date: "2025-06-15",
      })
      .run();

    triggerSymbolBackfill(db, fds, toAssetResponse(asset, { coingecko: "bitcoin" }));

    // Wait for the fire-and-forget async
    await vi.waitFor(() => {
      expect(fds.ensurePriceHistory).toHaveBeenCalled();
    });

    expect(fds.ensurePriceHistory).toHaveBeenCalledWith(
      { coingecko: "bitcoin" },
      "EUR",
      "2025-06-15",
      expect.any(String) // today's date
    );
  });

  it("uses today as from-date when asset has no lots", async () => {
    const asset = insertAsset({ symbolMap: JSON.stringify({ coingecko: "bitcoin" }) });
    const fds = mockFinancialDataService();

    triggerSymbolBackfill(db, fds, toAssetResponse(asset, { coingecko: "bitcoin" }));

    await vi.waitFor(() => {
      expect(fds.ensurePriceHistory).toHaveBeenCalled();
    });

    // from and to should both be today
    const call = (fds.ensurePriceHistory as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[2]).toBe(call[3]); // from === to
  });

  it("backfills EUR exchange rate for non-EUR deposit assets", async () => {
    const asset = insertAsset({
      type: "deposit",
      currency: "USD",
      symbolMap: JSON.stringify({ frankfurter: "USD" }),
    });
    const fds = mockFinancialDataService();

    triggerSymbolBackfill(db, fds, toAssetResponse(asset, { frankfurter: "USD" }));

    await vi.waitFor(() => {
      expect(fds.ensurePriceHistory).toHaveBeenCalledTimes(2);
    });

    // First call: symbol priced in asset's own currency (USD)
    expect(fds.ensurePriceHistory).toHaveBeenCalledWith(
      { frankfurter: "USD" },
      "USD",
      expect.any(String),
      expect.any(String)
    );
    // Second call: exchange rate to EUR
    expect(fds.ensurePriceHistory).toHaveBeenCalledWith(
      { frankfurter: "USD" },
      "EUR",
      expect.any(String),
      expect.any(String)
    );
  });

  it("does not backfill EUR exchange rate for EUR deposit assets", async () => {
    const asset = insertAsset({
      type: "deposit",
      currency: "EUR",
      symbolMap: JSON.stringify({ frankfurter: "EUR" }),
    });
    const fds = mockFinancialDataService();

    triggerSymbolBackfill(db, fds, toAssetResponse(asset, { frankfurter: "EUR" }));

    await vi.waitFor(() => {
      expect(fds.ensurePriceHistory).toHaveBeenCalled();
    });

    // Should only have been called once (no EUR→EUR exchange rate backfill)
    expect(fds.ensurePriceHistory).toHaveBeenCalledTimes(1);
  });

  it("handles ensurePriceHistory failure gracefully", async () => {
    const asset = insertAsset({ symbolMap: JSON.stringify({ coingecko: "bitcoin" }) });
    const fds = mockFinancialDataService();
    (fds.ensurePriceHistory as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("network error")
    );

    // Should not throw
    triggerSymbolBackfill(db, fds, toAssetResponse(asset, { coingecko: "bitcoin" }));

    await vi.waitFor(() => {
      expect(fds.ensurePriceHistory).toHaveBeenCalled();
    });
  });
});
