import { Temporal } from "@js-temporal/polyfill";
import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { getCurrentMonth, isoToday } from "@/lib/date-ranges";
import { getBaseCurrency } from "@/lib/format";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { transactions, categories, assetLots, assets } from "@/lib/db/schema";
import { getEffectiveBudgets } from "./budget-inheritance";
import { buildChildrenMap } from "./category-hierarchy";
import {
  type SpendingSummaryInput,
  type CategoryStatsInput,
  type BudgetStatsInput,
  type TrendsInput,
  type DailySpendInput,
  type TopMerchantsInput,
  type NetIncomeInput,
  type SpendingGroup,
  type CategorySpendingItem,
  type BudgetStatsItem,
  type TrendPoint,
  type DailySpendPoint,
  type TopMerchant,
  type SpendingSummaryResult,
  type CategoryStatsResult,
  type TrendsResult,
  type DailySpendResult,
  type TopMerchantsResult,
  type NetIncomeResult,
  type CashBalanceResult,
  type TransferGroup,
} from "@/lib/validators/reports";

type Db = BetterSQLite3Database<typeof schema>;

function dateFilters(dateFrom: string, dateTo: string): SQL[] {
  return [gte(transactions.date, dateFrom), lte(transactions.date, dateTo)];
}

function typeFilter(type: "income" | "expense" | "all"): SQL | undefined {
  if (type === "all") return sql`${transactions.type} != 'transfer'`;
  return eq(transactions.type, type);
}

