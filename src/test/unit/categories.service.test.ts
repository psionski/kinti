// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb } from "../helpers";
import { CategoryService } from "@/lib/services/categories";
import { TransactionService } from "@/lib/services/transactions";
import { CreateTransactionSchema } from "@/lib/validators/transactions";
import { MergeCategoriesSchema } from "@/lib/validators/categories";

type TestDb = ReturnType<typeof makeTestDb>;

let db: TestDb;
let categoryService: CategoryService;
let txService: TransactionService;

beforeEach(() => {
  db = makeTestDb();
  categoryService = new CategoryService(db);
  txService = new TransactionService(db);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tx(overrides: Record<string, unknown> = {}) {
  return CreateTransactionSchema.parse({
    amount: 1000,
    description: "Test transaction",
    date: "2026-03-17",
    ...overrides,
  });
}

// ─── create ───────────────────────────────────────────────────────────────────

describe("create", async () => {
  it("creates a category and returns it with an id", async () => {
    const cat = categoryService.create({ name: "Groceries" });
    expect(cat.id).toBeGreaterThan(0);
    expect(cat.name).toBe("Groceries");
  });

  it("creates a category with optional fields", async () => {
    const cat = categoryService.create({ name: "Food", icon: "🍕", color: "#FF5733" });
    expect(cat.icon).toBe("🍕");
    expect(cat.color).toBe("#FF5733");
  });

  it("creates a child category with parentId", async () => {
    const parent = categoryService.create({ name: "Food" });
    const child = categoryService.create({ name: "Groceries", parentId: parent.id });
    expect(child.parentId).toBe(parent.id);
  });

  it("throws on duplicate name", async () => {
    categoryService.create({ name: "Unique" });
    expect(() => categoryService.create({ name: "Unique" })).toThrow();
  });
});

// ─── getAll ───────────────────────────────────────────────────────────────────

describe("getAll", async () => {
  it("returns empty array when no categories exist", async () => {
    expect(categoryService.getAll()).toEqual([]);
  });

  it("returns all categories", async () => {
    categoryService.create({ name: "A" });
    categoryService.create({ name: "B" });
    categoryService.create({ name: "C" });
    expect(categoryService.getAll()).toHaveLength(3);
  });

  it("includes transactionCount for each category", async () => {
    const cat = categoryService.create({ name: "Groceries" });
    await txService.create(tx({ categoryId: cat.id }));
    await txService.create(tx({ categoryId: cat.id }));

    const all = categoryService.getAll();
    const found = all.find((c) => c.id === cat.id);
    expect(found?.transactionCount).toBe(2);
  });

  it("returns transactionCount 0 for categories with no transactions", async () => {
    const cat = categoryService.create({ name: "Empty" });
    const all = categoryService.getAll();
    const found = all.find((c) => c.id === cat.id);
    expect(found?.transactionCount).toBe(0);
  });
});

// ─── getById ──────────────────────────────────────────────────────────────────

describe("getById", async () => {
  it("returns the category by id", async () => {
    const created = categoryService.create({ name: "Transport" });
    const found = categoryService.getById(created.id);
    expect(found?.name).toBe("Transport");
  });

  it("returns null for non-existent id", async () => {
    expect(categoryService.getById(9999)).toBeNull();
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe("update", async () => {
  it("updates the name", async () => {
    const cat = categoryService.create({ name: "Old Name" });
    const updated = categoryService.update(cat.id, { name: "New Name" });
    expect(updated?.name).toBe("New Name");
  });

  it("updates icon and color", async () => {
    const cat = categoryService.create({ name: "Test" });
    const updated = categoryService.update(cat.id, { icon: "🏠", color: "#AABBCC" });
    expect(updated?.icon).toBe("🏠");
    expect(updated?.color).toBe("#AABBCC");
  });

  it("clears parentId when set to null", async () => {
    const parent = categoryService.create({ name: "Parent" });
    const child = categoryService.create({ name: "Child", parentId: parent.id });
    const updated = categoryService.update(child.id, { parentId: null });
    expect(updated?.parentId).toBeNull();
  });

  it("does not change fields not included in the update", async () => {
    const cat = categoryService.create({ name: "Test", icon: "🎯" });
    const updated = categoryService.update(cat.id, { name: "Updated" });
    expect(updated?.icon).toBe("🎯");
  });

  it("returns null for non-existent id", async () => {
    expect(categoryService.update(9999, { name: "X" })).toBeNull();
  });
});

// ─── delete ───────────────────────────────────────────────────────────────────

describe("delete", async () => {
  it("deletes an existing category and returns true", async () => {
    const cat = categoryService.create({ name: "ToDelete" });
    expect(categoryService.delete(cat.id)).toBe(true);
    expect(categoryService.getById(cat.id)).toBeNull();
  });

  it("returns false for non-existent id", async () => {
    expect(categoryService.delete(9999)).toBe(false);
  });

  it("sets categoryId to null on associated transactions (ON DELETE SET NULL)", async () => {
    const cat = categoryService.create({ name: "Food" });
    const t = await txService.create(tx({ categoryId: cat.id }));
    categoryService.delete(cat.id);
    const found = txService.getById(t.id);
    expect(found?.categoryId).toBeNull();
  });

  it("sets parentId to null on child categories (ON DELETE SET NULL)", async () => {
    const parent = categoryService.create({ name: "Parent" });
    const child = categoryService.create({ name: "Child", parentId: parent.id });
    categoryService.delete(parent.id);
    const foundChild = categoryService.getById(child.id);
    expect(foundChild?.parentId).toBeNull();
  });
});

// ─── recategorize ─────────────────────────────────────────────────────────────

describe("recategorize", async () => {
  it("moves transactions from source to target category", async () => {
    const source = categoryService.create({ name: "Source" });
    const target = categoryService.create({ name: "Target" });
    await txService.create(tx({ categoryId: source.id }));
    await txService.create(tx({ categoryId: source.id }));

    const count = categoryService.recategorize({
      targetCategoryId: target.id,
      sourceCategoryId: source.id,
    });

    expect(count).toBe(2);
    const sourceTxs = txService.list({
      categoryId: source.id,
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "desc",
    });
    expect(sourceTxs.total).toBe(0);
  });

  it("filters by merchant pattern", async () => {
    const target = categoryService.create({ name: "Target" });
    await txService.create(tx({ merchant: "ALDI" }));
    await txService.create(tx({ merchant: "Lidl" }));
    await txService.create(tx({ merchant: "REWE" }));

    // "LDI" appears as a substring in "ALDI" (case-insensitive LIKE); "Lidl" = L-i-d-l, no "ldi" substring
    const count = categoryService.recategorize({
      targetCategoryId: target.id,
      merchantPattern: "LDI",
    });

    expect(count).toBe(1);
  });

  it("filters by description pattern", async () => {
    const target = categoryService.create({ name: "Target" });
    await txService.create(tx({ description: "Weekly groceries" }));
    await txService.create(tx({ description: "Monthly rent" }));
    await txService.create(tx({ description: "Weekly coffee" }));

    const count = categoryService.recategorize({
      targetCategoryId: target.id,
      descriptionPattern: "Weekly",
    });

    expect(count).toBe(2);
  });

  it("filters by date range", async () => {
    const target = categoryService.create({ name: "Target" });
    await txService.create(tx({ date: "2026-01-15" }));
    await txService.create(tx({ date: "2026-02-15" }));
    await txService.create(tx({ date: "2026-03-15" }));

    const count = categoryService.recategorize({
      targetCategoryId: target.id,
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
    });

    expect(count).toBe(1);
  });

  it("dryRun returns count without modifying data", async () => {
    const source = categoryService.create({ name: "Source" });
    const target = categoryService.create({ name: "Target" });
    await txService.create(tx({ categoryId: source.id }));
    await txService.create(tx({ categoryId: source.id }));

    const count = categoryService.recategorize({
      targetCategoryId: target.id,
      sourceCategoryId: source.id,
      dryRun: true,
    });

    expect(count).toBe(2);
    // Verify no data was modified
    const sourceTxs = txService.list({
      categoryId: source.id,
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "desc",
    });
    expect(sourceTxs.total).toBe(2);
  });

  it("returns 0 when no transactions match the filter", async () => {
    const target = categoryService.create({ name: "Target" });
    await txService.create(tx({ description: "Coffee" }));

    const count = categoryService.recategorize({
      targetCategoryId: target.id,
      descriptionPattern: "nomatch12345",
    });

    expect(count).toBe(0);
  });
});

// ─── merge ────────────────────────────────────────────────────────────────────

describe("merge", async () => {
  it("moves all transactions from source to target and returns counts", async () => {
    const source = categoryService.create({ name: "Source" });
    const target = categoryService.create({ name: "Target" });
    await txService.create(tx({ categoryId: source.id, description: "A" }));
    await txService.create(tx({ categoryId: source.id, description: "B" }));
    await txService.create(tx({ categoryId: target.id, description: "C" }));

    const result = categoryService.merge({
      sourceCategoryId: source.id,
      targetCategoryId: target.id,
    });

    expect(result.merged).toBe(true);
    expect(result.transactionsMoved).toBe(2);
    expect(result.sourceCategoryName).toBe("Source");
    expect(result.targetCategoryName).toBe("Target");

    const targetTxs = txService.list({
      categoryId: target.id,
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "desc",
    });
    expect(targetTxs.total).toBe(3);
  });

  it("deletes the source category", async () => {
    const source = categoryService.create({ name: "Source" });
    const target = categoryService.create({ name: "Target" });

    categoryService.merge({ sourceCategoryId: source.id, targetCategoryId: target.id });

    expect(categoryService.getById(source.id)).toBeNull();
  });

  it("target category still exists after merge", async () => {
    const source = categoryService.create({ name: "Source" });
    const target = categoryService.create({ name: "Target" });

    categoryService.merge({ sourceCategoryId: source.id, targetCategoryId: target.id });

    expect(categoryService.getById(target.id)).not.toBeNull();
  });

  it("throws when source category does not exist", async () => {
    const target = categoryService.create({ name: "Target" });
    expect(() =>
      categoryService.merge({ sourceCategoryId: 9999, targetCategoryId: target.id })
    ).toThrow("Source category 9999 not found");
  });

  it("throws when target category does not exist", async () => {
    const source = categoryService.create({ name: "Source" });
    expect(() =>
      categoryService.merge({ sourceCategoryId: source.id, targetCategoryId: 9999 })
    ).toThrow("Target category 9999 not found");
  });

  it("rejects self-merge at the validator level", async () => {
    const result = MergeCategoriesSchema.safeParse({
      sourceCategoryId: 5,
      targetCategoryId: 5,
    });
    expect(result.success).toBe(false);
  });

  it("no transactions remain under deleted source category", async () => {
    const source = categoryService.create({ name: "Source" });
    const target = categoryService.create({ name: "Target" });
    await txService.create(tx({ categoryId: source.id }));

    categoryService.merge({ sourceCategoryId: source.id, targetCategoryId: target.id });

    const sourceTxs = txService.list({
      categoryId: source.id,
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "desc",
    });
    expect(sourceTxs.total).toBe(0);
  });
});
