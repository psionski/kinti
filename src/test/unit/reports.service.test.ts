// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { makeTestDb } from "../helpers";
import { ReportService } from "@/lib/services/reports";
import { TransactionService } from "@/lib/services/transactions";
import { CategoryService } from "@/lib/services/categories";
import { BudgetService } from "@/lib/services/budgets";
import { CreateTransactionSchema } from "@/lib/validators/transactions";
import {
  SpendingSummarySchema,
  CategoryStatsSchema,
  BudgetStatsSchema,
  TrendsSchema,
  DailySpendSchema,
  TopMerchantsSchema,
} from "@/lib/validators/reports";

type TestDb = ReturnType<typeof makeTestDb>;

let db: TestDb;
let reports: ReportService;
let txService: TransactionService;
let catService: CategoryService;
let budgetService: BudgetService;

// Pin clock to March 2026 — test data uses March dates
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.UTC(2026, 2, 15)));
  db = makeTestDb();
  reports = new ReportService(db);
  txService = new TransactionService(db);
  catService = new CategoryService(db);
  budgetService = new BudgetService(db, reports);
});

afterEach(() => {
  vi.useRealTimers();
});

function tx(overrides: Record<string, unknown> = {}) {
  return CreateTransactionSchema.parse({
    amount: 10,
    description: "Test",
    date: "2026-03-01",
    ...overrides,
  });
}

// ─── spendingSummary ──────────────────────────────────────────────────────────

describe("spendingSummary", async () => {
  beforeEach(async () => {
    const food = catService.create({ name: "Food" });
    const transport = catService.create({ name: "Transport" });

    await txService.create(
      tx({ amount: 5, date: "2026-03-05", categoryId: food.id, merchant: "ALDI" })
    );
    await txService.create(
      tx({ amount: 3, date: "2026-03-10", categoryId: food.id, merchant: "Lidl" })
    );
    await txService.create(
      tx({ amount: 2, date: "2026-03-15", categoryId: transport.id, merchant: "BVG" })
    );
    await txService.create(
      tx({ amount: 10, date: "2026-02-28", categoryId: food.id, merchant: "ALDI" })
    );
  });

  it("returns correct period total for date range", async () => {
    const result = reports.spendingSummary(
      SpendingSummarySchema.parse({ dateFrom: "2026-03-01", dateTo: "2026-03-31" })
    );
    expect(result.period.total).toBe(10);
    expect(result.period.count).toBe(3);
  });

  it("groups by category correctly", async () => {
    const result = reports.spendingSummary(
      SpendingSummarySchema.parse({
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
        groupBy: "category",
      })
    );
    expect(result.groups).toHaveLength(2);
    const food = result.groups.find((g) => g.key === "Food");
    expect(food?.total).toBe(8);
    expect(food?.count).toBe(2);
  });

  it("groups by month correctly", async () => {
    const result = reports.spendingSummary(
      SpendingSummarySchema.parse({
        dateFrom: "2026-02-01",
        dateTo: "2026-03-31",
        groupBy: "month",
      })
    );
    expect(result.groups).toHaveLength(2);
    const march = result.groups.find((g) => g.key === "2026-03");
    expect(march?.total).toBe(10);
  });

  it("groups by merchant correctly", async () => {
    const result = reports.spendingSummary(
      SpendingSummarySchema.parse({
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
        groupBy: "merchant",
      })
    );
    const aldi = result.groups.find((g) => g.key === "ALDI");
    expect(aldi?.total).toBe(5);
  });

  it("includes compareTotal when compare period is provided", async () => {
    const result = reports.spendingSummary(
      SpendingSummarySchema.parse({
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
        groupBy: "category",
        compareDateFrom: "2026-02-01",
        compareDateTo: "2026-02-28",
      })
    );
    const food = result.groups.find((g) => g.key === "Food");
    expect(food?.compareTotal).toBe(10);
    expect(result.comparePeriod?.total).toBe(10);
  });

  it("includes compareTotal when grouped by month", async () => {
    const result = reports.spendingSummary(
      SpendingSummarySchema.parse({
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
        groupBy: "month",
        compareDateFrom: "2026-02-01",
        compareDateTo: "2026-02-28",
      })
    );
    const march = result.groups.find((g) => g.key === "2026-03");
    // No March data in compare period, so compareTotal should be 0
    expect(march?.compareTotal).toBe(0);
    // Compare period should have Feb data
    expect(result.comparePeriod?.total).toBe(10);
  });

  it("includes compareTotal when grouped by merchant", async () => {
    const result = reports.spendingSummary(
      SpendingSummarySchema.parse({
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
        groupBy: "merchant",
        compareDateFrom: "2026-02-01",
        compareDateTo: "2026-02-28",
      })
    );
    const aldi = result.groups.find((g) => g.key === "ALDI");
    // ALDI had 10 in Feb
    expect(aldi?.compareTotal).toBe(10);
    // Lidl had nothing in Feb
    const lidl = result.groups.find((g) => g.key === "Lidl");
    expect(lidl?.compareTotal).toBe(0);
  });

  it("respects type filter (income vs expense)", async () => {
    await txService.create(
      tx({ amount: 50, type: "income", date: "2026-03-20", description: "Salary" })
    );
    const expense = reports.spendingSummary(
      SpendingSummarySchema.parse({ dateFrom: "2026-03-01", dateTo: "2026-03-31", type: "expense" })
    );
    expect(expense.period.total).toBe(10);

    const income = reports.spendingSummary(
      SpendingSummarySchema.parse({ dateFrom: "2026-03-01", dateTo: "2026-03-31", type: "income" })
    );
    expect(income.period.total).toBe(50);
  });
});

