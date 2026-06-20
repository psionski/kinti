import { Temporal } from "@js-temporal/polyfill";
import { isoDate } from "./rng";
import type { FxRateLookup } from "./fx-rates";
import type { TxInput } from "./transactions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AssetSeed {
  asset: {
    name: string;
    type: "deposit" | "investment" | "crypto";
    currency: string;
    symbolMap?: string;
    icon?: string;
    color?: string;
    notes?: string;
  };
  lots: Array<{
    quantity: number;
    pricePerUnit: number;
    date: string;
    description: string;
    notes?: string;
  }>;
  /**
   * Optional "current price" snapshot, recorded as an `asset_prices` row
   * dated today. For assets whose most recent lot is far in the past
   * (e.g. Apple Inc. — lots are placed at staggered FX-drift dates), the
   * lot price is no longer representative of the present value, so the
   * price-resolver's user-price step would otherwise return a stale lot
   * price. Setting this field injects a today snapshot so the asset
   * detail's "Current Value" card shows the actual current quote.
   * Skipped when undefined.
   */
  currentPrice?: number;
}

export interface MarketPriceSeed {
  symbol: string;
  price: number;
  currency: string;
  date: string;
  provider: string;
}

type MonthSpec = { year: number; month: number; lastDay: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateAt(m: MonthSpec, day: number): string {
  return isoDate(m.year, m.month, Math.min(day, m.lastDay));
}

/** Generate dates at `step`-day intervals from `from` through `to` (inclusive). */
function dateRange(from: string, to: string, step: number): string[] {
  const dates: string[] = [];
  let cur = Temporal.PlainDate.from(from);
  const end = Temporal.PlainDate.from(to);
  while (Temporal.PlainDate.compare(cur, end) <= 0) {
    dates.push(cur.toString());
    cur = cur.add({ days: step });
  }
  return dates;
}

/** Convert YYYY-MM-DD to days since epoch for interpolation math. */
function dateToDays(date: string): number {
  return Temporal.PlainDate.from(date)
    .since(Temporal.PlainDate.from("1970-01-01"), { largestUnit: "days" })
    .total("days");
}

/** Linear interpolation between sorted anchor points. */
function lerp(anchors: Array<{ date: string; value: number }>, target: string): number {
  const t = dateToDays(target);
  if (t <= dateToDays(anchors[0].date)) return anchors[0].value;
  const last = anchors[anchors.length - 1];
  if (t >= dateToDays(last.date)) return last.value;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = dateToDays(anchors[i].date);
    const b = dateToDays(anchors[i + 1].date);
    if (t >= a && t <= b) {
      const frac = (t - a) / (b - a);
      return anchors[i].value + frac * (anchors[i + 1].value - anchors[i].value);
    }
  }
  return last.value;
}

/** Map a fraction (0–1) of the seed period to a calendar date. */
function dateAtFrac(first: MonthSpec, last: MonthSpec, f: number): string {
  const start = Temporal.PlainDate.from(dateAt(first, 1));
  const end = Temporal.PlainDate.from(dateAt(last, last.lastDay));
  const days = start.until(end, { largestUnit: "days" }).total("days");
  return start.add({ days: Math.round(f * days) }).toString();
}

interface LotDef {
  monthIdx: number;
  day: number;
  quantity: number;
  pricePerUnit: number;
  description: string;
  notes?: string;
}

/**
 * Convert lot definitions to concrete lots. The day-of-month is clamped
 * by `dateAt` to the month's `lastDay` (which for the current month is
 * `today.day`), so a definition like `{monthIdx: 11, day: 28}` running on
 * the 9th of the month produces a day-9 lot rather than being silently
 * dropped. This keeps the lot count stable across seed runs regardless of
 * which day of the month the seed is regenerated.
 */
function buildLots(defs: LotDef[], months: MonthSpec[]): AssetSeed["lots"] {
  return defs
    .filter((d) => d.monthIdx < months.length)
    .map((d) => ({
      quantity: d.quantity,
      pricePerUnit: d.pricePerUnit,
      date: dateAt(months[d.monthIdx], d.day),
      description: d.description,
      notes: d.notes,
    }));
}

// ─── Generator ────────────────────────────────────────────────────────────────

