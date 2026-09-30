import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SetBudgetSchema,
  GetBudgetStatusSchema,
  ResetBudgetsSchema,
  DeleteBudgetSchema,
} from "@/lib/validators/budgets";
import { getBudgetService } from "@/lib/api/services";
import { ok } from "@/lib/mcp/response";

export function registerBudgetTools(server: McpServer): void {
  server.registerTool(
    "set_budget",
    {
      description: "Set or update a monthly budget for a category.",
      inputSchema: SetBudgetSchema,
    },
    (input) => ok(getBudgetService().set(input))
  );

  server.registerTool(
    "get_budget_status",
    {
      description:
        "Current spend vs budget for all budgeted categories in a given month. " +
        "Returns amounts, percentages, and over/under status. " +
        "'inheritedFrom' in the response indicates which month the budgets were copied from (null = own budgets).",
      inputSchema: GetBudgetStatusSchema,
    },
    (input) => ok(getBudgetService().getForMonth(input))
  );

  server.registerTool(
    "reset_budgets",
    {
      description: "Undo all manual budget edits for a month, reverting to inherited defaults.",
      inputSchema: ResetBudgetsSchema,
    },
    (input) => {
      getBudgetService().resetToInherited(input.month);
      return ok({ success: true });
    }
  );

  server.registerTool(
    "delete_budget",
    {
      description: "Remove a budget for a specific category and month.",
      inputSchema: DeleteBudgetSchema,
    },
    (input) => ok({ deleted: getBudgetService().delete(input.categoryId, input.month) })
  );
}