function catStats(overrides: Record<string, unknown> = {}) {
  return CategoryStatsSchema.parse(overrides);
}

// ─── getCategoryStats ─────────────────────────────────────────────────────────

describe("getCategoryStats", async () => {
  it("returns percentages that sum to 100", async () => {
    const food = catService.create({ name: "Food" });
    const transport = catService.create({ name: "Transport" });
    await txService.create(tx({ amount: 7.5, categoryId: food.id }));
    await txService.create(tx({ amount: 2.5, categoryId: transport.id }));

    const { items, currency } = reports.getCategoryStats(
      catStats({ dateFrom: "2026-03-01", dateTo: "2026-03-31", includeZeroSpend: false })
    );
    expect(currency).toBe("EUR");
    const total = items.reduce((s, r) => s + r.percentage, 0);
    expect(Math.round(total)).toBe(100);
    const food_ = items.find((r) => r.categoryId === food.id);
    expect(food_?.percentage).toBe(75);
  });

  it("returns empty array when no transactions and includeZeroSpend is false", async () => {
    const { items } = reports.getCategoryStats(
      catStats({ dateFrom: "2026-03-01", dateTo: "2026-03-31", includeZeroSpend: false })
    );
    expect(items).toHaveLength(0);
  });

  it("groups uncategorized transactions under null category", async () => {
    await txService.create(tx({ amount: 5 })); // no categoryId
    const { items } = reports.getCategoryStats(
      catStats({
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
        includeZeroSpend: false,
        includeUncategorized: true,
      })
    );
    expect(items).toHaveLength(1);
    expect(items[0].categoryId).toBeNull();
    expect(items[0].percentage).toBe(100);
  });

  it("includes color and icon from category", async () => {
    const food = catService.create({ name: "Food", color: "#FF0000", icon: "🍕" });
    await txService.create(tx({ amount: 5, categoryId: food.id }));

    const { items } = reports.getCategoryStats(
      catStats({ dateFrom: "2026-03-01", dateTo: "2026-03-31", includeZeroSpend: false })
    );
    const foodItem = items.find((r) => r.categoryId === food.id);
    expect(foodItem?.color).toBe("#FF0000");
    expect(foodItem?.icon).toBe("🍕");
  });

  it("returns stats for all categories with zero spend when includeZeroSpend is true", async () => {
    catService.create({ name: "A" });
    catService.create({ name: "B" });

    const { items } = reports.getCategoryStats(catStats({ month: "2026-03" }));
    expect(items).toHaveLength(2);
    expect(items.every((s) => s.total === 0 && s.count === 0)).toBe(true);
  });

  it("computes total spend from expense transactions in the given month", async () => {
    const cat = catService.create({ name: "Food" });
    await txService.create(tx({ categoryId: cat.id, amount: 5, date: "2026-03-01" }));
    await txService.create(tx({ categoryId: cat.id, amount: 3, date: "2026-03-15" }));
    // Different month — should not count
    await txService.create(tx({ categoryId: cat.id, amount: 9.99, date: "2026-02-28" }));

    const { items } = reports.getCategoryStats(catStats({ month: "2026-03" }));
    const foodStats = items.find((s) => s.categoryId === cat.id);
    expect(foodStats?.total).toBe(8);
    expect(foodStats?.count).toBe(2);
  });

  it("excludes income transactions from spend total", async () => {
    const cat = catService.create({ name: "Salary" });
    await txService.create(
      tx({ categoryId: cat.id, amount: 50, type: "income", date: "2026-03-01" })
    );
    await txService.create(tx({ categoryId: cat.id, amount: 2, date: "2026-03-01" })); // expense

    const { items } = reports.getCategoryStats(catStats({ month: "2026-03" }));
    const salaryStats = items.find((s) => s.categoryId === cat.id);
    expect(salaryStats?.total).toBe(2);
    expect(salaryStats?.count).toBe(1);
  });

  it("scopes stats to the requested month only", async () => {
    const cat = catService.create({ name: "Food" });
    await txService.create(tx({ categoryId: cat.id, amount: 1, date: "2026-03-01" }));
    await txService.create(tx({ categoryId: cat.id, amount: 2, date: "2026-04-01" }));

    const marchStats = reports.getCategoryStats(catStats({ month: "2026-03" }));
    const aprilStats = reports.getCategoryStats(catStats({ month: "2026-04" }));

    expect(marchStats.items.find((s) => s.categoryId === cat.id)?.total).toBe(1);
    expect(aprilStats.items.find((s) => s.categoryId === cat.id)?.total).toBe(2);
  });

  it("rollup includes parent's own spend plus all children", async () => {
    const parent = catService.create({ name: "Food" });
    const child1 = catService.create({ name: "Groceries", parentId: parent.id });
    const child2 = catService.create({ name: "Dining", parentId: parent.id });

    await txService.create(tx({ categoryId: parent.id, amount: 1, date: "2026-03-01" }));
    await txService.create(tx({ categoryId: child1.id, amount: 5, date: "2026-03-01" }));
    await txService.create(tx({ categoryId: child2.id, amount: 3, date: "2026-03-01" }));

    const { items } = reports.getCategoryStats(catStats({ month: "2026-03" }));
    const parentStats = items.find((s) => s.categoryId === parent.id);

    expect(parentStats?.total).toBe(1);
    expect(parentStats?.count).toBe(1);
    expect(parentStats?.rollupTotal).toBe(9);
    expect(parentStats?.rollupCount).toBe(3);
  });

  it("rollup for leaf categories equals their own spend", async () => {
    catService.create({ name: "Food" });
    const child = catService.create({ name: "Groceries", parentId: 1 });

    await txService.create(tx({ categoryId: child.id, amount: 5, date: "2026-03-01" }));

    const { items } = reports.getCategoryStats(catStats({ month: "2026-03" }));
    const childStats = items.find((s) => s.categoryId === child.id);

    expect(childStats?.total).toBe(5);
    expect(childStats?.rollupTotal).toBe(5);
  });

  it("rollup works with nested grandchildren", async () => {
    const grandparent = catService.create({ name: "Food" });
    const parent = catService.create({ name: "Dining", parentId: grandparent.id });
    const child = catService.create({ name: "Coffee", parentId: parent.id });

    await txService.create(tx({ categoryId: grandparent.id, amount: 1, date: "2026-03-01" }));
    await txService.create(tx({ categoryId: parent.id, amount: 2, date: "2026-03-01" }));
    await txService.create(tx({ categoryId: child.id, amount: 3, date: "2026-03-01" }));

    const { items } = reports.getCategoryStats(catStats({ month: "2026-03" }));

    expect(items.find((s) => s.categoryId === grandparent.id)?.rollupTotal).toBe(6);
    expect(items.find((s) => s.categoryId === parent.id)?.rollupTotal).toBe(5);
    expect(items.find((s) => s.categoryId === child.id)?.rollupTotal).toBe(3);
  });
});