/**
 * Generate portfolio seed data: three assets with buy/sell lots and weekly
 * market prices for chart resolution.
 *
 * Demonstrates:
 * - EUR deposit with monthly deposits & occasional withdrawals
 * - Crypto with buys on dips, sells near peaks (realized P&L), and volatile pricing
 * - Investment ETF with monthly DCA and steady growth
 * - Allocation across asset types (deposit / crypto / investment)
 * - Net worth time series with multiple asset classes
 */
export function generateAssets(months: MonthSpec[]): {
  assets: AssetSeed[];
  marketPrices: MarketPriceSeed[];
} {
  const n = months.length;
  const first = months[0];
  const last = months[n - 1];
  const frac = (f: number): string => dateAtFrac(first, last, f);

  // Weekly date points for market price data
  const priceDates = dateRange(dateAt(first, 1), dateAt(last, last.lastDay), 7);

  // ── Savings Account (EUR deposit) ──────────────────────────────────────────
  // €300/month deposits (after salary day 25), with occasional withdrawals

  const savingsLots: LotDef[] = [];
  for (let i = 0; i < n; i++) {
    savingsLots.push({
      monthIdx: i,
      day: 26,
      quantity: 300,
      pricePerUnit: 1,
      description: "Monthly savings",
    });
  }
  // Withdrawals at ~1/3 and ~2/3 through the period
  if (n >= 6) {
    savingsLots.push({
      monthIdx: Math.floor(n / 3),
      day: 10,
      quantity: -300,
      pricePerUnit: 1,
      description: "Withdrawal for holiday booking",
      notes: "Booked spring trip",
    });
    savingsLots.push({
      monthIdx: Math.floor((2 * n) / 3),
      day: 15,
      quantity: -500,
      pricePerUnit: 1,
      description: "Withdrawal for new laptop",
      notes: "Emergency purchase",
    });
  }

  const savings: AssetSeed = {
    asset: {
      name: "Savings Account",
      type: "deposit",
      currency: "EUR",
      icon: "🏦",
      color: "#34d399",
      notes: "Emergency fund and general savings",
    },
    lots: buildLots(savingsLots, months),
  };

  // ── Bitcoin (crypto) ───────────────────────────────────────────────────────
  // Overall uptrend €62k → €87k with two dips for buying opportunities.
  // Buy on dips, partial sells near peaks for realized P&L.

  const btcAnchors = [
    { date: frac(0.0), value: 62000 },
    { date: frac(0.05), value: 65000 },
    { date: frac(0.12), value: 60000 },
    { date: frac(0.2), value: 55000 }, // dip 1
    { date: frac(0.27), value: 59000 },
    { date: frac(0.33), value: 66000 },
    { date: frac(0.4), value: 72000 },
    { date: frac(0.47), value: 78000 }, // peak 1
    { date: frac(0.53), value: 75000 },
    { date: frac(0.6), value: 70000 },
    { date: frac(0.67), value: 68000 }, // dip 2
    { date: frac(0.73), value: 74000 },
    { date: frac(0.8), value: 80000 },
    { date: frac(0.87), value: 86000 },
    { date: frac(0.93), value: 90000 }, // peak 2
    { date: frac(1.0), value: 87000 },
  ];

  const btcMarket: MarketPriceSeed[] = priceDates.map((date) => ({
    symbol: "bitcoin",
    price: Math.round(lerp(btcAnchors, date)),
    currency: "EUR",
    date,
    provider: "coingecko",
  }));

  // Buy at dips, sell near peaks
  const btcBuy1 = 0;
  const btcBuy2 = Math.min(Math.floor(n * 0.2), n - 1);
  const btcSell1 = Math.min(Math.floor(n * 0.47), n - 1);
  const btcBuy3 = Math.min(Math.floor(n * 0.67), n - 1);
  const btcSell2 = Math.min(Math.floor(n * 0.93), n - 1);

  const bitcoin: AssetSeed = {
    asset: {
      name: "Bitcoin",
      type: "crypto",
      currency: "EUR",
      symbolMap: JSON.stringify({ coingecko: "bitcoin" }),
      icon: "₿",
      color: "#f7931a",
      notes: "Long-term BTC position, DCA strategy",
    },
    lots: buildLots(
      [
        {
          monthIdx: btcBuy1,
          day: 28,
          quantity: 0.005,
          pricePerUnit: 63000, // ~€63,000
          description: "Buy 0.005 BTC",
          notes: "Initial position",
        },
        {
          monthIdx: btcBuy2,
          day: 15,
          quantity: 0.008,
          pricePerUnit: 55000, // ~€55,000 — buying the dip
          description: "Buy 0.008 BTC (buying the dip)",
          notes: "DCA on first dip",
        },
        {
          monthIdx: btcSell1,
          day: 18,
          quantity: -0.005,
          pricePerUnit: 78000, // ~€78,000
          description: "Sell 0.005 BTC (take profit)",
          notes: "Partial profit at first peak",
        },
        {
          monthIdx: btcBuy3,
          day: 20,
          quantity: 0.006,
          pricePerUnit: 68000, // ~€68,000 — buying second dip
          description: "Buy 0.006 BTC",
          notes: "DCA on second dip",
        },
        {
          monthIdx: btcSell2,
          day: 12,
          quantity: -0.004,
          pricePerUnit: 89000, // ~€89,000
          description: "Sell 0.004 BTC (take profit)",
          notes: "Partial profit at second peak",
        },
      ],
      months
    ),
  };

  // ── MSCI World ETF (investment) ─────────────────────────────────────────────
  // Steady growth from ~€90 to ~€102 with a slight sine wobble for realism.
  // Monthly DCA of 1 share.

  const etfStart = 90.0;
  const etfEnd = 102.0;

  const etfAnchors: Array<{ date: string; value: number }> = [];
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) : 0;
    const trend = etfStart + (etfEnd - etfStart) * f;
    const wobble = Math.sin(f * Math.PI * 3) * 1.5;
    etfAnchors.push({ date: dateAt(months[i], 1), value: trend + wobble });
    if (i < n - 1) {
      etfAnchors.push({ date: dateAt(months[i], 15), value: trend - wobble * 0.5 });
    }
  }
  etfAnchors.push({ date: dateAt(last, last.lastDay), value: etfEnd });

  const etfMarket: MarketPriceSeed[] = priceDates.map((date) => ({
    symbol: "IWDA.AS",
    price: Math.round(lerp(etfAnchors, date) * 100) / 100,
    currency: "EUR",
    date,
    provider: "alpha-vantage",
  }));

  const etfLots: LotDef[] = [];
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) : 0;
    const price = etfStart + (etfEnd - etfStart) * f;
    etfLots.push({
      monthIdx: i,
      day: 28,
      quantity: 1,
      pricePerUnit: Math.round(price * 100) / 100,
      description: "Buy 1 IWDA share",
    });
  }

  const etf: AssetSeed = {
    asset: {
      name: "MSCI World ETF",
      type: "investment",
      currency: "EUR",
      symbolMap: JSON.stringify({ "alpha-vantage": "IWDA.AS" }),
      icon: "📈",
      color: "#3b82f6",
      notes: "Core index position, monthly DCA",
    },
    lots: buildLots(etfLots, months),
  };

  // ── Apple Inc. (USD investment) ─────────────────────────────────────────────
  // Two lots staggered at different FX rates, plus a current price
  // snapshot well above the lot prices. Together they expose the asset
  // detail's "≈ €..." subtitle on Cost Basis / Current Value AND the
  // portfolio performance table's FX Effect column (since the underlying
  // price gain and the FX drift contribute differently to base-currency
  // P&L).
  // Two small lots a few months apart so the FX drift between them is
  // visible without overcommitting the user's cash buffer (the seed
  // gates discretionary purchases on the running balance, so a lump-sum
  // buy bigger than what's in checking gets skipped entirely). Both
  // are scheduled AFTER salary day (25) so the just-arrived paycheck
  // funds the purchase — same way most retail investors actually buy.
  const appleLots: LotDef[] = [
    {
      monthIdx: 2, // ~9 months ago
      day: 28, // post-salary
      quantity: 5,
      pricePerUnit: 150, // $150 → ~$750 / ~€710
      description: "Buy 5 Apple Inc. @ 150.00 USD",
      notes: "Initial position",
    },
    {
      monthIdx: 7, // ~4 months ago
      day: 28, // post-salary
      quantity: 5,
      pricePerUnit: 165, // $165 → ~$825 / ~€760
      description: "Buy 5 Apple Inc. @ 165.00 USD",
      notes: "Adding on earnings beat",
    },
  ];

  const apple: AssetSeed = {
    asset: {
      name: "Apple Inc.",
      type: "investment",
      currency: "USD",
      symbolMap: JSON.stringify({ "alpha-vantage": "AAPL" }),
      icon: "🍎",
      color: "#94a3b8",
      notes: "USD-denominated equity — demonstrates FX P&L decomposition",
    },
    lots: buildLots(appleLots, months),
    currentPrice: 180, // $180 — well above both lot prices
  };

  // ── USD Travel Fund (USD deposit) ───────────────────────────────────────────
  // A single foreign-currency deposit lot. Exists primarily to exercise
  // the deposit dialog's foreign-currency preview path and to show a
  // small "FX drag" P&L on the asset detail page (USD has weakened
  // against EUR since the deposit, so the same 800 USD is worth fewer
  // EUR today than at deposit time).
  const travelLots: LotDef[] = [
    {
      monthIdx: 7, // ~4 months ago, same date as the second Apple lot
      day: 10,
      quantity: 800,
      pricePerUnit: 1, // deposit invariant: pricePerUnit = 1
      description: "Initial USD travel funds",
    },
  ];

  const travelFund: AssetSeed = {
    asset: {
      name: "USD Travel Fund",
      type: "deposit",
      currency: "USD",
      icon: "✈️",
      color: "#60a5fa",
      notes: "Foreign-currency cash for upcoming US trip",
    },
    lots: buildLots(travelLots, months),
  };

  return {
    assets: [savings, bitcoin, etf, apple, travelFund],
    marketPrices: [...btcMarket, ...etfMarket],
  };
}

