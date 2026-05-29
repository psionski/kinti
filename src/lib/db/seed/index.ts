import { eq, sql, isNotNull } from "drizzle-orm";
import { getDb } from "../index";
import {
  assets,
  assetLots,
  assetPrices,
  budgets,
  categories,
  marketPrices,
  recurringTransactions,
  settings,
  transactions,
} from "../schema";
import { PARENT_CATEGORIES, CHILD_CATEGORIES } from "./data";
import { generateEvents, type TxInput, type TemplateWithId, type LotLinkage } from "./transactions";
import { generateBudgets } from "./budgets";
import { generateRecurringTemplates } from "./recurring";
import { generateAssets, lotsToEvents } from "./assets";
import { buildFxRates } from "./fx-rates";
import { Temporal } from "@js-temporal/polyfill";
import { isoDate } from "./rng";
import { seedLogger } from "@/lib/logger";

const BASE_CURRENCY = "EUR";
const OPENING_BALANCE = 2000; // €2 000 — previous month's salary leftovers

export async function seed(): Promise<void> {
  const db = getDb();

  // Abort if database already has data
  const existingCategories = await db.select().from(categories);
  const existingTransactions = await db.select({ id: transactions.id }).from(transactions).limit(1);
  if (existingCategories.length > 0 || existingTransactions.length > 0) {
    seedLogger.info("Database already has data — skipping seed.");
    return;
  }

  // ── Categories ──────────────────────────────────────────────────────────
  seedLogger.info("Seeding categories...");

  for (const cat of PARENT_CATEGORIES) {
    await db.insert(categories).values(cat).onConflictDoNothing();
  }

  const parentRows = await db.select().from(categories);
  const parentIdMap: Record<string, number> = {};
  for (const c of parentRows) parentIdMap[c.name] = c.id;

  for (const child of CHILD_CATEGORIES) {
    const parentId = parentIdMap[child.parentName];
    await db
      .insert(categories)
      .values({ name: child.name, icon: child.icon, color: child.color, parentId })
      .onConflictDoNothing();
  }

  const totalCats = PARENT_CATEGORIES.length + CHILD_CATEGORIES.length;
  seedLogger.info(`  ${totalCats} categories ready (${CHILD_CATEGORIES.length} nested).`);

  const cats = await db.select().from(categories);
  const catIds: Record<string, number> = {};
  for (const c of cats) catIds[c.name] = c.id;

  // ── Date range (12 months ending with current month) ──────────────────
  const today = Temporal.Now.plainDateISO();
  const todayYear = today.year;
  const todayMonth = today.month;
  const todayDay = today.day;

  const months: Array<{ year: number; month: number; lastDay: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const ym = Temporal.PlainYearMonth.from({ year: todayYear, month: todayMonth }).subtract({
      months: i,
    });
    const lastDay = i === 0 ? todayDay : ym.daysInMonth;
    months.push({ year: ym.year, month: ym.month, lastDay });
  }

  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];
  const todayStr = isoDate(todayYear, todayMonth, todayDay);
  const rangeLabel =
    `${isoDate(firstMonth.year, firstMonth.month, 1).slice(0, 7)} – ` +
    `${isoDate(lastMonth.year, lastMonth.month, 1).slice(0, 7)}`;

  // ── FX rates (insert FIRST so any later FX-aware insert can rely on the cache) ──
  // Daily rate entries spanning the seed period for every foreign currency
  // pair the seed touches. Same shape as runtime cache rows so the resolver
  // finds an exact match for any (currency, date) lookup. The accompanying
  // `lookup` function is used by every code path that computes
  // `amount_base`, so seed-time values match runtime exactly.
  seedLogger.info("Building FX rate cache...");
  const fx = buildFxRates(months);
  const FX_BATCH = 100;
  for (let i = 0; i < fx.marketPrices.length; i += FX_BATCH) {
    await db.insert(marketPrices).values(fx.marketPrices.slice(i, i + FX_BATCH));
  }
  seedLogger.info(`  ${fx.marketPrices.length} FX rate entries.`);

  // ── Recurring templates (before transactions, so we can link them) ────
  seedLogger.info("Creating recurring transaction templates...");

  const templates = generateRecurringTemplates(catIds, months, todayStr);

  const templatesWithIds: TemplateWithId[] = [];
  for (const tmpl of templates) {
    const [row] = await db
      .insert(recurringTransactions)
      .values({
        ...tmpl,
        // RecurringTemplate.tags is a string[]; the schema column is a
        // JSON-encoded text blob, matching how the runtime service
        // serialises it.
        tags: tmpl.tags ? JSON.stringify(tmpl.tags) : null,
      })
      .returning({ id: recurringTransactions.id });
    templatesWithIds.push({ ...tmpl, id: row.id });
  }
  seedLogger.info(`  ${templates.length} recurring templates created.`);

  // ── Asset definitions ─────────────────────────────────────────────────
  // Build the asset *seeds* (definitions + lots), but DON'T insert them
  // yet — we need to weave the lot transfers into the unified event
  // stream first so the running balance stays consistent.
  seedLogger.info("Generating portfolio assets...");
  const { assets: assetSeeds, marketPrices: mpSeeds } = generateAssets(months);

  // Convert each lot definition into a TxInput of type=transfer with
  // currency / amount_base / lotLinkage filled in. These get interleaved
  // into the chronological event stream below.
  const lotEvents = lotsToEvents(assetSeeds, fx.lookup, BASE_CURRENCY);

  // ── One-off deterministic events ──────────────────────────────────────
  // Opening balance (previous-month leftovers) and the GBP airport-coffee
  // demo expense. Both are pre-computed and fed into the event stream by
  // date alongside the recurring templates and asset lots.
  const preYm = Temporal.PlainYearMonth.from({
    year: firstMonth.year,
    month: firstMonth.month,
  }).subtract({ months: 1 });
  const openingDate = isoDate(preYm.year, preYm.month, preYm.daysInMonth);

  const fcDate = isoDate(lastMonth.year, lastMonth.month, Math.min(12, lastMonth.lastDay));
  const fcRate = fx.lookup("GBP", BASE_CURRENCY, fcDate);
  const fcNative = 4.5;

  const oneOffEvents: TxInput[] = [
    {
      amount: OPENING_BALANCE,
      currency: BASE_CURRENCY,
      amountBase: OPENING_BALANCE,
      type: "income",
      description: "Previous month balance",
      categoryId: catIds.Income,
      date: openingDate,
      tags: ["opening-balance"],
    },
    {
      amount: fcNative,
      currency: "GBP",
      amountBase: Math.round(fcNative * fcRate * 100) / 100,
      type: "expense",
      description: "Airport coffee in London",
      merchant: "Heathrow Costa",
      categoryId: catIds.Coffee,
      date: fcDate,
      tags: ["travel", "coffee"],
    },
  ];

  // ── Unified event stream ──────────────────────────────────────────────
  // Single chronological pass over months/days that interleaves lot
  // transfers, recurring templates, electricity, opening balance, and
  // stochastic spending under one shared balance counter. Stochastic
  // expenses back off when cash gets low; deterministic events
  // (templates, lots, opening balance) always emit. The result is a
  // chronologically-ordered TxInput[] where the running cash balance is
  // consistent at every point in time.
  seedLogger.info(`Generating events (${rangeLabel})...`);
  const events = generateEvents({
    months,
    catIds,
    templates: templatesWithIds,
    lotEvents,
    oneOffEvents,
    fx: fx.lookup,
    baseCurrency: BASE_CURRENCY,
    openingBalance: 0, // opening balance comes in via the oneOffEvents stream
  });
  seedLogger.info(`  ${events.length} events generated.`);

  // ── Insert assets ─────────────────────────────────────────────────────
  // Done before transactions so we can link asset_lots to the inserted
  // asset_id (looked up by name post-insert).
  const assetIdByName = new Map<string, number>();
  for (const seed of assetSeeds) {
    const [row] = await db.insert(assets).values(seed.asset).returning({ id: assets.id });
    assetIdByName.set(seed.asset.name, row.id);
  }
  seedLogger.info(`  ${assetSeeds.length} assets inserted.`);

  // ── Insert transactions ───────────────────────────────────────────────
  // Captures the inserted ids in event-stream order so each event with
  // a `lotLinkage` can later look up its tx id and create the
  // corresponding asset_lots row.
  seedLogger.info(`Inserting ${events.length} transactions...`);
  const txIdsByEventIndex: number[] = new Array(events.length);
  const BATCH = 50;
  for (let i = 0; i < events.length; i += BATCH) {
    const slice = events.slice(i, i + BATCH);
    const inserted = await db
      .insert(transactions)
      .values(
        slice.map((tx) => ({
          amount: tx.amount,
          currency: tx.currency,
          amountBase: tx.amountBase,
          type: tx.type,
          description: tx.description,
          merchant: tx.merchant ?? null,
          categoryId: tx.categoryId,
          date: tx.date,
          tags: JSON.stringify(tx.tags),
          recurringId: tx.recurringId ?? null,
          notes: tx.notes ?? null,
        }))
      )
      .returning({ id: transactions.id });
    for (let j = 0; j < inserted.length; j++) {
      txIdsByEventIndex[i + j] = inserted[j].id;
    }
  }

  // ── Insert asset_lots + asset_prices snapshots ────────────────────────
  // Walk the events; every event with a `lotLinkage` produces an
  // asset_lots row plus an asset_prices snapshot at the lot date,
  // matching what AssetLotService.buy() does inside its DB transaction.
  let totalLots = 0;
  for (let i = 0; i < events.length; i++) {
    const link: LotLinkage | undefined = events[i].lotLinkage;
    if (!link) continue;
    const assetId = assetIdByName.get(link.assetName);
    if (assetId === undefined) {
      throw new Error(`Lot linkage references unknown asset "${link.assetName}"`);
    }
    await db.insert(assetLots).values({
      assetId,
      quantity: link.quantity,
      pricePerUnit: link.pricePerUnit,
      pricePerUnitBase: link.pricePerUnitBase,
      date: events[i].date,
      transactionId: txIdsByEventIndex[i],
      notes: link.notes ?? null,
    });
    await db.insert(assetPrices).values({
      assetId,
      pricePerUnit: link.pricePerUnit,
      recordedAt: `${events[i].date}T12:00:00`,
    });
    totalLots++;
  }

  // Optional today-snapshot for assets whose lot prices are stale (e.g.
  // Apple Inc., whose lots are months old). Without this the
  // price-resolver's user-price step would return the most recent lot's
  // price as "current value".
  for (const seed of assetSeeds) {
    if (seed.currentPrice === undefined) continue;
    const assetId = assetIdByName.get(seed.asset.name);
    if (assetId === undefined) continue;
    await db.insert(assetPrices).values({
      assetId,
      pricePerUnit: seed.currentPrice,
      recordedAt: `${todayStr}T12:00:00`,
    });
  }

  // ── Asset market prices (Bitcoin / MSCI ETF history) ──────────────────
  for (let i = 0; i < mpSeeds.length; i += BATCH) {
    await db.insert(marketPrices).values(mpSeeds.slice(i, i + BATCH));
  }
  seedLogger.info(`  ${mpSeeds.length} asset market price points, ${totalLots} asset lots total.`);

  // ── Budgets ─────────────────────────────────────────────────────────────
  // Sums `amount_base` so foreign-currency expenses contribute their
  // base-currency-equivalent value to the rollup.
  seedLogger.info("Generating budgets...");
  const budgetRows = generateBudgets(events, catIds, months);
  for (const row of budgetRows) {
    await db.insert(budgets).values(row);
  }
  seedLogger.info(`  ${budgetRows.length} budget entries across ${months.length} months.`);

  // ── Reconcile recurring `lastGenerated` ────────────────────────────────
  // The template helpers set `lastGenerated = todayStr` as a sentinel
  // meaning "the seed has produced everything up to today, don't re-emit".
  // The actual service convention is `lastGenerated = dates[dates.length-1]`
  // — the date of the most recently emitted occurrence. Both sentinels
  // produce identical next-occurrence behavior (computeNextOccurrence
  // reads only the schedule and isoToday()), but the user-visible
  // "last generated" value should match what the service would write.
  // Walk every template, find the max date among its linked transactions,
  // and update the column.
  seedLogger.info("Reconciling recurring template `lastGenerated` dates...");
  const linkedDates = await db
    .select({
      recurringId: transactions.recurringId,
      lastDate: sql<string>`max(${transactions.date})`.mapWith(String),
    })
    .from(transactions)
    .where(isNotNull(transactions.recurringId))
    .groupBy(transactions.recurringId);
  for (const row of linkedDates) {
    if (row.recurringId == null) continue;
    await db
      .update(recurringTransactions)
      .set({ lastGenerated: row.lastDate })
      .where(eq(recurringTransactions.id, row.recurringId));
  }
  seedLogger.info(`  Updated ${linkedDates.length} templates.`);

  // ── Settings (timezone + base currency + tutorial flag) ────────────────
  seedLogger.info("Configuring settings...");
  await db.insert(settings).values({ key: "timezone", value: "Europe/Amsterdam" });
  await db.insert(settings).values({ key: "base_currency", value: BASE_CURRENCY });
  await db.insert(settings).values({ key: "tutorial", value: "true" });
  await db.insert(settings).values({ key: "sample_data", value: "true" });
  seedLogger.info(
    `  Timezone: Europe/Amsterdam, base currency: ${BASE_CURRENCY}, tutorial: enabled.`
  );

  // ── Summary ─────────────────────────────────────────────────────────────
  // Sum in base currency so foreign-currency rows aggregate correctly.
  let income = 0;
  let expenses = 0;
  let transfers = 0;
  for (const t of events) {
    if (t.type === "income") income += t.amountBase;
    else if (t.type === "expense") expenses += t.amountBase;
    else transfers += t.amountBase; // already signed
  }
  const finalCash = income - expenses + transfers;
  seedLogger.info(`Done.`);
  seedLogger.info(`  Total income:   €${income.toFixed(2)}`);
  seedLogger.info(`  Total expenses: €${expenses.toFixed(2)}`);
  seedLogger.info(`  Net transfers:  €${transfers.toFixed(2)}`);
  seedLogger.info(`  Final cash:     €${finalCash.toFixed(2)}`);
}