// ─── getBudgetStats ──────────────────────────────────────────────────────────

function budgetStats(overrides: Record<string, unknown> = {}) {
  return BudgetStatsSchema.parse({ month: "2026-03", ...overrides });
}

describe("getBudgetStats", async () => {
  it("includes budget amount when a budget exists for the month", async () => {
    const cat = catService.create({ name: "Food" });
    budgetService.set({ categoryId: cat.id, month: "2026-03", amount: 500 });

    const { items } = reports.getBudgetStats(budgetStats());
    const foodStats = items.find((s) => s.categoryId === cat.id);
    expect(foodStats?.budgetAmount).toBe(500);
  });

  it("returns null budgetAmount when no budget is set", async () => {
    catService.create({ name: "Food" });

    const { items } = reports.getBudgetStats(budgetStats());
    expect(items[0].budgetAmount).toBeNull();
  });

  it("includes spending stats from getCategoryStats", async () => {
    const cat = catService.create({ name: "Food" });
    await txService.create(tx({ categoryId: cat.id, amount: 5, date: "2026-03-01" }));
    budgetService.set({ categoryId: cat.id, month: "2026-03", amount: 100 });

    const { items } = reports.getBudgetStats(budgetStats());
    const foodStats = items.find((s) => s.categoryId === cat.id);
    expect(foodStats?.total).toBe(5);
    expect(foodStats?.budgetAmount).toBe(100);
  });

  it("returns inheritedFrom null when month has own budget rows", async () => {
    const cat = catService.create({ name: "Food" });
    budgetService.set({ categoryId: cat.id, month: "2026-03", amount: 500 });

    const { inheritedFrom } = reports.getBudgetStats(budgetStats());
    expect(inheritedFrom).toBeNull();
  });

  it("returns inherited budget from prior month when no own rows exist", async () => {
    const cat = catService.create({ name: "Food" });
    budgetService.set({ categoryId: cat.id, month: "2026-02", amount: 500 });

    const { items, inheritedFrom } = reports.getBudgetStats(budgetStats({ month: "2026-03" }));
    expect(inheritedFrom).toBe("2026-02");
    const foodStats = items.find((s) => s.categoryId === cat.id);
    expect(foodStats?.budgetAmount).toBe(500);
  });
});

