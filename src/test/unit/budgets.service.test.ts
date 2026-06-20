// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { makeTestDb } from "../helpers";
import { BudgetService } from "@/lib/services/budgets";
import { CategoryService } from "@/lib/services/categories";
import { TransactionService } from "@/lib/services/transactions";
import { ReportService } from "@/lib/services/reports";
import { SetBudgetSchema, GetBudgetStatusSchema } from "@/lib/validators/budgets";
import { CreateTransactionSchema } from "@/lib/validators/transactions";

type TestDb = ReturnType<typeof makeTestDb>;

let db: TestDb;
let budgetService: BudgetService;
let catService: CategoryService;
let txService: TransactionService;

let foodId: number;
let transportId: number;

// Pin clock to March 2026 — test data uses March dates
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.UTC(2026, 2, 15)));
  db = makeTestDb();
  budgetService = new BudgetService(db, new ReportService(db));
  catService = new CategoryService(db);
  txService = new TransactionService(db);

  foodId = catService.create({ name: "Food" }).id;
  transportId = catService.create({ name: "Transport" }).id;
});

afterEach(() => {
  vi.useRealTimers();
});

function tx(overrides: Record<string, unknown> = {}) {
  return CreateTransactionSchema.parse({
    amount: 10,
    description: "Test",
    date: "2026-03-15",
    ...overrides,
  });
}

// ─── set ──────────────────────────────────────────────────────────────────────

describe("set", async () => {
  it("creates a new budget", async () => {
    const result = budgetService.set(
      SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 500 })
    );
    expect(result.id).toBeGreaterThan(0);
    expect(result.amount).toBe(500);
    expect(result.month).toBe("2026-03");
  });

  it("updates an existing budget for the same category+month", async () => {
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 500 }));
    const updated = budgetService.set(
      SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 600 })
    );
    expect(updated.amount).toBe(600);
    expect(budgetService.listForCategory(foodId)).toHaveLength(1);
  });

  it("materializes inherited budgets before setting when month has no own rows", async () => {
    // Set March budgets
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 500 }));
    budgetService.set(
      SetBudgetSchema.parse({ categoryId: transportId, month: "2026-03", amount: 200 })
    );

    // Set only Food in April — should also copy Transport from March
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-04", amount: 550 }));

    const april = budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-04" }));
    expect(april.inheritedFrom).toBeNull(); // April now has own rows
    expect(april.items).toHaveLength(2); // Food + Transport
    const food = april.items.find((r) => r.categoryName === "Food");
    const transport = april.items.find((r) => r.categoryName === "Transport");
    expect(food?.budgetAmount).toBe(550); // updated
    expect(transport?.budgetAmount).toBe(200); // copied from March
  });

  it("re-sets a soft-deleted budget to active", async () => {
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 500 }));
    budgetService.delete(foodId, "2026-03");

    // Verify it's gone
    let result = budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-03" }));
    expect(result.items.find((r) => r.categoryName === "Food")).toBeUndefined();

    // Re-set it
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 700 }));
    result = budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-03" }));
    const food = result.items.find((r) => r.categoryName === "Food");
    expect(food?.budgetAmount).toBe(700);
  });
});

// ─── getForMonth ──────────────────────────────────────────────────────────────

