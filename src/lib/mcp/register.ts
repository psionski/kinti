import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTransactionTools } from "./tools/transactions";
import { registerCategoryTools } from "./tools/categories";
import { registerReportTools } from "./tools/reports";
import { registerBudgetTools } from "./tools/budgets";
import { registerRecurringTools } from "./tools/recurring";
import { registerQueryTool } from "./tools/query";
import { registerReceiptTools } from "./tools/receipts";
import { registerFinancialTools } from "./tools/financial";
import { registerAssetTools } from "./tools/assets";
import { registerPortfolioReportTools } from "./tools/portfolio-reports";
import { registerSettingsTools } from "./tools/settings";
import { registerBackupTools } from "./tools/backups";
import { registerOnboardingTools } from "./tools/onboarding";
import { registerSampleDataTools } from "./tools/sample-data";
import { INSTRUCTIONS } from "./instructions";
import { mcpLogger } from "@/lib/logger";

type RegisterTool = McpServer["registerTool"];
type RegisterToolArgs = Parameters<RegisterTool>;
type ToolConfig = RegisterToolArgs[1];
type ToolCallbackFn = RegisterToolArgs[2];

/**
 * Wrap server.registerTool so every tool handler is instrumented with
 * timing and structured logging — no changes needed in individual tool files.
 */
function instrumentRegisterTool(server: McpServer): void {
  const original: RegisterTool = server.registerTool.bind(server);

  const instrumented = (name: string, config: ToolConfig, cb: ToolCallbackFn) => {
    const rawCb = cb as (...args: unknown[]) => unknown;
    const wrappedCb = async (...handlerArgs: unknown[]): Promise<unknown> => {
      const start = performance.now();
      try {
        const result = await rawCb(...handlerArgs);
        const durationMs = Math.round(performance.now() - start);
        mcpLogger.info({ tool: name, durationMs }, "MCP tool executed");
        return result;
      } catch (err) {
        const durationMs = Math.round(performance.now() - start);
        mcpLogger.error({ tool: name, durationMs, err }, "MCP tool failed");
        throw err;
      }
    };
    return original(name, config, wrappedCb as ToolCallbackFn);
  };

  server.registerTool = instrumented as RegisterTool;
}

export function registerTools(server: McpServer): void {
  instrumentRegisterTool(server);

  server.registerTool(
    "get_started",
    {
      description:
        "IMPORTANT: Call this tool first to learn what Kinti is, how to use it, " +
        "and the conventions all other tools follow (currency format, date handling, onboarding flow).",
      inputSchema: {},
    },
    () => ({
      content: [{ type: "text" as const, text: INSTRUCTIONS }],
    })
  );

  registerTransactionTools(server);
  registerCategoryTools(server);
  registerReportTools(server);
  registerBudgetTools(server);
  registerRecurringTools(server);
  registerReceiptTools(server);
  registerQueryTool(server);
  registerFinancialTools(server);
  registerAssetTools(server);
  registerPortfolioReportTools(server);
  registerSettingsTools(server);
  registerBackupTools(server);
  registerSampleDataTools(server);
  registerOnboardingTools(server);
}
