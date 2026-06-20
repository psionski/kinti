import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CreateAssetSchema,
  UpdateAssetSchema,
  BuyAssetSchema,
  SellAssetSchema,
  RecordPriceSchema,
} from "@/lib/validators/assets";
import { IdSchema } from "@/lib/validators/common";
import { z } from "zod";
import {
  getAssetService,
  getAssetLotService,
  getAssetPriceService,
  getPortfolioService,
  getFinancialDataService,
} from "@/lib/api/services";
import { getDb } from "@/lib/db";
import { triggerSymbolBackfill } from "@/lib/services/symbol-backfill";
import { ok, err } from "@/lib/mcp/response";

export function registerAssetTools(server: McpServer): void {
  server.registerTool(
    "create_asset",
    {
      description:
        "Create a new asset to track in your portfolio. " +
        "The `currency` field is always an ISO 4217 fiat code (USD, EUR, …) — the currency the asset is " +
        "denominated/priced in — never a crypto ticker or stock symbol. " +
        "Deposits (bank/savings/wallets): set currency to the account's currency; no symbolMap needed. " +
        "Investments: set currency to the listing currency; call search_symbol first and pass the result as symbolMap. " +
        "Crypto: ASK the user which fiat currency to denominate the holding in (default to the base currency); " +
        "the crypto ticker goes in symbolMap, never in currency.",
      inputSchema: CreateAssetSchema,
    },
    (input) => {
      const asset = getAssetService().create(input);
      if (asset.symbolMap) {
        triggerSymbolBackfill(getDb(), getFinancialDataService(), asset);
      }
      return ok(asset);
    }
  );

  server.registerTool(
    "list_assets",
    {
      description:
        "List all assets with current holdings, cost basis, current value, and P&L. " +
        "currentValue is null if no price has been recorded (deposits assume 1 unit = 1 unit of the asset's currency). " +
        "pnl = currentValue - costBasis.",
      inputSchema: z.object({}),
    },
    () => ok(getAssetService().list())
  );

  server.registerTool(
    "get_asset",
    {
      description:
        "Get a single asset with full metrics (holdings, cost basis, current value, P&L).",
      inputSchema: IdSchema,
    },
    (input) => {
      const asset = getAssetService().getById(input.id);
      if (!asset) return err(`Asset ${input.id} not found`);
      return ok(asset);
    }
  );

  server.registerTool(
    "update_asset",
    {
      description:
        "Update asset metadata (name, icon, color, notes, symbolMap). " +
        "Does not affect holdings or prices — use buy_asset/sell_asset for that.",
      inputSchema: IdSchema.merge(UpdateAssetSchema),
    },
    (input) => {
      const { id, ...rest } = input;
      const asset = getAssetService().update(id, rest);
      if (!asset) return err(`Asset ${id} not found`);
      if (rest.symbolMap) {
        triggerSymbolBackfill(getDb(), getFinancialDataService(), asset);
      }
      return ok(asset);
    }
  );

  server.registerTool(
    "delete_asset",
    {
      description:
        "Delete an asset and all its holdings and price history. " +
        "Related transactions are kept. Use list_transactions to find them if needed.",
      inputSchema: IdSchema,
    },
    (input) => {
      const deleted = getAssetService().delete(input.id);
      if (!deleted) return err(`Asset ${input.id} not found`);
      return ok({ success: true });
    }
  );

  server.registerTool(
    "buy_asset",
    {
      description:
        "Record an asset purchase, or a deposit/contribution into a 'deposit' asset (e.g. money received into a savings account). " +
        "Kinti handles the cash-side bookkeeping automatically. " +
        "For ANY 'deposit' asset, regardless of currency: pricePerUnit=1 and quantity=the amount in the asset's currency. " +
        "For investments/crypto/other: pricePerUnit is the per-unit price in the asset's native currency, quantity is the number of units bought.",
      inputSchema: IdSchema.merge(BuyAssetSchema),
    },
    async (input) => {
      const { id, ...rest } = input;
      try {
        return ok(await getAssetLotService().buy(id, rest));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Buy failed";
        return err(msg);
      }
    }
  );

  server.registerTool(
    "sell_asset",
    {
      description:
        "Record an asset sale, or a withdrawal from a 'deposit' asset (e.g. money paid out of a savings account). " +
        "Kinti handles the cash-side bookkeeping automatically. " +
        "Errors if quantity exceeds current holdings. " +
        "Same conventions as buy_asset: deposits use pricePerUnit=1 with quantity=the amount; " +
        "investments/crypto use the per-unit price in the asset's native currency.",
      inputSchema: IdSchema.merge(SellAssetSchema),
    },
    async (input) => {
      const { id, ...rest } = input;
      try {
        return ok(await getAssetLotService().sell(id, rest));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Sell failed";
        return err(msg);
      }
    }
  );

  server.registerTool(
    "record_price",
    {
      description:
        "Record a current price snapshot for an asset. " +
        "Use get_price first to fetch the latest market price, then call this to persist it. " +
        "Updates the asset's current value and P&L.",
      inputSchema: IdSchema.merge(RecordPriceSchema),
    },
    (input) => {
      const { id, ...rest } = input;
      try {
        return ok(getAssetPriceService().record(id, rest));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Record failed";
        return err(msg);
      }
    }
  );

  server.registerTool(
    "get_portfolio",
    {
      description:
        "Get the full portfolio: all assets with holdings + P&L, cash balance, total asset value, " +
        "net worth, and allocation percentages. " +
        "For detailed analysis see: get_allocation, get_asset_performance, get_net_worth_history, " +
        "get_realized_pnl, get_currency_exposure, get_asset_history.",
      inputSchema: z.object({}),
    },
    () => ok(getPortfolioService().getPortfolio())
  );

  server.registerTool(
    "list_lots",
    {
      description:
        "List all buy/sell events (lots) for an asset, ordered newest first. " +
        "Positive quantity = buy or deposit, negative quantity = sell or withdrawal.",
      inputSchema: IdSchema,
    },
    (input) => {
      try {
        return ok(getAssetLotService().listLots(input.id));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "List lots failed";
        return err(msg);
      }
    }
  );
}
