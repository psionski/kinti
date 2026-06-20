import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SetTimezoneSchema, SetBaseCurrencySchema } from "@/lib/validators/settings";
import { getSettingsService } from "@/lib/api/services";
import { setUserTimezone } from "@/lib/date-ranges";
import { setBaseCurrencyCache } from "@/lib/format";
import { ok, err } from "@/lib/mcp/response";

export function registerSettingsTools(server: McpServer): void {
  server.registerTool(
    "get_timezone",
    {
      description:
        "Get the user's configured timezone. Returns null if not yet configured. " +
        "A null value means the app has not been set up — ask the user for their timezone " +
        "and call set_timezone before proceeding.",
      inputSchema: {},
    },
    () => {
      const timezone = getSettingsService().getTimezone();
      return ok({ timezone });
    }
  );

  server.registerTool(
    "set_timezone",
    {
      description:
        "Set the user's timezone. Affects how 'today' and 'this month' are computed throughout the app.",
      inputSchema: SetTimezoneSchema,
    },
    (input) => {
      getSettingsService().setTimezone(input.timezone);
      setUserTimezone(input.timezone);
      return ok({ timezone: input.timezone });
    }
  );

  server.registerTool(
    "get_base_currency",
    {
      description:
        "Get the user's configured base currency (ISO 4217). Returns null if not yet " +
        "configured. A null value means the app has not been set up — ask the user for their " +
        "preferred base currency and call set_base_currency before any opening-balance tools " +
        "(set_opening_cash_balance, add_opening_asset). " +
        "All portfolio-level valuations and report totals are denominated in the base currency.",
      inputSchema: {},
    },
    () => {
      const currency = getSettingsService().getBaseCurrency();
      return ok({ currency });
    }
  );

  server.registerTool(
    "set_base_currency",
    {
      description:
        "Set the base currency. IMMUTABLE — can only be set once. All transactions, budgets, " +
        "cash balances, and report totals roll up into this currency. Migrating between base " +
        "currencies later requires a fresh database. Confirm the choice with the user before " +
        "calling.",
      inputSchema: SetBaseCurrencySchema,
    },
    (input) => {
      try {
        getSettingsService().setBaseCurrency(input.currency);
        setBaseCurrencyCache(input.currency);
        return ok({ currency: input.currency });
      } catch (e) {
        return err(e instanceof Error ? e.message : "Failed to set base currency");
      }
    }
  );
}