// ─── trends ───────────────────────────────────────────────────────────────────

describe("trends", async () => {
  it("returns N month data points", async () => {
    const { points, currency } = reports.trends(TrendsSchema.parse({ months: 3 }));
    expect(points).toHaveLength(3);
    expect(currency).toBe("EUR");
  });

  it("returns 6 months by default", async () => {
    const { points } = reports.trends(TrendsSchema.parse({}));
    expect(points).toHaveLength(6);
  });

  it("sums transactions correctly for each month", async () => {
    await txService.create(tx({ amount: 1, date: "2026-03-01" }));
    await txService.create(tx({ amount: 2, date: "2026-03-15" }));
    await txService.create(tx({ amount: 0.5, date: "2026-02-10" }));

    const { points } = reports.trends(TrendsSchema.parse({ months: 6 }));
    const march = points.find((r) => r.month === "2026-03");
    const feb = points.find((r) => r.month === "2026-02");
    expect(march?.total).toBe(3);
    expect(march?.count).toBe(2);
    expect(feb?.total).toBe(0.5);
  });

  it("filters by categoryId when provided", async () => {
    const food = catService.create({ name: "Food" });
    await txService.create(tx({ amount: 5, categoryId: food.id, date: "2026-03-01" }));
    await txService.create(tx({ amount: 2, date: "2026-03-01" })); // different category

    const { points } = reports.trends(TrendsSchema.parse({ months: 3, categoryId: food.id }));
    const march = points.find((r) => r.month === "2026-03");
    expect(march?.total).toBe(5);
  });

  it("filters by type when provided", async () => {
    await txService.create(tx({ amount: 5, type: "expense", date: "2026-03-01" }));
    await txService.create(
      tx({ amount: 30, type: "income", date: "2026-03-15", description: "Salary" })
    );

    const expenses = reports.trends(TrendsSchema.parse({ months: 3, type: "expense" }));
    const march = expenses.points.find((r) => r.month === "2026-03");
    expect(march?.total).toBe(5);

    const income = reports.trends(TrendsSchema.parse({ months: 3, type: "income" }));
    const marchIncome = income.points.find((r) => r.month === "2026-03");
    expect(marchIncome?.total).toBe(30);
  });

  it("months are returned in ascending order", async () => {
    const { points } = reports.trends(TrendsSchema.parse({ months: 4 }));
    const months = points.map((r) => r.month);
    expect(months).toEqual([...months].sort());
  });
});

