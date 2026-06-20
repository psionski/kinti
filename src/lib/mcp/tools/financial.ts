import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  GetPriceSchema,
  ConvertCurrencySchema,
  SetApiKeySchema,
  SearchSymbolQuerySchema,
} from "@/lib/validators/financial";

import { getFinancialDataService, getSettingsService } from "@/lib/api/services";
import { getProviderStatuses, getUnconfiguredProviders } from "@/lib/providers/registry";
import { getBaseCurrency } from "@/lib/format";
import { ok, err } from "@/lib/mcp/response";

function unconfiguredProviderHint(): string | null {
  const missing = getUnconfiguredProviders(getSettingsService());
  if (missing.length === 0) return null;
  return `Providers [${missing.join(", ")}] are not configured — use set_api_key to add API keys if this symbol requires them.`;
}

export function registerFinancialTools(server: McpServer): void {
  server.registerTool(
    "convert_currency",
    {
      description:
        "Convert an amount between two ISO 4217 currencies using live exchange rates. " +
        "Routes through the default FX provider chain (Frankfurter then fawazahmed0) — no " +
        "symbolMap needed for transaction-style currency conversions.",
      inputSchema: ConvertCurrencySchema,
    },
    async (input) => {
      const result = await getFinancialDataService().convert(
        input.amount,
        input.from,
        input.to,
        undefined,
        input.date
      );
      if (!result) return err(`No exchange rate available for ${input.from}→${input.to}`);
      return ok(result);
    }
  );

  server.registerTool(
    "get_price",
    {
      description:
        "Look up a price for a currency pair, crypto, stock, or ETF. " +
        "Requires a symbolMap specifying which providers to use " +
        "(e.g. { coingecko: 'bitcoin' } or { frankfurter: 'USD' }). " +
        "Use search_symbol to find the correct provider→symbol mapping.",
      inputSchema: GetPriceSchema,
    },
    async (input) => {
      const svc = getFinancialDataService();
      // Default to the configured base currency when the AI omits currency.
      // Done at the boundary because Zod can't default to a runtime value.
      const targetCurrency = input.currency ?? getBaseCurrency();
      const result = await svc.getPrice(input.symbolMap, targetCurrency, input.date);
      if (!result) {
        const symbols = Object.values(input.symbolMap).filter(Boolean).join(", ");
        const msg = `No price available for ${symbols}/${targetCurrency}`;
        const hint = unconfiguredProviderHint();
        return err(hint ? `${msg}. ${hint}` : msg);
      }
      return ok(result);
    }
  );

  server.registerTool(
    "list_providers",
    {
      description:
        "List all configured financial data providers with their status. " +
        "Shows which providers are active, whether an API key is set, and health status.",
      inputSchema: {},
    },
    async () => {
      const statuses = await getProviderStatuses(getSettingsService());
      return ok(statuses);
    }
  );

  server.registerTool(
    "search_symbol",
    {
      description:
        "Search for a market symbol by name. Use before creating/updating an asset or calling get_price. " +
        "Pass the best match as symbolMap: { [result.provider]: result.symbol } to create_asset or update_asset " +
        "for automatic price tracking. " +
        "Stock/ETF results often include a `currency` field — that's the listing currency, use it to fill " +
        "the asset's `currency` field directly. " +
        "Crypto results never include a currency: cryptocurrencies aren't denominated in any single fiat — " +
        "the same coin can be quoted against any currency the user chooses. ASK the user which fiat to track " +
        "the holding in (the base currency is usually the right default), then put that in the asset's `currency` field. " +
        "For exchange rates, search the currency code (e.g. 'USD'). " +
        "If no results, you can still create the asset without symbolMap and use record_price manually.",
      inputSchema: SearchSymbolQuerySchema,
    },
    async (input) => {
      const svc = getFinancialDataService();
      const results = await svc.searchSymbol(input.query, input.assetType);
      if (results.length === 0) {
        const msg = `No symbols found for "${input.query}"`;
        const hint = unconfiguredProviderHint();
        return err(hint ? `${msg}. ${hint}` : msg);
      }
      return ok(results);
    }
  );

  server.registerTool(
    "set_api_key",
    {
      description: "Configure an API key for a financial data provider.",
      inputSchema: SetApiKeySchema,
    },
    (input) => {
      getFinancialDataService().setApiKey(input.provider, input.key);
      return ok({ success: true, provider: input.provider });
    }
  );
}
