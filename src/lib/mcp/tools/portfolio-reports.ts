import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPortfolioReportService } from "@/lib/api/services";
import { IdSchema } from "@/lib/validators/common";
import {
  WindowSchema,
  IntervalSchema,
  AssetPerformanceQuerySchema,
  RealizedPnlQuerySchema,
} from "@/lib/validators/portfolio-reports";
import { ok, err } from "@/lib/mcp/response";

export function registerPortfolioReportTools(server: McpServer): void {
  server.registerTool(
    "get_net_worth_history",
    {
      description: "Net worth time series showing cash + asset values over time.",
      inputSchema: z.object({
        window: WindowSchema,
        interval: IntervalSchema,
      }),
    },
    (input) => ok(getPortfolioReportService().getNetWorthTimeSeries(input.window, input.interval))
  );

  server.registerTool(
    "get_asset_performance",
    {
      description:
        "All assets ranked by performance. Returns cost basis, current value, P&L (absolute + %), " +
        "annualized return, and days held per asset. Sorted by P&L descending.",
      inputSchema: AssetPerformanceQuerySchema,
    },
    (input) => ok(getPortfolioReportService().getAssetPerformance(input.from, input.to))
  );

  server.registerTool(
    "get_allocation",
    {
      description:
        "Current portfolio allocation breakdown by asset and by asset type " +
        "(deposit/investment/crypto/other). Returns percentages of total portfolio value.",
      inputSchema: z.object({}),
    },
    () => ok(getPortfolioReportService().getAllocation())
  );

  server.registerTool(
    "get_currency_exposure",
    {
      description:
        "Net worth breakdown by currency. Shows how much of your portfolio is in each currency " +
        "with absolute values and percentages. " +
        "Note: exposure is based on each asset's denomination currency, not the underlying holdings. " +
        "A global ETF denominated in EUR will show as EUR exposure.",
      inputSchema: z.object({}),
    },
    () => ok(getPortfolioReportService().getCurrencyExposure())
  );

  server.registerTool(
    "get_realized_pnl",
    {
      description:
        "Realized P&L from completed asset sells (FIFO). Returns per-asset breakdown with " +
        "total sold, proceeds, cost basis, and realized P&L.",
      inputSchema: RealizedPnlQuerySchema,
    },
    (input) => ok(getPortfolioReportService().getRealizedPnL(input.from, input.to))
  );

  server.registerTool(
    "get_asset_history",
    {
      description:
        "Combined lot timeline + price/value chart for a single asset. " +
        "Shows all buy/sell events with running quantity, plus weekly price and value data points.",
      inputSchema: IdSchema.extend({ window: WindowSchema }),
    },
    (input) => {
      const result = getPortfolioReportService().getAssetHistory(input.id, input.window);
      if (!result) return err(`Asset ${input.id} not found`);
      return ok(result);
    }
  );
}
