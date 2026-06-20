import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CreateTransactionSchema,
  CreateTransactionsBatchSchema,
  UpdateTransactionSchema,
  UpdateTransactionsBatchSchema,
  ListTransactionsSchema,
} from "@/lib/validators/transactions";
import { IdSchema } from "@/lib/validators/common";
import { getTransactionService } from "@/lib/api/services";
import { ok } from "@/lib/mcp/response";

export function registerTransactionTools(server: McpServer): void {
  server.registerTool(
    "create_transaction",
    {
      description:
        "Add a single income or expense transaction. Use list_categories to find valid categoryId values. " +
        "Optional currency field accepts any ISO 4217 code; defaults to the configured base currency. " +
        "If the user pays FROM or receives money INTO a specific account/wallet, also call sell_asset/buy_asset " +
        "on that account so its balance stays accurate (see get_started for the full flow).",
      inputSchema: CreateTransactionSchema,
    },
    async (input) => ok(await getTransactionService().create(input))
  );

  server.registerTool(
    "create_transactions",
    {
      description:
        "Batch-add multiple income/expense transactions in one call (e.g. line items from a receipt). " +
        "Use list_categories to find valid categoryId values. " +
        "Optionally link all to an uploaded receipt via receiptId. " +
        "Each line item can specify its own currency; defaults to the configured base currency. " +
        "For transactions tied to a specific account/wallet, use create_transaction + buy_asset/sell_asset " +
        "instead so the account balance updates too.",
      inputSchema: CreateTransactionsBatchSchema,
    },
    async (input) => ok(await getTransactionService().createBatch(input))
  );

  server.registerTool(
    "update_transaction",
    {
      description:
        "Update fields on an existing transaction by ID. Only supplied fields are changed. " +
        "Updating amount, currency, or date triggers a fresh FX lookup to recompute amount_base.",
      inputSchema: IdSchema.merge(UpdateTransactionSchema),
    },
    async ({ id, ...updates }) => {
      const svc = getTransactionService();
      const result = await svc.update(id, updates);
      if (!result) throw new Error(`Transaction ${id} not found`);
      return ok(result);
    }
  );

  server.registerTool(
    "delete_transaction",
    {
      description:
        "Delete one or more transactions. Pass a single id or an array of ids for bulk delete.",
      inputSchema: z.object({
        id: z
          .union([
            z.number().int().positive(),
            z.array(z.number().int().positive()).min(1).max(200),
          ])
          .describe("Single transaction ID or array of IDs"),
      }),
    },
    ({ id }) => {
      const svc = getTransactionService();
      if (Array.isArray(id)) {
        const count = svc.deleteBatch(id);
        return ok({ deleted: count });
      }
      const deleted = svc.delete(id);
      if (!deleted) throw new Error(`Transaction ${id} not found`);
      return ok({ deleted: 1 });
    }
  );

  server.registerTool(
    "get_transaction",
    {
      description: "Get a single transaction by ID with all fields.",
      inputSchema: IdSchema,
    },
    ({ id }) => {
      const result = getTransactionService().getById(id);
      if (!result) throw new Error(`Transaction ${id} not found`);
      return ok(result);
    }
  );

  server.registerTool(
    "list_transactions",
    {
      description:
        "List transactions with optional filters: date range, category, amount range, " +
        "merchant, full-text search, tags, type. Sorted by date desc by default. " +
        "Pass categoryId: null to filter for uncategorized transactions only.",
      inputSchema: ListTransactionsSchema,
    },
    (input) => ok(getTransactionService().list(input))
  );

  server.registerTool(
    "batch_update_transactions",
    {
      description:
        "Update multiple transactions in one call. Each entry must have an id plus any fields to change. " +
        "Silently skips IDs that don't exist. Returns the updated transactions.",
      inputSchema: UpdateTransactionsBatchSchema,
    },
    async (input) => ok(await getTransactionService().updateBatch(input))
  );

  server.registerTool(
    "list_tags",
    {
      description: "List all distinct tags used across transactions, sorted alphabetically.",
      inputSchema: z.object({}),
    },
    () => ok(getTransactionService().listTags())
  );
}
