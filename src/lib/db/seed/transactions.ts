import { pick, rand, chance, isoDate, daysInMonth, isWeekend } from "./rng";
import {
  COFFEE_SHOPS,
  COFFEE_ORDERS,
  GROCERY_STORES,
  LUNCH_SPOTS,
  DINNER_SPOTS,
  TRANSPORT_MERCHANTS,
  SHOPPING_MERCHANTS,
  SHOPPING_DESCS,
  HEALTH_MERCHANTS,
  HEALTH_DESCS,
  ENTERTAINMENT_MERCHANTS,
  ENTERTAINMENT_DESCS,
} from "./data";
import type { FxRateLookup } from "./fx-rates";
import type { RecurringTemplate } from "./recurring";

/**
 * One row's worth of data for the `transactions` table, with currency
 * and `amount_base` already pre-computed via the FX lookup. Optional
 * `lotLinkage` carries the metadata needed to create the corresponding
 * `asset_lots` row after the transaction is persisted (asset_lots needs
 * the inserted transaction's id, so the link happens post-insert).
 */
export interface TxInput {
  amount: number;
  currency: string;
  amountBase: number;
  type: "income" | "expense" | "transfer";
  description: string;
  merchant?: string;
  categoryId: number | null;
  date: string;
  tags: string[];
  recurringId?: number;
  notes?: string;
  lotLinkage?: LotLinkage;
}

/** Asset lot metadata carried alongside a transfer transaction. */
export interface LotLinkage {
  /** Asset name (matches `AssetSeed.asset.name`) — used to look up the
   *  inserted asset id post-insert. */
  assetName: string;
  /** Native quantity. Negative for sells/withdrawals. */
  quantity: number;
  /** Native price per unit. Always 1 for deposit assets. */
  pricePerUnit: number;
  /** Base-currency-equivalent price per unit, snapshotted at lot date. */
  pricePerUnitBase: number;
  notes?: string;
}

/** Recurring template enriched with the row id assigned at insert time. */
export type TemplateWithId = RecurringTemplate & { id: number };

interface GenerateEventsArgs {
  months: Array<{ year: number; month: number; lastDay: number }>;
  catIds: Record<string, number>;
  templates: TemplateWithId[];
  /** Pre-computed lot transfer events to interleave into the day-by-day
   *  loop. Each entry must already have `currency`/`amountBase`/`lotLinkage`
   *  filled in by the asset generator. */
  lotEvents: TxInput[];
  /** One-off deterministic events (e.g. opening balance, airport coffee).
   *  Same shape as lotEvents — pre-computed and interleaved by date. */
  oneOffEvents: TxInput[];
  fx: FxRateLookup;
  baseCurrency: string;
  /** Starting cash balance (before any events are processed). */
  openingBalance: number;
}

/**
 * Generate the entire seed transaction history as a single chronological
 * stream. Replaces the older per-month `generateMonth` and the parallel
 * out-of-band asset-lot insertion: ALL events (recurring templates,
 * stochastic spending, electricity, asset lot transfers, opening balance,
 * one-offs) flow through one balance counter so the running cash balance
 * is consistent at every point in the seed period.
 *
 * Two emission categories:
 *
 *   • **Deterministic events** — recurring templates, electricity bills,
 *     asset lot transfers, opening balance, one-offs. Always emitted; the
 *     balance is debited unconditionally. These represent committed cash
 *     flows that the seed treats as ground truth.
 *
 *   • **Stochastic events** — daily groceries, coffee, dining, etc.
 *     Subject to a "never go negative" check: if the running balance
 *     would drop below zero, the event is dropped. This is the only
 *     mechanism that keeps cash positive after a big asset buy.
 *
 * Foreign-currency rows are handled transparently via the FX lookup,
 * which is shared with the runtime resolver so seed `amount_base`
 * values match what `findCachedFxRate` would compute.
 */