function periodTotal(db: Db, dateFrom: string, dateTo: string, type: "income" | "expense" | "all") {
  const filters: SQL[] = [...dateFilters(dateFrom, dateTo)];
  const tf = typeFilter(type);
  if (tf) filters.push(tf);

  const [row] = db
    .select({
      total: sql<number>`coalesce(sum(${transactions.amountBase}), 0)`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(transactions)
    .where(and(...filters))
    .all();
  return row ?? { total: 0, count: 0 };
}

// ─── Hierarchy helpers ───────────────────────────────────────────────────────

function rollupValues<K extends string>(
  id: number,
  childrenMap: Map<number, number[]>,
  valueMaps: Record<K, Map<number, number>>
): Record<K, number> {
  const keys = Object.keys(valueMaps) as K[];
  const result = {} as Record<K, number>;
  for (const key of keys) {
    result[key] = valueMaps[key].get(id) ?? 0;
  }
  const children = childrenMap.get(id);
  if (children) {
    for (const childId of children) {
      const childResult = rollupValues(childId, childrenMap, valueMaps);
      for (const key of keys) {
        result[key] += childResult[key];
      }
    }
  }
  return result;
}

export class ReportService {
  constructor(private db: Db) {}

  spendingSummary(input: SpendingSummaryInput): SpendingSummaryResult {
    const { dateFrom, dateTo, groupBy, type } = input;
    const filters: SQL[] = [...dateFilters(dateFrom, dateTo)];
    const tf = typeFilter(type);
    if (tf) filters.push(tf);
    const where = and(...filters);

    const period = periodTotal(this.db, dateFrom, dateTo, type);

    let comparePeriod:
      | { dateFrom: string; dateTo: string; total: number; count: number }
      | undefined;
    if (input.compareDateFrom && input.compareDateTo) {
      const ct = periodTotal(this.db, input.compareDateFrom, input.compareDateTo, type);
      comparePeriod = { dateFrom: input.compareDateFrom, dateTo: input.compareDateTo, ...ct };
    }

    let groups: SpendingGroup[];

    if (groupBy === "category") {
      const rows = this.db
        .select({
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          total: sql<number>`coalesce(sum(${transactions.amountBase}), 0)`.mapWith(Number),
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(where)
        .groupBy(transactions.categoryId)
        .orderBy(sql`sum(${transactions.amountBase}) DESC`)
        .all();

      const compareMap = new Map<number | null, number>();
      if (input.compareDateFrom && input.compareDateTo) {
        const cFilters: SQL[] = [...dateFilters(input.compareDateFrom, input.compareDateTo)];
        if (tf) cFilters.push(tf);
        const cRows = this.db
          .select({
            categoryId: transactions.categoryId,
            total: sql<number>`coalesce(sum(${transactions.amountBase}), 0)`.mapWith(Number),
          })
          .from(transactions)
          .where(and(...cFilters))
          .groupBy(transactions.categoryId)
          .all();
        for (const r of cRows) compareMap.set(r.categoryId, r.total);
      }

      groups = rows.map((r) => ({
        key: r.categoryName ?? "(uncategorized)",
        categoryId: r.categoryId,
        total: r.total,
        count: r.count,
        ...(input.compareDateFrom ? { compareTotal: compareMap.get(r.categoryId) ?? 0 } : {}),
      }));
    } else if (groupBy === "month") {
      const rows = this.db
        .select({
          month: sql<string>`strftime('%Y-%m', ${transactions.date})`.mapWith(String),
          total: sql<number>`coalesce(sum(${transactions.amountBase}), 0)`.mapWith(Number),
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(transactions)
        .where(where)
        .groupBy(sql`strftime('%Y-%m', ${transactions.date})`)
        .orderBy(sql`strftime('%Y-%m', ${transactions.date}) ASC`)
        .all();

      const compareMap = new Map<string, number>();
      if (input.compareDateFrom && input.compareDateTo) {
        const cFilters: SQL[] = [...dateFilters(input.compareDateFrom, input.compareDateTo)];
        if (tf) cFilters.push(tf);
        const cRows = this.db
          .select({
            month: sql<string>`strftime('%Y-%m', ${transactions.date})`.mapWith(String),
            total: sql<number>`coalesce(sum(${transactions.amountBase}), 0)`.mapWith(Number),
          })
          .from(transactions)
          .where(and(...cFilters))
          .groupBy(sql`strftime('%Y-%m', ${transactions.date})`)
          .all();
        for (const r of cRows) compareMap.set(r.month, r.total);
      }

      groups = rows.map((r) => ({
        key: r.month,
        total: r.total,
        count: r.count,
        ...(input.compareDateFrom ? { compareTotal: compareMap.get(r.month) ?? 0 } : {}),
      }));
    } else {
      // groupBy === 'merchant'
      const rows = this.db
        .select({
          merchant: sql<string>`coalesce(${transactions.merchant}, '(no merchant)')`.mapWith(
            String
          ),
          total: sql<number>`coalesce(sum(${transactions.amountBase}), 0)`.mapWith(Number),
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(transactions)
        .where(where)
        .groupBy(transactions.merchant)
        .orderBy(sql`sum(${transactions.amountBase}) DESC`)
        .all();

      const compareMap = new Map<string, number>();
      if (input.compareDateFrom && input.compareDateTo) {
        const cFilters: SQL[] = [...dateFilters(input.compareDateFrom, input.compareDateTo)];
        if (tf) cFilters.push(tf);
        const cRows = this.db
          .select({
            merchant: sql<string>`coalesce(${transactions.merchant}, '(no merchant)')`.mapWith(
              String
            ),
            total: sql<number>`coalesce(sum(${transactions.amountBase}), 0)`.mapWith(Number),
          })
          .from(transactions)
          .where(and(...cFilters))
          .groupBy(transactions.merchant)
          .all();
        for (const r of cRows) compareMap.set(r.merchant, r.total);
      }

      groups = rows.map((r) => ({
        key: r.merchant,
        total: r.total,
        count: r.count,
        ...(input.compareDateFrom ? { compareTotal: compareMap.get(r.merchant) ?? 0 } : {}),
      }));
    }

    // Optionally include transfer breakdown
    let transfers: TransferGroup[] | undefined;
    if (input.includeTransfers) {
      const transferRows = this.db
        .select({
          assetId: assets.id,
          assetName: assets.name,
          assetType: assets.type,
          quantity: assetLots.quantity,
          // Use base-currency equivalent so cross-currency lots aggregate correctly.
          amount: transactions.amountBase,
        })
        .from(assetLots)
        .innerJoin(assets, eq(assetLots.assetId, assets.id))
        .innerJoin(transactions, eq(assetLots.transactionId, transactions.id))
        .where(and(gte(assetLots.date, dateFrom), lte(assetLots.date, dateTo)))
        .all();

      const assetMap = new Map<
        number,
        { name: string; type: string; purchases: number; sales: number }
      >();
      for (const row of transferRows) {
        const existing = assetMap.get(row.assetId) ?? {
          name: row.assetName,
          type: row.assetType,
          purchases: 0,
          sales: 0,
        };
        if (row.quantity > 0) existing.purchases += Math.abs(row.amount);
        else existing.sales += Math.abs(row.amount);
        assetMap.set(row.assetId, existing);
      }

      transfers = Array.from(assetMap.entries()).map(([assetId, d]) => ({
        assetId,
        assetName: d.name,
        assetType: d.type,
        purchases: d.purchases,
        sales: d.sales,
        net: d.purchases - d.sales,
      }));
    }

    return {
      period: { dateFrom, dateTo, ...period },
      comparePeriod,
      groups,
      transfers,
      currency: getBaseCurrency(),
    };
  }

  getCategoryStats(input: CategoryStatsInput): CategoryStatsResult {
    // Normalize date range
    let dateFrom: string;
    let dateTo: string;

    if (input.month) {
      const [y, m] = input.month.split("-").map(Number);
      dateFrom = `${input.month}-01`;
      const lastDay = Temporal.PlainYearMonth.from({ year: y, month: m }).daysInMonth;
      dateTo = `${input.month}-${String(lastDay).padStart(2, "0")}`;
    } else {
      dateFrom = input.dateFrom!;
      dateTo = input.dateTo!;
    }

    // Query aggregated spend per category
    const filters: SQL[] = [...dateFilters(dateFrom, dateTo)];
    const tf = typeFilter(input.type);
    if (tf) filters.push(tf);

    const spendRows = this.db
      .select({
        categoryId: transactions.categoryId,
        total: sql<number>`coalesce(sum(${transactions.amountBase}), 0)`.mapWith(Number),
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(transactions)
      .where(and(...filters))
      .groupBy(transactions.categoryId)
      .all();

    const spendMap = new Map<number | null, { total: number; count: number }>();
    for (const row of spendRows) {
      spendMap.set(row.categoryId, { total: row.total, count: row.count });
    }

    // Query all categories
    const allCategories = this.db
      .select({
        id: categories.id,
        name: categories.name,
        parentId: categories.parentId,
        color: categories.color,
        icon: categories.icon,
      })
      .from(categories)
      .all();

    // Build hierarchy and compute rollups
    const childrenMap = buildChildrenMap(allCategories);
    const spendAmountMap = new Map<number, number>();
    const spendCountMap = new Map<number, number>();
    for (const [catId, spend] of spendMap) {
      if (catId !== null) {
        spendAmountMap.set(catId, spend.total);
        spendCountMap.set(catId, spend.count);
      }
    }

    // Build result rows
    const items: CategorySpendingItem[] = [];

    // Category rows
    for (const cat of allCategories) {
      const direct = spendMap.get(cat.id);
      const total = direct?.total ?? 0;
      const count = direct?.count ?? 0;
      const rollup = rollupValues(cat.id, childrenMap, {
        spend: spendAmountMap,
        count: spendCountMap,
      });

      if (!input.includeZeroSpend && total === 0 && rollup.spend === 0) continue;

      items.push({
        categoryId: cat.id,
        categoryName: cat.name,
        color: cat.color,
        icon: cat.icon,
        parentId: cat.parentId,
        total,
        count,
        rollupTotal: rollup.spend,
        rollupCount: rollup.count,
        percentage: 0, // computed below
      });
    }

    // Uncategorized row
    if (input.includeUncategorized) {
      const uncategorized = spendMap.get(null);
      if (uncategorized && uncategorized.total > 0) {
        items.push({
          categoryId: null,
          categoryName: null,
          color: null,
          icon: null,
          parentId: null,
          total: uncategorized.total,
          count: uncategorized.count,
          rollupTotal: uncategorized.total,
          rollupCount: uncategorized.count,
          percentage: 0,
        });
      }
    }

    // Compute percentages and sort
    const grandTotal = items.reduce((s, r) => s + r.total, 0);
    for (const item of items) {
      item.percentage = grandTotal > 0 ? Math.round((item.total / grandTotal) * 10000) / 100 : 0;
    }

    items.sort((a, b) => b.rollupTotal - a.rollupTotal);
    return { items, currency: getBaseCurrency() };
  }

  getBudgetStats(input: BudgetStatsInput): {
    items: BudgetStatsItem[];
    inheritedFrom: string | null;
    currency: string;
  } {
    const stats = this.getCategoryStats({
      month: input.month,
      type: input.type,
      includeZeroSpend: input.includeZeroSpend,
      includeUncategorized: input.includeUncategorized,
    });

    const { budgets: budgetMap, inheritedFrom } = getEffectiveBudgets(this.db, input.month);

    const items = stats.items.map((s) => ({
      ...s,
      budgetAmount: s.categoryId !== null ? (budgetMap.get(s.categoryId) ?? null) : null,
    }));

    return { items, inheritedFrom, currency: stats.currency };
  }

  trends(input: TrendsInput): TrendsResult {
    const currentMonth = getCurrentMonth();
    // Build month series with start/end dates so the LEFT JOIN uses
    // range comparisons (t.date >= … AND t.date < …) instead of
    // strftime('%Y-%m', t.date) = …, allowing SQLite to seek the date index.
    const rows = this.db.all<{ month: string; total: number; count: number }>(
      sql`
        WITH RECURSIVE months(m, m_start, m_end) AS (
          SELECT
            strftime('%Y-%m', ${currentMonth} || '-01', '-' || (${input.months} - 1) || ' months'),
            strftime('%Y-%m-%d', ${currentMonth} || '-01', '-' || (${input.months} - 1) || ' months'),
            strftime('%Y-%m-%d', ${currentMonth} || '-01', '-' || (${input.months} - 1) || ' months', '+1 month')
          UNION ALL
          SELECT
            strftime('%Y-%m', m || '-01', '+1 month'),
            strftime('%Y-%m-%d', m || '-01', '+1 month'),
            strftime('%Y-%m-%d', m || '-01', '+2 months')
          FROM months
          WHERE m < ${currentMonth}
        )
        SELECT
          months.m AS month,
          coalesce(sum(t.amount_base), 0) AS total,
          coalesce(count(t.id), 0) AS count
        FROM months
        LEFT JOIN transactions t
          ON t.date >= months.m_start AND t.date < months.m_end
          ${input.categoryId !== undefined ? sql`AND t.category_id = ${input.categoryId}` : sql``}
          ${input.type === "all" ? sql`AND t.type != 'transfer'` : sql`AND t.type = ${input.type}`}
        GROUP BY months.m
        ORDER BY months.m ASC
      `
    );

    const points: TrendPoint[] = rows.map((r) => ({
      month: r.month,
      total: Number(r.total),
      count: Number(r.count),
    }));
    return { points, currency: getBaseCurrency() };
  }

  /**
   * Daily expense totals over the last N days, ending today (in the user's
   * timezone). Every day in the range gets a row, including days with zero
   * spend — used by the dashboard heatmap which needs a fully-filled grid.
   * Excludes income and transfers, matching the SpendingTrendChart convention.
   */
  dailySpend(input: DailySpendInput): DailySpendResult {
    const today = isoToday();
    const startDate = Temporal.PlainDate.from(today)
      .subtract({ days: input.days - 1 })
      .toString();

    const rows = this.db.all<{ date: string; total: number; count: number }>(
      sql`
        WITH RECURSIVE days(d) AS (
          SELECT ${startDate}
          UNION ALL
          SELECT date(d, '+1 day')
          FROM days
          WHERE d < ${today}
        )
        SELECT
          days.d AS date,
          coalesce(sum(t.amount_base), 0) AS total,
          coalesce(count(t.id), 0) AS count
        FROM days
        LEFT JOIN transactions t
          ON t.date = days.d
          AND t.type = 'expense'
        GROUP BY days.d
        ORDER BY days.d ASC
      `
    );

    const points: DailySpendPoint[] = rows.map((r) => ({
      date: r.date,
      total: Number(r.total),
      count: Number(r.count),
    }));
    return { points, currency: getBaseCurrency() };
  }

  netIncome(input: NetIncomeInput): NetIncomeResult {
    const filters: SQL[] = [];
    if (input.dateFrom) filters.push(gte(transactions.date, input.dateFrom));
    if (input.dateTo) filters.push(lte(transactions.date, input.dateTo));
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [row] = this.db
      .select({
        totalIncome:
          sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountBase} else 0 end), 0)`.mapWith(
            Number
          ),
        totalExpenses:
          sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountBase} else 0 end), 0)`.mapWith(
            Number
          ),
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(transactions)
      .where(where)
      .all();

    const income = row?.totalIncome ?? 0;
    const expenses = row?.totalExpenses ?? 0;

    return {
      totalIncome: income,
      totalExpenses: expenses,
      netIncome: income - expenses,
      transactionCount: row?.count ?? 0,
      currency: getBaseCurrency(),
    };
  }

  cashBalance(): CashBalanceResult {
    const [row] = this.db
      .select({
        income:
          sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountBase} else 0 end), 0)`.mapWith(
            Number
          ),
        expenses:
          sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountBase} else 0 end), 0)`.mapWith(
            Number
          ),
        transfers:
          sql<number>`coalesce(sum(case when ${transactions.type} = 'transfer' then ${transactions.amountBase} else 0 end), 0)`.mapWith(
            Number
          ),
      })
      .from(transactions)
      .all();

    const income = row?.income ?? 0;
    const expenses = row?.expenses ?? 0;
    const transfers = row?.transfers ?? 0;

    return {
      cashBalance: income - expenses + transfers,
      totalIncome: income,
      totalExpenses: expenses,
      totalTransfers: transfers,
      currency: getBaseCurrency(),
    };
  }

  topMerchants(input: TopMerchantsInput): TopMerchantsResult {
    const filters: SQL[] = [];
    if (input.dateFrom) filters.push(gte(transactions.date, input.dateFrom));
    if (input.dateTo) filters.push(lte(transactions.date, input.dateTo));
    const tf = typeFilter(input.type);
    if (tf) filters.push(tf);
    // Only include transactions that have a merchant
    filters.push(sql`${transactions.merchant} IS NOT NULL`);

    const rows = this.db
      .select({
        merchant: transactions.merchant,
        total: sql<number>`coalesce(sum(${transactions.amountBase}), 0)`.mapWith(Number),
        count: sql<number>`count(*)`.mapWith(Number),
        avgAmount: sql<number>`coalesce(avg(${transactions.amountBase}), 0)`.mapWith(Number),
      })
      .from(transactions)
      .where(and(...filters))
      .groupBy(transactions.merchant)
      .orderBy(sql`sum(${transactions.amountBase}) DESC`)
      .limit(input.limit)
      .all();

    const merchants: TopMerchant[] = rows.map((r) => ({
      merchant: r.merchant!,
      total: r.total,
      count: r.count,
      avgAmount: Math.round(r.avgAmount * 100) / 100,
    }));
    return { merchants, currency: getBaseCurrency() };
  }
}
