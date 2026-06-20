import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CreateRecurringSchema, UpdateRecurringSchema } from "@/lib/validators/recurring";
import { IdSchema } from "@/lib/validators/common";
import { getRecurringService } from "@/lib/api/services";
import { ok } from "@/lib/mcp/response";

export function registerRecurringTools(server: McpServer): void {
  server.registerTool(
    "create_recurring",
    {
      description:
        "Create a recurring transaction template. " +
        "If startDate is today or in the past, all occurrences up to today are generated immediately. " +
        "Future startDate: no transactions created until the date arrives. " +
        "Use list_categories to find valid categoryId values.",
      inputSchema: CreateRecurringSchema,
    },
    async (input) => ok(await getRecurringService().create(input))
  );

  server.registerTool(
    "get_recurring",
    {
      description: "Get a single recurring transaction template by ID with next occurrence date.",
      inputSchema: IdSchema,
    },
    ({ id }) => {
      const result = getRecurringService().getById(id);
      if (!result) throw new Error(`Recurring template ${id} not found`);
      return ok(result);
    }
  );

  server.registerTool(
    "list_recurring",
    {
      description: "List all recurring transaction templates with next occurrence date and status.",
      inputSchema: z.object({}),
    },
    () => ok(getRecurringService().list())
  );

  server.registerTool(
    "update_recurring",
    {
      description: "Modify a recurring template. Use isActive: false to pause it.",
      inputSchema: IdSchema.merge(UpdateRecurringSchema),
    },
    ({ id, ...updates }) => {
      const result = getRecurringService().update(id, updates);
      if (!result) throw new Error(`Recurring template ${id} not found`);
      return ok(result);
    }
  );

  server.registerTool(
    "delete_recurring",
    {
      description:
        "Delete a recurring template. " +
        "Already-generated transactions are kept as normal transaction history.",
      inputSchema: IdSchema,
    },
    ({ id }) => {
      const deleted = getRecurringService().delete(id);
      if (!deleted) throw new Error(`Recurring template ${id} not found`);
      return ok({ deleted: true });
    }
  );

  server.registerTool(
    "generate_pending_recurring",
    {
      description:
        "Manually trigger generation of pending recurring transactions up to today. " +
        "Useful if the server was offline and missed the daily cron job. " +
        "Idempotent — will not create duplicates. Returns the number of transactions created.",
      inputSchema: z.object({}),
    },
    async () => {
      const count = await getRecurringService().generatePending();
      return ok({ generated: count });
    }
  );
}