export function generateEvents({
  months,
  catIds,
  templates,
  lotEvents,
  oneOffEvents,
  fx,
  baseCurrency,
  openingBalance,
}: GenerateEventsArgs): TxInput[] {
  const txs: TxInput[] = [];
  let bal = openingBalance;

  // Index deterministic events by their date so we can drain them on the
  // matching day during the day-by-day loop. Lot events and one-offs
  // belong to the same bucket — both are pre-computed and just need to
  // be threaded into the chronological stream in their proper place.
  const deterministicByDate = new Map<string, TxInput[]>();
  for (const ev of [...lotEvents, ...oneOffEvents]) {
    const bucket = deterministicByDate.get(ev.date) ?? [];
    bucket.push(ev);
    deterministicByDate.set(ev.date, bucket);
  }

  /**
   * Build a `TxInput` with currency + `amount_base` filled in via the
   * FX lookup. Defaults to base currency, in which case `amount_base`
   * mirrors `amount`. Closed-over `fx` and `baseCurrency` keep call
   * sites short.
   */
  function mkTx(
    amount: number,
    rest: Omit<TxInput, "amount" | "currency" | "amountBase">,
    currency: string = baseCurrency
  ): TxInput {
    const rate = fx(currency, baseCurrency, rest.date);
    const amountBase = Math.round(amount * rate * 100) / 100;
    return { amount, currency, amountBase, ...rest };
  }

  /**
   * Apply a transaction's signed effect on the running cash balance.
   *  - income: cash in
   *  - expense: cash out
   *  - transfer: amount_base is already signed (negative for buys/deposits,
   *    positive for sells/withdrawals)
   */
  function balanceDelta(tx: TxInput): number {
    if (tx.type === "income") return tx.amountBase;
    if (tx.type === "expense") return -tx.amountBase;
    return tx.amountBase; // transfer (already signed)
  }

  /** Always emit, debit balance unconditionally. Used for committed cash
   *  flows (opening balance, recurring templates, contractual bills) that
   *  the user can't realistically avoid even when cash is tight. */
  function emit(tx: TxInput): void {
    txs.push(tx);
    bal += balanceDelta(tx);
  }

  /**
   * Reserved cushion that `tryEmit` keeps untouched, modelling the
   * "safety buffer" a real user maintains in checking for upcoming
   * monthly obligations (electricity, internet, etc.) that haven't been
   * billed yet. Without this, stochastic spending drains cash to zero
   * day-by-day and a deterministic bill landing on day 15 or 20 would
   * push the balance negative just before the day-25 salary arrives —
   * exactly the failure mode the per-event balance check can't catch.
   *
   * Sized to comfortably cover one mid-month bill cluster (Internet €30
   * + Electricity ~€50 + a slack margin) so the seed stays robust
   * across whichever calendar date it happens to run on. Bumping this
   * makes the seed more conservative; lowering it makes stochastic
   * spending more aggressive and risks negative crossings on certain
   * RNG sequences.
   */
  const OBLIGATION_BUFFER = 200;

  /**
   * Emit only if the cash balance would still be ≥ OBLIGATION_BUFFER
   * afterward. Used for everything *discretionary*: stochastic spending
   * (coffee, dining, …) AND asset lot transfers (savings deposits,
   * BTC/ETF DCAs, Apple buys). Asset purchases are user choices, not
   * obligations — if the seed has spent the user's last euro on rent and
   * groceries, they wouldn't go out and buy stock. Cash inflows
   * (income, sells) are always allowed.
   */
  function tryEmit(tx: TxInput): void {
    if (tx.type === "expense" && bal - OBLIGATION_BUFFER < tx.amountBase) return;
    // Negative-signed transfer = cash out (buy / deposit-into-asset).
    // Positive transfers (sells, withdrawals) are inflows and always emit.
    if (tx.type === "transfer" && tx.amountBase < 0 && bal - OBLIGATION_BUFFER < -tx.amountBase) {
      return;
    }
    emit(tx);
  }

  /**
   * Lot transfers (events with `lotLinkage`) represent discretionary
   * asset purchases — gated by `tryEmit`. Everything else in the
   * deterministic bucket (opening balance, airport-coffee one-off) is a
   * committed cash flow and goes through `emit` unconditionally.
   */
  function emitDeterministic(ev: TxInput): void {
    if (ev.lotLinkage) tryEmit(ev);
    else emit(ev);
  }

  // ── Pre-period drain ─────────────────────────────────────────────
  // Any deterministic events dated BEFORE the first day of the loop
  // (e.g. an opening-balance event sitting the day before months[0])
  // never get visited by the day-by-day iteration. Drain them first,
  // sorted by date, so the running balance picks them up before any
  // in-period events.
  const firstLoopDate = isoDate(months[0].year, months[0].month, 1);
  const preLoopDates: string[] = [];
  for (const date of deterministicByDate.keys()) {
    if (date < firstLoopDate) preLoopDates.push(date);
  }
  preLoopDates.sort();
  for (const date of preLoopDates) {
    for (const ev of deterministicByDate.get(date) ?? []) emitDeterministic(ev);
    deterministicByDate.delete(date);
  }

  let lastGroceryDay = -8;

  for (const m of months) {
    const totalDays = Math.min(daysInMonth(m.year, m.month), m.lastDay);
    for (let day = 1; day <= totalDays; day++) {
      const date = isoDate(m.year, m.month, day);
      const weekend = isWeekend(m.year, m.month, day);

      // ── Pre-computed events for this date ────────────────────────
      // Lot transfers (gated as discretionary) and one-offs like the
      // airport coffee (committed). `emitDeterministic` routes by
      // whether the event carries a `lotLinkage`.
      const eventsForDay = deterministicByDate.get(date);
      if (eventsForDay) {
        for (const ev of eventsForDay) emitDeterministic(ev);
      }

      // ── Deterministic: recurring template emissions ───────────────
      // One transaction per template whose schedule matches `day` AND
      // whose `startDate` has been reached. Always emitted — the runtime
      // recurring engine produces these unconditionally.
      for (const tmpl of templates) {
        if (tmpl.frequency !== "monthly") continue;
        if (tmpl.dayOfMonth !== day) continue;
        if (tmpl.startDate > date) continue;
        emit(
          mkTx(
            tmpl.amount,
            {
              type: tmpl.type,
              description: tmpl.description,
              merchant: tmpl.merchant,
              categoryId: tmpl.categoryId,
              date,
              tags: tmpl.tags ?? [],
              recurringId: tmpl.id,
            },
            tmpl.currency ?? baseCurrency
          )
        );
      }

      // ── Deterministic: electricity bill ───────────────────────────
      // Monthly fixed-day expense with a random amount, so it isn't
      // modelled as a recurring template (templates require fixed
      // amounts). Inline here for that reason.
      if (day === 20) {
        emit(
          mkTx(rand(4500, 5800) / 100, {
            type: "expense",
            description: "Electricity bill",
            merchant: "Vattenfall",
            categoryId: catIds.Utilities,
            date,
            tags: ["bills", "electricity"],
          })
        );
      }

      // ── Stochastic: groceries (every 5–8 days) ────────────────────
      if (day - lastGroceryDay >= rand(5, 8)) {
        tryEmit(
          mkTx(rand(3500, 9500) / 100, {
            type: "expense",
            description: "Grocery run",
            merchant: pick(GROCERY_STORES),
            categoryId: catIds.Groceries,
            date,
            tags: ["groceries"],
          })
        );
        lastGroceryDay = day;
      }

      // ── Stochastic: daily category events ─────────────────────────
      if (chance(weekend ? 0.4 : 0.55)) {
        tryEmit(
          mkTx(rand(280, 450) / 100, {
            type: "expense",
            description: pick(COFFEE_ORDERS),
            merchant: pick(COFFEE_SHOPS),
            categoryId: catIds.Coffee,
            date,
            tags: ["coffee"],
          })
        );
      }

      if (chance(weekend ? 0.2 : 0.35)) {
        tryEmit(
          mkTx(rand(900, 1800) / 100, {
            type: "expense",
            description: "Lunch",
            merchant: pick(LUNCH_SPOTS),
            categoryId: catIds.Dining,
            date,
            tags: ["lunch"],
          })
        );
      }

      if (chance(weekend ? 0.3 : 0.15)) {
        tryEmit(
          mkTx(rand(1800, 5500) / 100, {
            type: "expense",
            description: "Dinner",
            merchant: pick(DINNER_SPOTS),
            categoryId: catIds.Dining,
            date,
            tags: ["dining"],
          })
        );
      }

      if (chance(weekend ? 0.2 : 0.6)) {
        const merchant = pick(TRANSPORT_MERCHANTS);
        const amount =
          merchant === "BVG"
            ? 2.9
            : merchant === "Uber"
              ? rand(800, 2500) / 100
              : merchant === "Deutsche Bahn"
                ? rand(1500, 8500) / 100
                : rand(1200, 3500) / 100; // FlixBus
        tryEmit(
          mkTx(amount, {
            type: "expense",
            description: "Travel",
            merchant,
            categoryId: catIds.Transport,
            date,
            tags: ["transport"],
          })
        );
      }

      if (chance(weekend ? 0.18 : 0.06)) {
        tryEmit(
          mkTx(rand(1200, 4500) / 100, {
            type: "expense",
            description: pick(ENTERTAINMENT_DESCS),
            merchant: pick(ENTERTAINMENT_MERCHANTS),
            categoryId: catIds.Entertainment,
            date,
            tags: ["entertainment"],
          })
        );
      }

      if (chance(0.09)) {
        tryEmit(
          mkTx(rand(1500, 14000) / 100, {
            type: "expense",
            description: pick(SHOPPING_DESCS),
            merchant: pick(SHOPPING_MERCHANTS),
            categoryId: catIds.Shopping,
            date,
            tags: ["shopping"],
          })
        );
      }

      if (chance(0.04)) {
        tryEmit(
          mkTx(rand(500, 3500) / 100, {
            type: "expense",
            description: pick(HEALTH_DESCS),
            merchant: pick(HEALTH_MERCHANTS),
            categoryId: catIds.Health,
            date,
            tags: ["health"],
          })
        );
      }
    }
  }

  return txs;
}
