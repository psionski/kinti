import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CreateOpeningLotSchema,
  SetOpeningCashBalanceSchema,
  AddOpeningAssetSchema,
} from "@/lib/validators/assets";
import {
  getTransactionService,
  getAssetService,
  getAssetLotService,
  getFinancialDataService,
} from "@/lib/api/services";
import { getDb } from "@/lib/db";
import { triggerSymbolBackfill } from "@/lib/services/symbol-backfill";
import { isoToday } from "@/lib/date-ranges";
import { transactions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { ok, err } from "@/lib/mcp/response";

const OPENING_BALANCE_DESC = "Opening balance";

export function registerOnboardingTools(server: McpServer): void {
  server.registerTool(
    "set_opening_cash_balance",
    {
      description:
        "Set the user's initial cash (checking account) balance. " +
        "Idempotent: if an opening balance already exists, updates the amount and date. " +
        "This balance is included in net worth but excluded from income/expense reports. " +
        "Always denominated in the configured base currency.",
      inputSchema: SetOpeningCashBalanceSchema,
    },
    async (input) => {
      const db = getDb();
      const date = input.date ?? isoToday();

      // Find existing opening balance transaction
      const existing = db
        .select()
        .from(transactions)
        .where(
          and(eq(transactions.type, "transfer"), eq(transactions.description, OPENING_BALANCE_DESC))
        )
        .get();

      if (existing) {
        // Update via the service so amount_base is recomputed if amount changed.
        const updated = await getTransactionService().update(existing.id, {
          amount: input.amount,
          date,
        });
        if (!updated) throw new Error("Failed to update opening balance");
        return ok({
          action: "updated",
          transaction: { id: updated.id, amount: updated.amount, date: updated.date },
        });
      }

      // Create new
      const tx = await getTransactionService().create({
        amount: input.amount,
        type: "transfer",
        description: OPENING_BALANCE_DESC,
        date,
      });
      return ok({
        action: "created",
        transaction: { id: tx.id, amount: tx.amount, date: tx.date },
      });
    }
  );

  server.registerTool(
    "add_opening_asset",
    {
      description:
        "Add an existing asset holding during onboarding — 'I already own this.' " +
        "For ANY 'deposit' asset (savings, bank, exchange wallet), regardless of currency: " +
        "pricePerUnit=1 and quantity=the amount in the asset's currency. " +
        "For investments/crypto: call search_symbol first to get the symbolMap. " +
        "Reminder: `currency` is always an ISO 4217 fiat code (USD, EUR, …) — never a crypto ticker. " +
        "For crypto, ASK the user which fiat currency to denominate it in (default to the base currency).",
      inputSchema: AddOpeningAssetSchema,
    },
    async (input) => {
      try {
        const date = input.date ?? isoToday();

        // Determine pricePerUnit. Don't round to integer — that destroys
        // sub-currency precision (e.g. 10 shares × $123.45 → 1234.5 / 10 →
        // Math.round(123.45) = 123, losing $4.50 of cost basis).
        // Deposits are 1-unit-per-currency-unit by definition; the quantity
        // already carries the amount, so default to 1 instead of 0.
        let pricePerUnit: number;
        if (input.costBasisTotal !== undefined) {
          pricePerUnit = input.costBasisTotal / input.quantity;
        } else if (input.pricePerUnit !== undefined) {
          pricePerUnit = input.pricePerUnit;
        } else if (input.type === "deposit") {
          pricePerUnit = 1;
        } else {
          pricePerUnit = 0;
        }

        // Create the asset (currency defaults to base in AssetService.create
        // when omitted — Zod can't default to a runtime value).
        const asset = getAssetService().create({
          name: input.name,
          type: input.type,
          currency: input.currency,
          symbolMap: input.symbolMap,
          icon: input.icon,
          color: input.color,
          notes: input.notes,
        });

        // Trigger symbol backfill if symbolMap provided
        if (asset.symbolMap) {
          triggerSymbolBackfill(getDb(), getFinancialDataService(), asset);
        }

        // Create opening lot (no linked transaction)
        const lotInput = CreateOpeningLotSchema.parse({
          quantity: input.quantity,
          pricePerUnit,
          date,
          notes: input.notes,
        });
        const lot = await getAssetLotService().createOpeningLot(asset.id, lotInput);

        return ok({ asset, lot });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to add opening asset";
        return err(msg);
      }
    }
  );
}