describe("getForMonth", async () => {
  beforeEach(async () => {
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 500 }));
    budgetService.set(
      SetBudgetSchema.parse({ categoryId: transportId, month: "2026-03", amount: 200 })
    );

    await txService.create(
      tx({ amount: 200, categoryId: foodId, type: "expense", date: "2026-03-05" })
    );
    await txService.create(
      tx({ amount: 100, categoryId: foodId, type: "expense", date: "2026-03-20" })
    );
    await txService.create(
      tx({ amount: 250, categoryId: transportId, type: "expense", date: "2026-03-10" })
    );
    await txService.create(
      tx({ amount: 50, categoryId: foodId, type: "income", date: "2026-03-15" })
    );
  });

  it("returns budget status for all categories in the month", async () => {
    const { items } = budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-03" }));
    expect(items).toHaveLength(2);
  });

  it("returns inheritedFrom null when month has own rows", async () => {
    const { inheritedFrom } = budgetService.getForMonth(
      GetBudgetStatusSchema.parse({ month: "2026-03" })
    );
    expect(inheritedFrom).toBeNull();
  });

  it("returns inherited budgets for months with no own rows", async () => {
    const { items, inheritedFrom } = budgetService.getForMonth(
      GetBudgetStatusSchema.parse({ month: "2026-04" })
    );
    expect(inheritedFrom).toBe("2026-03");
    expect(items).toHaveLength(2);
  });

  it("browsing an inherited month does not create rows", async () => {
    budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-04" }));
    expect(budgetService.hasOwnRows("2026-04")).toBe(false);
  });

  it("calculates spentAmount correctly (expense only)", async () => {
    const { items } = budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-03" }));
    const food = items.find((r) => r.categoryName === "Food");
    expect(food?.spentAmount).toBe(300);
    expect(food?.budgetAmount).toBe(500);
    expect(food?.remainingAmount).toBe(200);
    expect(food?.isOver).toBe(false);
  });

  it("marks over-budget categories correctly", async () => {
    const { items } = budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-03" }));
    const transport = items.find((r) => r.categoryName === "Transport");
    expect(transport?.isOver).toBe(true);
    expect(transport?.remainingAmount).toBe(-50);
    expect(transport?.percentUsed).toBeGreaterThan(100);
  });

  it("returns 0 spentAmount for categories with no transactions", async () => {
    const other = catService.create({ name: "Other" });
    budgetService.set(
      SetBudgetSchema.parse({ categoryId: other.id, month: "2026-03", amount: 100 })
    );
    const { items } = budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-03" }));
    const otherStatus = items.find((r) => r.categoryName === "Other");
    expect(otherStatus?.spentAmount).toBe(0);
    expect(otherStatus?.isOver).toBe(false);
  });

  it("does not include transactions from other months", async () => {
    await txService.create(
      tx({ amount: 999.99, categoryId: foodId, type: "expense", date: "2026-02-28" })
    );
    const { items } = budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-03" }));
    const food = items.find((r) => r.categoryName === "Food");
    expect(food?.spentAmount).toBe(300);
  });

  it("includes child category spend in parent budget (rollup)", async () => {
    const groceries = catService.create({ name: "Groceries", parentId: foodId });
    const restaurants = catService.create({ name: "Restaurants", parentId: foodId });

    await txService.create(
      tx({ amount: 50, categoryId: groceries.id, type: "expense", date: "2026-03-12" })
    );
    await txService.create(
      tx({ amount: 30, categoryId: restaurants.id, type: "expense", date: "2026-03-18" })
    );

    const { items } = budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-03" }));
    const food = items.find((r) => r.categoryName === "Food");
    expect(food?.spentAmount).toBe(380);
  });

  it("includes deeply nested child spend in rollup", async () => {
    const groceries = catService.create({ name: "Groceries", parentId: foodId });
    const organic = catService.create({ name: "Organic", parentId: groceries.id });

    await txService.create(
      tx({ amount: 20, categoryId: organic.id, type: "expense", date: "2026-03-10" })
    );

    const { items } = budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-03" }));
    const food = items.find((r) => r.categoryName === "Food");
    expect(food?.spentAmount).toBe(320);
  });

  it("returns empty result when no budgets exist anywhere", async () => {
    const newDb = makeTestDb();
    const emptyService = new BudgetService(newDb, new ReportService(newDb));
    const { items, inheritedFrom } = emptyService.getForMonth(
      GetBudgetStatusSchema.parse({ month: "2026-03" })
    );
    expect(items).toHaveLength(0);
    expect(inheritedFrom).toBeNull();
  });
});

// ─── inheritance ─────────────────────────────────────────────────────────────

describe("inheritance", async () => {
  it("inherits budgets across multiple months", async () => {
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-01", amount: 500 }));

    // Feb and Mar have no own rows — both should inherit from Jan
    const feb = budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-02" }));
    expect(feb.inheritedFrom).toBe("2026-01");
    expect(feb.items[0].budgetAmount).toBe(500);

    const mar = budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-03" }));
    expect(mar.inheritedFrom).toBe("2026-01");
  });

  it("soft-deleted budget propagates to inherited months", async () => {
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 500 }));
    budgetService.set(
      SetBudgetSchema.parse({ categoryId: transportId, month: "2026-03", amount: 200 })
    );
    // Soft-delete Transport in March
    budgetService.delete(transportId, "2026-03");

    // April should inherit from March, without Transport
    const april = budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-04" }));
    expect(april.inheritedFrom).toBe("2026-03");
    expect(april.items).toHaveLength(1);
    expect(april.items[0].categoryName).toBe("Food");
  });

  it("materializing creates independent rows for the month", async () => {
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 500 }));

    // Trigger materialization by setting a budget in April
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-04", amount: 600 }));

    expect(budgetService.hasOwnRows("2026-04")).toBe(true);
    expect(budgetService.hasOwnRows("2026-05")).toBe(false);
  });
});

