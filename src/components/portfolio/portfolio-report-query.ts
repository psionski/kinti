import type {
  AssetPerformanceParams,
  NetWorthParams,
  RealizedPnlParams,
} from "@/lib/queries/portfolio";
import type { AssetPerformanceItem, Window } from "@/lib/validators/portfolio-reports";

// Shared by the portfolio report's server component (which seeds the report
// for the window it opens on) and its client component (which fetches every
// other window), so both derive the same queries — and so the same cache keys.

export const PORTFOLIO_WINDOWS = ["3m", "6m", "12m", "ytd", "all"] as const satisfies Window[];

/** The window the report opens on. */
export const DEFAULT_PORTFOLIO_WINDOW: Window = "6m";

/** The request behind each section of the report that takes parameters. */
export interface PortfolioReportParams {
  netWorth: NetWorthParams;
  performance: AssetPerformanceParams;
  realizedPnl: RealizedPnlParams;
}

/**
 * Only the net-worth chart follows the window, one point per month; the
 * performance table and P&L cover each asset's whole history.
 */
export function portfolioReportParams(window: Window): PortfolioReportParams {
  return {
    netWorth: { window, interval: "monthly" },
    performance: {},
    realizedPnl: {},
  };
}

/**
 * Unrealized P&L of the open positions, in the base currency. A position with
 * no base value (no FX rate cached for its currency) is left out — a partial
 * total beats a wrong-unit one — so when every position is like that there is
 * no figure (`null`). No open positions at all is a P&L of zero.
 */
export function unrealizedPnl(performance: AssetPerformanceItem[]): number | null {
  const known = performance.flatMap((item) => (item.pnlBase === null ? [] : [item.pnlBase]));
  if (performance.length > 0 && known.length === 0) return null;
  return known.reduce((sum, pnl) => sum + pnl, 0);
}
