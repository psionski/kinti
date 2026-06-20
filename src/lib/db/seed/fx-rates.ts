import { Temporal } from "@js-temporal/polyfill";
import { isoDate } from "./rng";
import type { MarketPriceSeed } from "./assets";

// ─── Types ────────────────────────────────────────────────────────────────────

type MonthSpec = { year: number; month: number; lastDay: number };

interface Anchor {
  date: string;
  value: number;
}

/**
 * Synchronous FX rate lookup used by the seed during generation. Returns
 * the rate to convert one unit of `from` into `to` on `date`.
 *
 * The lookup is intentionally identical in semantics to the runtime
 * `findCachedFxRate`: it returns the most recent cached entry on or
 * before `date`. The seed pre-populates `market_prices` with daily entries
 * spanning the whole period (see `buildFxRates`), so seed-time
 * `amount_base` computations match runtime lookups exactly — no
 * interpolation drift between what the seed writes and what the runtime
 * resolver returns.
 */
export type FxRateLookup = (from: string, to: string, date: string) => number;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateToDays(date: string): number {
  return Temporal.PlainDate.from(date)
    .since(Temporal.PlainDate.from("1970-01-01"), { largestUnit: "days" })
    .total("days");
}

/** Linear interpolation between sorted anchor points (by date). */
function lerp(anchors: Anchor[], target: string): number {
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

/** Generate calendar dates at 1-day intervals from `from` through `to` (inclusive). */
function dateRangeDaily(from: string, to: string): string[] {
  const dates: string[] = [];
  let cur = Temporal.PlainDate.from(from);
  const end = Temporal.PlainDate.from(to);
  while (Temporal.PlainDate.compare(cur, end) <= 0) {
    dates.push(cur.toString());
    cur = cur.add({ days: 1 });
  }
  return dates;
}

// ─── Generator ────────────────────────────────────────────────────────────────

/**
 * Build FX rate data for the seed period and return:
 *
 *  - `marketPrices`: dense daily rate entries to insert into `market_prices`.
 *    The runtime resolver will find an exact-day match for any lookup.
 *
 *  - `lookup`: a pure function with the same semantics as runtime
 *    `findCachedFxRate` (most recent entry ≤ date), backed by the same
 *    rows. The seed uses this for `amount_base` computations so the values
 *    it writes are identical to what the runtime resolver would return —
 *    no drift between the seed-time native→base conversion and what the
 *    UI reads back.
 *
 * Currency anchors:
 *  - **USD/EUR**: mild USD weakening over the year (0.96 → 0.91).
 *  - **GBP/EUR**: choppy 1.15–1.18, ending higher.
 *
 * Add new currency pairs by appending to the anchor table below.
 */
export function buildFxRates(months: MonthSpec[]): {
  marketPrices: MarketPriceSeed[];
  lookup: FxRateLookup;
} {
  const first = months[0];
  const last = months[months.length - 1];
  const startDate = isoDate(first.year, first.month, 1);
  const endDate = isoDate(last.year, last.month, last.lastDay);

  // Anchors are placed at calendar dates, not fractions, so the seed is
  // reproducible across runs regardless of when it executes — the actual
  // values at intermediate dates come from `lerp`.
  const dates = dateRangeDaily(startDate, endDate);
  const fracDate = (f: number): string => {
    const span = dateToDays(endDate) - dateToDays(startDate);
    const offset = Math.round(f * span);
    return Temporal.PlainDate.from(startDate).add({ days: offset }).toString();
  };

  // ── Anchor table ─────────────────────────────────────────────────────
  // Add a new entry per currency pair to seed additional foreign assets
  // or recurring templates. Anchor values are in (units of `to` per
  // 1 unit of `from`).
  const pairs: Array<{ from: string; to: string; anchors: Anchor[] }> = [
    {
      from: "USD",
      to: "EUR",
      anchors: [
        { date: fracDate(0), value: 0.96 },
        { date: fracDate(0.25), value: 0.94 },
        { date: fracDate(0.5), value: 0.93 },
        { date: fracDate(0.75), value: 0.92 },
        { date: fracDate(1.0), value: 0.91 },
      ],
    },
    {
      from: "GBP",
      to: "EUR",
      anchors: [
        { date: fracDate(0), value: 1.15 },
        { date: fracDate(0.2), value: 1.16 },
        { date: fracDate(0.4), value: 1.17 },
        { date: fracDate(0.6), value: 1.18 },
        { date: fracDate(0.8), value: 1.16 },
        { date: fracDate(1.0), value: 1.18 },
      ],
    },
  ];

  // Materialise daily rate entries from the anchor curves. Rounding to
  // 4 decimal places mirrors what Frankfurter and most FX providers
  // publish, and keeps `amount_base` rounding stable.
  const marketPrices: MarketPriceSeed[] = [];
  for (const pair of pairs) {
    for (const date of dates) {
      marketPrices.push({
        symbol: pair.from,
        currency: pair.to,
        price: Math.round(lerp(pair.anchors, date) * 10000) / 10000,
        date,
        provider: "frankfurter",
      });
    }
  }

  // Index by (from, to) → sorted-by-date entries for O(log n) lookup.
  // Daily granularity means every lookup hits an exact-date entry; the
  // "≤ date" rule is here for parity with `findCachedFxRate` rather than
  // weekend/holiday coverage.
  type Indexed = Map<string, MarketPriceSeed[]>;
  const index: Indexed = new Map();
  for (const mp of marketPrices) {
    const key = `${mp.symbol}->${mp.currency}`;
    let bucket = index.get(key);
    if (!bucket) {
      bucket = [];
      index.set(key, bucket);
    }
    bucket.push(mp);
  }
  for (const bucket of index.values()) bucket.sort((a, b) => a.date.localeCompare(b.date));

  function lookup(from: string, to: string, date: string): number {
    if (from === to) return 1;
    const bucket = index.get(`${from}->${to}`);
    if (!bucket) {
      throw new Error(
        `Seed FX rate lookup failed: no anchors for ${from}→${to}. ` +
          `Add the pair to fx-rates.ts.`
      );
    }
    // Most recent entry ≤ date. Linear scan back from the end is fine for
    // ~365 entries.
    for (let i = bucket.length - 1; i >= 0; i--) {
      if (bucket[i].date <= date) return bucket[i].price;
    }
    throw new Error(
      `Seed FX rate lookup failed: no ${from}→${to} entry on or before ${date}. ` +
        `The seed period starts ${bucket[0]?.date ?? "(empty)"}.`
    );
  }

  return { marketPrices, lookup };
}
