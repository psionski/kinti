import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  SpendingSummarySchema,
  CategoryStatsSchema,
  TrendsSchema,
  CategoryTrendsSchema,
  TopMerchantsSchema,
  NetIncomeSchema,
} from "@/lib/validators/reports";
import { getReportService } from "@/lib/api/services";
import { ok } from "@/lib/mcp/response";

export function registerReportTools(server: McpServer): void {
  server.registerTool(
    "get_spending_summary",
    {
      description:
        "Total spend for a period, grouped by category, month, or merchant. " +
        "Best for comparing periods or viewing spending by merchant. " +
        "For per-category breakdowns with hierarchy rollups and percentages, use get_category_stats instead. " +
        "Optionally compare against a second period by supplying compareDateFrom and compareDateTo.",
      inputSchema: SpendingSummarySchema,
    },
    (input) => ok(getReportService().spendingSummary(input))
  );

  server.registerTool(
    "get_category_stats",
    {
      description:
        "Per-category spending stats with hierarchy rollups, percentages, and category color/icon. " +
        "Best for detailed per-category breakdowns. " +
        "For flexible grouping (by merchant/month) or period comparisons, use get_spending_summary instead. " +
        "Use get_budget_status for budget tracking.",
      inputSchema: CategoryStatsSchema,
    },
    (input) => ok(getReportService().getCategoryStats(input))
  );

  server.registerTool(
    "get_trends",
    {
      description:
        "Monthly totals time series. Returns one data point per month with total amount and transaction count.",
      inputSchema: TrendsSchema,
    },
    (input) => ok(getReportService().trends(input))
  );

  server.registerTool(
    "get_category_trends",
    {
      description:
        "Monthly spend broken down by top-level category over a date range, for a stacked " +
        "time series. Spend is bucketed by calendar month and each transaction is rolled up " +
        "into its root category. Series are ordered by variance ascending (most stable " +
        "categories first), each with the per-month values aligned to the returned months array.",
      inputSchema: CategoryTrendsSchema,
    },
    (input) => ok(getReportService().categoryTrends(input))
  );

  server.registerTool(
    "get_net_income",
    {
      description:
        "Profit & Loss: total income minus total expenses. " +
        "Does not include money moved into or out of assets (savings, investments). " +
        "For the actual checking account balance, use get_cash_balance instead.",
      inputSchema: NetIncomeSchema,
    },
    (input) => ok(getReportService().netIncome(input))
  );

  server.registerTool(
    "get_cash_balance",
    {
      description:
        "Current checking account balance: income minus expenses, adjusted for money moved into and out of assets. " +
        "For a Profit & Loss view (income vs expenses only), use get_net_income instead.",
      inputSchema: z.object({}),
    },
    () => ok(getReportService().cashBalance())
  );

  server.registerTool(
    "get_top_merchants",
    {
      description: "Highest-spend merchants with transaction counts and average amounts.",
      inputSchema: TopMerchantsSchema,
    },
    (input) => ok(getReportService().topMerchants(input))
  );
}