// ─── Lot → event conversion ──────────────────────────────────────────────────

/**
 * Convert every lot in `seeds` into a `TxInput` of type `transfer`,
 * with currency / amount_base / lotLinkage pre-computed via the FX
 * lookup. The resulting events are interleaved by `generateEvents` into
 * the unified chronological stream so the seed's running cash balance
 * sees them.
 *
 * Buys (positive `quantity`) produce a cash-OUT transfer (negative
 * amount); sells (negative `quantity`) produce a cash-IN transfer.
 * `pricePerUnitBase` is snapshotted from the FX rate at the lot's
 * date — exactly what `AssetLotService.buy()` writes via `toBase()` /
 * `pricePerUnitBase = totalBase / quantity`.
 *
 * `LotLinkage.assetName` carries the asset's display name so the
 * post-insert pass in `seed/index.ts` can resolve it to an `assetId`
 * once the assets table has been written.
 */
export function lotsToEvents(
  seeds: AssetSeed[],
  fx: FxRateLookup,
  baseCurrency: string
): TxInput[] {
  const events: TxInput[] = [];
  for (const seed of seeds) {
    for (const lot of seed.lots) {
      const totalNative = Math.round(Math.abs(lot.quantity) * lot.pricePerUnit * 100) / 100;
      const rate = fx(seed.asset.currency, baseCurrency, lot.date);
      const totalBase = Math.round(totalNative * rate * 100) / 100;
      // Sign convention matches AssetLotService.buy/sell:
      //   buy  (lot.quantity > 0) → cash out → negative amount
      //   sell (lot.quantity < 0) → cash in  → positive amount
      const signedNative = lot.quantity >= 0 ? -totalNative : totalNative;
      const signedBase = lot.quantity >= 0 ? -totalBase : totalBase;
      events.push({
        amount: signedNative,
        currency: seed.asset.currency,
        amountBase: signedBase,
        type: "transfer",
        description: lot.description,
        categoryId: null,
        date: lot.date,
        tags: ["portfolio"],
        notes: lot.notes,
        lotLinkage: {
          assetName: seed.asset.name,
          quantity: lot.quantity,
          pricePerUnit: lot.pricePerUnit,
          // Snapshot at lot creation. For base-currency assets rate=1,
          // matching lot.pricePerUnit; for foreign-currency assets it's
          // pricePerUnit × FX rate at the lot date — exactly what
          // AssetLotService computes via totalBase / quantity.
          pricePerUnitBase: Math.round(lot.pricePerUnit * rate * 10000) / 10000,
          notes: lot.notes,
        },
      });
    }
  }
  return events;
}
