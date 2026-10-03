// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  DEFAULT_PORTFOLIO_WINDOW,
  PORTFOLIO_WINDOWS,
  portfolioReportParams,
  unrealizedPnl,
} from "@/components/portfolio/portfolio-report-query";
import { searchParamsToObject, toSearchParams } from "@/lib/api/search-params";
import {
  AssetPerformanceQuerySchema,
  NetWorthQuerySchema,
  RealizedPnlQuerySchema,
  type AssetPerformanceItem,
} from "@/lib/validators/portfolio-reports";

function position(pnlBase: number | null): AssetPerformanceItem {
  return {
    assetId: 1,
    name: "ETF",
    type: "investment",
    currency: "EUR",
    costBasis: 100,
    costBasisBase: 100,
    currentValue: 100 + (pnlBase ?? 0),
    currentValueBase: pnlBase === null ? null : 100 + pnlBase,
    pnl: pnlBase ?? 0,
    pnlBase,
    pricePnlBase: pnlBase,
    fxPnlBase: pnlBase === null ? null : 0,
    pnlPct: pnlBase ?? 0,
    annualizedReturn: null,
    daysHeld: 30,
  };
}

describe("portfolioReportParams", () => {
  it("opens on a window the report offers", () => {
    expect(PORTFOLIO_WINDOWS).toContain(DEFAULT_PORTFOLIO_WINDOW);
  });

  it("charts net worth monthly over the window, and everything else over all time", () => {
    expect(portfolioReportParams("ytd")).toEqual({
      netWorth: { window: "ytd", interval: "monthly" },
      performance: {},
      realizedPnl: {},
    });
  });

  // The server seeds each section with `Schema.parse(params)`; the route
  // answers the client with the schema applied to the decoded query string.
  it.each(PORTFOLIO_WINDOWS)("reaches each route for %s exactly as the server seeds it", (w) => {
    const params = portfolioReportParams(w);
    const sections = [
      [NetWorthQuerySchema, params.netWorth],
      [AssetPerformanceQuerySchema, params.performance],
      [RealizedPnlQuerySchema, params.realizedPnl],
    ] as const;

    for (const [schema, sectionParams] of sections) {
      const wire = searchParamsToObject(toSearchParams(sectionParams), schema);
      expect(schema.parse(wire)).toEqual(schema.parse(sectionParams));
    }
  });
});

describe("unrealizedPnl", () => {
  it("adds up the open positions' P&L in the base currency", () => {
    expect(unrealizedPnl([position(25), position(-10)])).toBe(15);
  });

  it("leaves out a position with no base value", () => {
    expect(unrealizedPnl([position(25), position(null)])).toBe(25);
  });

  it("has no figure when no position has a base value", () => {
    expect(unrealizedPnl([position(null), position(null)])).toBeNull();
  });

  it("is zero with no open positions", () => {
    expect(unrealizedPnl([])).toBe(0);
  });
});