// ─── dailySpend ───────────────────────────────────────────────────────────────

describe("dailySpend", async () => {
  it("returns N day data points ending today, in ascending order", async () => {
    const { points, currency } = reports.dailySpend(DailySpendSchema.parse({ days: 7 }));
    expect(points).toHaveLength(7);
    expect(currency).toBe("EUR");
    expect(points[0].date).toBe("2026-03-09");
    expect(points[6].date).toBe("2026-03-15"); // today (clock pinned to 2026-03-15 UTC)
    const dates = points.map((p) => p.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("defaults to 365 days", async () => {
    const { points } = reports.dailySpend(DailySpendSchema.parse({}));
    expect(points).toHaveLength(365);
  });

  it("zero-spend days still appear with total 0 and count 0", async () => {
    await txService.create(tx({ amount: 7, date: "2026-03-12" }));

    const { points } = reports.dailySpend(DailySpendSchema.parse({ days: 5 }));
    const day12 = points.find((p) => p.date === "2026-03-12");
    const day13 = points.find((p) => p.date === "2026-03-13");
    expect(day12).toEqual({ date: "2026-03-12", total: 7, count: 1 });
    expect(day13).toEqual({ date: "2026-03-13", total: 0, count: 0 });
  });

  it("sums multiple expenses on the same day", async () => {
    await txService.create(tx({ amount: 3, date: "2026-03-10" }));
    await txService.create(tx({ amount: 4.5, date: "2026-03-10" }));
    await txService.create(tx({ amount: 2.25, date: "2026-03-10" }));

    const { points } = reports.dailySpend(DailySpendSchema.parse({ days: 10 }));
    const day = points.find((p) => p.date === "2026-03-10");
    expect(day?.total).toBe(9.75);
    expect(day?.count).toBe(3);
  });

  it("excludes income transactions", async () => {
    await txService.create(tx({ amount: 5, type: "expense", date: "2026-03-14" }));
    await txService.create(
      tx({ amount: 3000, type: "income", date: "2026-03-14", description: "Salary" })
    );

    const { points } = reports.dailySpend(DailySpendSchema.parse({ days: 3 }));
    const day = points.find((p) => p.date === "2026-03-14");
    expect(day?.total).toBe(5);
    expect(day?.count).toBe(1);
  });

  it("excludes transfer transactions", async () => {
    await txService.create(tx({ amount: 5, type: "expense", date: "2026-03-14" }));
    // Transfers are created via asset lots, but a synthetic transfer row would
    // also be excluded. The query filters on type='expense' explicitly, so
    // anything that isn't an expense (income, transfer) is dropped.
    const { points } = reports.dailySpend(DailySpendSchema.parse({ days: 3 }));
    const day = points.find((p) => p.date === "2026-03-14");
    expect(day?.total).toBe(5);
    expect(day?.count).toBe(1);
  });

  it("ignores transactions outside the window", async () => {
    await txService.create(tx({ amount: 100, date: "2026-02-01" })); // older than 7-day window
    await txService.create(tx({ amount: 5, date: "2026-03-13" }));

    const { points } = reports.dailySpend(DailySpendSchema.parse({ days: 7 }));
    const total = points.reduce((sum, p) => sum + p.total, 0);
    expect(total).toBe(5);
  });
});

// ─── netIncome ───────────────────────────────────────────────────────────────

describe("netIncome", async () => {
  it("returns zero when no transactions exist", async () => {
    const result = reports.netIncome({});
    expect(result.totalIncome).toBe(0);
    expect(result.totalExpenses).toBe(0);
    expect(result.netIncome).toBe(0);
    expect(result.transactionCount).toBe(0);
  });

  it("calculates income minus expenses", async () => {
    await txService.create(
      tx({ amount: 50, type: "income", date: "2026-03-01", description: "Salary" })
    );
    await txService.create(tx({ amount: 12, type: "expense", date: "2026-03-05" }));
    await txService.create(tx({ amount: 8, type: "expense", date: "2026-03-10" }));

    const result = reports.netIncome({});
    expect(result.totalIncome).toBe(50);
    expect(result.totalExpenses).toBe(20);
    expect(result.netIncome).toBe(30);
    expect(result.transactionCount).toBe(3);
  });

  it("filters by date range", async () => {
    await txService.create(
      tx({ amount: 50, type: "income", date: "2026-03-01", description: "Salary" })
    );
    await txService.create(tx({ amount: 10, type: "expense", date: "2026-03-15" }));
    await txService.create(tx({ amount: 20, type: "expense", date: "2026-04-01" }));

    const result = reports.netIncome({ dateFrom: "2026-03-01", dateTo: "2026-03-31" });
    expect(result.totalIncome).toBe(50);
    expect(result.totalExpenses).toBe(10);
    expect(result.netIncome).toBe(40);
    expect(result.transactionCount).toBe(2);
  });

  it("works with only dateFrom", async () => {
    await txService.create(tx({ amount: 5, type: "expense", date: "2026-02-15" }));
    await txService.create(tx({ amount: 3, type: "expense", date: "2026-03-15" }));

    const result = reports.netIncome({ dateFrom: "2026-03-01" });
    expect(result.totalExpenses).toBe(3);
    expect(result.transactionCount).toBe(1);
  });

  it("works with only dateTo", async () => {
    await txService.create(tx({ amount: 5, type: "expense", date: "2026-02-15" }));
    await txService.create(tx({ amount: 3, type: "expense", date: "2026-03-15" }));

    const result = reports.netIncome({ dateTo: "2026-02-28" });
    expect(result.totalExpenses).toBe(5);
    expect(result.transactionCount).toBe(1);
  });

  it("returns negative balance when expenses exceed income", async () => {
    await txService.create(
      tx({ amount: 10, type: "income", date: "2026-03-01", description: "Salary" })
    );
    await txService.create(tx({ amount: 30, type: "expense", date: "2026-03-05" }));

    const result = reports.netIncome({});
    expect(result.netIncome).toBe(-20);
  });
});

// ─── topMerchants ─────────────────────────────────────────────────────────────

describe("topMerchants", async () => {
  beforeEach(async () => {
    await txService.create(tx({ amount: 10, merchant: "ALDI", date: "2026-03-01" }));
    await txService.create(tx({ amount: 5, merchant: "ALDI", date: "2026-03-05" }));
    await txService.create(tx({ amount: 8, merchant: "Lidl", date: "2026-03-10" }));
    await txService.create(tx({ amount: 3, date: "2026-03-15" })); // no merchant
  });

  it("returns merchants sorted by total descending", async () => {
    const { merchants, currency } = reports.topMerchants(
      TopMerchantsSchema.parse({ dateFrom: "2026-03-01", dateTo: "2026-03-31" })
    );
    expect(currency).toBe("EUR");
    expect(merchants[0].merchant).toBe("ALDI");
    expect(merchants[0].total).toBe(15);
    expect(merchants[0].count).toBe(2);
  });

  it("excludes transactions without a merchant", async () => {
    const { merchants } = reports.topMerchants(
      TopMerchantsSchema.parse({ dateFrom: "2026-03-01", dateTo: "2026-03-31" })
    );
    expect(merchants.every((r) => r.merchant !== null)).toBe(true);
    expect(merchants).toHaveLength(2);
  });

  it("respects the limit parameter", async () => {
    const { merchants } = reports.topMerchants(
      TopMerchantsSchema.parse({ dateFrom: "2026-03-01", dateTo: "2026-03-31", limit: 1 })
    );
    expect(merchants).toHaveLength(1);
    expect(merchants[0].merchant).toBe("ALDI");
  });

  it("computes avgAmount correctly", async () => {
    const { merchants } = reports.topMerchants(
      TopMerchantsSchema.parse({ dateFrom: "2026-03-01", dateTo: "2026-03-31" })
    );
    const aldi = merchants.find((r) => r.merchant === "ALDI");
    expect(aldi?.avgAmount).toBe(7.5); // (10 + 5) / 2
  });

  it("returns all-time results when no dates are provided", async () => {
    const { merchants } = reports.topMerchants(TopMerchantsSchema.parse({}));
    expect(merchants).toHaveLength(2);
    expect(merchants[0].merchant).toBe("ALDI");
    expect(merchants[0].total).toBe(15);
  });
});

// ─── Transfer exclusion ───────────────────────────────────────────────────────

describe("transfer exclusion from spending reports", async () => {
  beforeEach(async () => {
    await txService.create(tx({ amount: 50, type: "expense", description: "Rent" }));
    await txService.create(tx({ amount: 100, type: "income", description: "Salary" }));
    await txService.create(
      tx({ amount: 30, type: "transfer", description: "Buy ETF", merchant: "Broker" })
    );
  });

  it("spendingSummary type=all excludes transfers", async () => {
    const result = reports.spendingSummary(
      SpendingSummarySchema.parse({
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
        groupBy: "category",
        type: "all",
      })
    );
    expect(result.period.total).toBe(150); // expense + income, not transfer
    expect(result.period.count).toBe(2);
  });

  it("spendingSummary type=expense excludes transfers", async () => {
    const result = reports.spendingSummary(
      SpendingSummarySchema.parse({
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
        groupBy: "category",
        type: "expense",
      })
    );
    expect(result.period.total).toBe(50);
  });

  it("trends type=all excludes transfers", async () => {
    const { points } = reports.trends(TrendsSchema.parse({ months: 1, type: "all" }));
    const march = points.find((r) => r.month === "2026-03");
    expect(march?.total).toBe(150); // expense + income only
  });

  it("topMerchants excludes transfer transactions", async () => {
    const { merchants } = reports.topMerchants(
      TopMerchantsSchema.parse({ dateFrom: "2026-03-01", dateTo: "2026-03-31", type: "all" })
    );
    // Broker transaction is a transfer — should not appear
    const broker = merchants.find((r) => r.merchant === "Broker");
    expect(broker).toBeUndefined();
  });
});