// ─── delete ───────────────────────────────────────────────────────────────────

describe("delete", async () => {
  it("soft-deletes a budget (removes from getForMonth results)", async () => {
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 500 }));
    expect(budgetService.delete(foodId, "2026-03")).toBe(true);
    const { items } = budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-03" }));
    expect(items.find((r) => r.categoryName === "Food")).toBeUndefined();
  });

  it("keeps the row (month remains initialized, not re-inherited)", async () => {
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 500 }));
    budgetService.set(
      SetBudgetSchema.parse({ categoryId: transportId, month: "2026-03", amount: 200 })
    );
    budgetService.delete(foodId, "2026-03");

    // March still has own rows (Transport is there)
    expect(budgetService.hasOwnRows("2026-03")).toBe(true);
  });

  it("materializes inherited budgets before deleting when month has no own rows", async () => {
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 500 }));
    budgetService.set(
      SetBudgetSchema.parse({ categoryId: transportId, month: "2026-03", amount: 200 })
    );

    // Delete Food from April (which has no own rows) — should materialize then soft-delete
    budgetService.delete(foodId, "2026-04");

    expect(budgetService.hasOwnRows("2026-04")).toBe(true);
    const april = budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-04" }));
    expect(april.inheritedFrom).toBeNull();
    expect(april.items).toHaveLength(1);
    expect(april.items[0].categoryName).toBe("Transport");
  });

  it("returns false for non-existent budget in a month with no inheritance", async () => {
    expect(budgetService.delete(foodId, "2026-03")).toBe(false);
  });
});

// ─── resetToInherited ─────────────────────────────────────────────────────────

describe("resetToInherited", async () => {
  it("hard-deletes all rows for the month, falling back to inheritance", async () => {
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 500 }));
    // Mutate April to give it own rows
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-04", amount: 600 }));

    expect(budgetService.hasOwnRows("2026-04")).toBe(true);

    budgetService.resetToInherited("2026-04");

    expect(budgetService.hasOwnRows("2026-04")).toBe(false);
    const april = budgetService.getForMonth(GetBudgetStatusSchema.parse({ month: "2026-04" }));
    expect(april.inheritedFrom).toBe("2026-03");
    expect(april.items[0].budgetAmount).toBe(500); // back to March's value
  });
});

// ─── listForCategory ─────────────────────────────────────────────────────────

describe("listForCategory", async () => {
  it("returns active budgets for a category sorted by month", async () => {
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 500 }));
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-01", amount: 400 }));
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-02", amount: 450 }));

    const budgets = budgetService.listForCategory(foodId);
    expect(budgets).toHaveLength(3);
    expect(budgets.map((b) => b.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(budgets.map((b) => b.amount)).toEqual([400, 450, 500]);
  });

  it("excludes soft-deleted budgets", async () => {
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 500 }));
    budgetService.delete(foodId, "2026-03");
    expect(budgetService.listForCategory(foodId)).toHaveLength(0);
  });

  it("returns empty array for category with no budgets", async () => {
    expect(budgetService.listForCategory(foodId)).toHaveLength(0);
  });

  it("does not return budgets from other categories", async () => {
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 500 }));
    budgetService.set(
      SetBudgetSchema.parse({ categoryId: transportId, month: "2026-03", amount: 200 })
    );

    const foodBudgets = budgetService.listForCategory(foodId);
    expect(foodBudgets).toHaveLength(1);
    expect(foodBudgets[0].amount).toBe(500);
  });
});

// ─── getHistory ──────────────────────────────────────────────────────────────

describe("getHistory", async () => {
  it("returns one point per month", async () => {
    budgetService.set(SetBudgetSchema.parse({ categoryId: foodId, month: "2026-03", amount: 500 }));
    await txService.create(
      tx({ categoryId: foodId, amount: 200, type: "expense", date: "2026-03-10" })
    );

    const points = budgetService.getHistory(1);
    expect(points).toHaveLength(1);
    expect(points[0].month).toBe("2026-03");
    expect(points[0].totalBudget).toBe(500);
    expect(points[0].totalSpent).toBe(200);
    expect(points[0].percentUsed).toBeCloseTo(40, 0);
  });

  it("returns zero values when no budgets exist", async () => {
    const points = budgetService.getHistory(2);
    expect(points).toHaveLength(2);
    expect(points[0].totalBudget).toBe(0);
    expect(points[0].totalSpent).toBe(0);
    expect(points[0].percentUsed).toBe(0);
  });
});
