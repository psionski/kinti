// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb } from "../helpers";
import { TransactionService } from "@/lib/services/transactions";
import { CreateTransactionSchema, ListTransactionsSchema } from "@/lib/validators/transactions";
import { receipts, categories } from "@/lib/db/schema";

type TestDb = ReturnType<typeof makeTestDb>;

let db: TestDb;
let service: TransactionService;

beforeEach(async () => {
  db = makeTestDb();
  service = new TransactionService(db);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tx(overrides: Record<string, unknown> = {}) {
  return CreateTransactionSchema.parse({
    amount: 10,
    description: "Test transaction",
    date: "2026-03-17",
    ...overrides,
  });
}

function listInput(overrides: Record<string, unknown> = {}) {
  return ListTransactionsSchema.parse(overrides);
}

// ─── create ───────────────────────────────────────────────────────────────────

describe("create", async () => {
  it("creates a transaction and returns it with an id", async () => {
    const result = await service.create(tx());
    expect(result.id).toBeGreaterThan(0);
    expect(result.amount).toBe(10);
    expect(result.description).toBe("Test transaction");
    expect(result.type).toBe("expense");
  });

  it("parses tags from JSON to string array", async () => {
    const result = await service.create(tx({ tags: ["food", "daily"] }));
    expect(result.tags).toEqual(["food", "daily"]);
  });

  it("returns null tags when none provided", async () => {
    const result = await service.create(tx());
    expect(result.tags).toBeNull();
  });

  it("creates an income transaction", async () => {
    const result = await service.create(tx({ type: "income", amount: 2000 }));
    expect(result.type).toBe("income");
  });
});

// ─── createBatch ──────────────────────────────────────────────────────────────

describe("createBatch", async () => {
  it("inserts all transactions in the batch", async () => {
    const result = await service.createBatch({
      transactions: [
        tx({ amount: 1, description: "A" }),
        tx({ amount: 2, description: "B" }),
        tx({ amount: 3, description: "C" }),
      ],
    });
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.amount)).toEqual([1, 2, 3]);
  });

  it("applies receiptId from batch-level to all items", async () => {
    // Insert a real receipt to satisfy the FK constraint
    const [receipt] = db.insert(receipts).values({ date: "2026-03-17" }).returning().all();
    const result = await service.createBatch({
      transactions: [tx({ amount: 5 }), tx({ amount: 6 })],
      receiptId: receipt.id,
    });
    expect(result.every((r) => r.receiptId === receipt.id)).toBe(true);
  });

  it("item-level receiptId takes precedence over batch-level", async () => {
    const [r1] = db.insert(receipts).values({ date: "2026-03-17" }).returning().all();
    const [r2] = db.insert(receipts).values({ date: "2026-03-17" }).returning().all();
    const result = await service.createBatch({
      transactions: [tx({ amount: 5, receiptId: r1.id })],
      receiptId: r2.id,
    });
    expect(result[0].receiptId).toBe(r1.id);
  });
});

// ─── getById ──────────────────────────────────────────────────────────────────

describe("getById", async () => {
  it("returns the transaction by id", async () => {
    const created = await service.create(tx({ description: "Find me" }));
    const found = service.getById(created.id);
    expect(found).not.toBeNull();
    expect(found!.description).toBe("Find me");
  });

  it("returns null for non-existent id", async () => {
    expect(service.getById(9999)).toBeNull();
  });
});

// ─── list — basic pagination ──────────────────────────────────────────────────

describe("list", async () => {
  beforeEach(async () => {
    await service.create(
      tx({ amount: 1, description: "Groceries", merchant: "ALDI", date: "2026-01-10" })
    );
    await service.create(
      tx({ amount: 2, description: "Coffee", merchant: "Starbucks", date: "2026-02-15" })
    );
    await service.create(
      tx({ amount: 3, description: "Rent", date: "2026-03-01", type: "expense" })
    );
    await service.create(
      tx({ amount: 5, description: "Salary", type: "income", date: "2026-03-01" })
    );
  });

  it("returns all transactions with correct total", async () => {
    const result = service.list(listInput());
    expect(result.total).toBe(4);
    expect(result.data).toHaveLength(4);
    expect(result.hasMore).toBe(false);
  });

  it("paginates correctly", async () => {
    const result = service.list(listInput({ limit: 2, offset: 0 }));
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(4);
    expect(result.hasMore).toBe(true);
  });

  it("second page returns remaining items", async () => {
    const result = service.list(listInput({ limit: 2, offset: 2 }));
    expect(result.data).toHaveLength(2);
    expect(result.hasMore).toBe(false);
  });

  it("filters by type", async () => {
    const result = service.list(listInput({ type: "income" }));
    expect(result.total).toBe(1);
    expect(result.data[0].description).toBe("Salary");
  });

  it("filters by dateFrom", async () => {
    const result = service.list(listInput({ dateFrom: "2026-03-01" }));
    expect(result.total).toBe(2);
  });

  it("filters by dateTo", async () => {
    const result = service.list(listInput({ dateTo: "2026-01-31" }));
    expect(result.total).toBe(1);
    expect(result.data[0].description).toBe("Groceries");
  });

  it("filters by date range", async () => {
    const result = service.list(listInput({ dateFrom: "2026-02-01", dateTo: "2026-02-28" }));
    expect(result.total).toBe(1);
    expect(result.data[0].description).toBe("Coffee");
  });

  it("filters by amountMin", async () => {
    const result = service.list(listInput({ amountMin: 3 }));
    expect(result.total).toBe(2);
  });

  it("filters by amountMax", async () => {
    const result = service.list(listInput({ amountMax: 2 }));
    expect(result.total).toBe(2);
  });

  it("filters by merchant (partial match)", async () => {
    const result = service.list(listInput({ merchant: "star" }));
    expect(result.total).toBe(1);
    expect(result.data[0].merchant).toBe("Starbucks");
  });

  it("sorts by amount asc", async () => {
    const result = service.list(listInput({ sortBy: "amount", sortOrder: "asc" }));
    const amounts = result.data.map((r) => r.amount);
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
  });

  it("sorts by date desc (default)", async () => {
    const result = service.list(listInput());
    const dates = result.data.map((r) => r.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

// ─── list — categoryId filter ─────────────────────────────────────────────────

describe("list — categoryId filter", async () => {
  it("filters for uncategorized transactions when categoryId is null", async () => {
    const [cat] = db.insert(categories).values({ name: "Food" }).returning().all();
    await service.create(tx({ description: "Categorized", categoryId: cat.id }));
    await service.create(tx({ description: "Uncategorized" }));

    const result = service.list(listInput({ categoryId: null }));
    expect(result.total).toBe(1);
    expect(result.data[0].description).toBe("Uncategorized");
  });

  it("filters by a specific categoryId", async () => {
    const [cat] = db.insert(categories).values({ name: "Transport" }).returning().all();
    await service.create(tx({ description: "Bus", categoryId: cat.id }));
    await service.create(tx({ description: "Groceries" }));

    const result = service.list(listInput({ categoryId: cat.id }));
    expect(result.total).toBe(1);
    expect(result.data[0].description).toBe("Bus");
  });

  it("includes child category transactions when filtering by parent", async () => {
    const [parent] = db.insert(categories).values({ name: "Food" }).returning().all();
    const [child] = db
      .insert(categories)
      .values({ name: "Groceries", parentId: parent.id })
      .returning()
      .all();
    const [grandchild] = db
      .insert(categories)
      .values({ name: "Organic", parentId: child.id })
      .returning()
      .all();

    await service.create(tx({ description: "Parent tx", categoryId: parent.id }));
    await service.create(tx({ description: "Child tx", categoryId: child.id }));
    await service.create(tx({ description: "Grandchild tx", categoryId: grandchild.id }));
    await service.create(tx({ description: "Unrelated" }));

    const result = service.list(listInput({ categoryId: parent.id }));
    expect(result.total).toBe(3);
    const descs = result.data.map((r) => r.description).sort();
    expect(descs).toEqual(["Child tx", "Grandchild tx", "Parent tx"]);
  });
});

// ─── list — FTS search ────────────────────────────────────────────────────────

describe("list — FTS search", async () => {
  beforeEach(async () => {
    await service.create(tx({ description: "Supermarket weekly shop", merchant: "ALDI" }));
    await service.create(tx({ description: "Coffee and cake", merchant: "Bakehouse" }));
    await service.create(tx({ description: "Monthly subscription", merchant: "Netflix" }));
  });

  it("finds transactions matching description keyword", async () => {
    const result = service.list(listInput({ search: "supermarket" }));
    expect(result.total).toBe(1);
    expect(result.data[0].merchant).toBe("ALDI");
  });

  it("finds transactions matching merchant keyword", async () => {
    const result = service.list(listInput({ search: "Netflix" }));
    expect(result.total).toBe(1);
    expect(result.data[0].description).toBe("Monthly subscription");
  });

  it("returns empty when no match", async () => {
    const result = service.list(listInput({ search: "nomatch12345" }));
    expect(result.total).toBe(0);
  });

  it("finds transactions by prefix (partial word)", async () => {
    const result = service.list(listInput({ search: "cof" }));
    expect(result.total).toBe(1);
    expect(result.data[0].description).toBe("Coffee and cake");
  });

  it("phrase matches consecutive words", async () => {
    // "weekly shop" appears consecutively in "Supermarket weekly shop"
    const result = service.list(listInput({ search: "weekly shop" }));
    expect(result.total).toBe(1);
    expect(result.data[0].merchant).toBe("ALDI");
  });

  it("does not match words in wrong order", async () => {
    // "shop weekly" is not a consecutive phrase in any description
    const result = service.list(listInput({ search: "shop weekly" }));
    expect(result.total).toBe(0);
  });

  it("prefix-matches last word in phrase", async () => {
    // "weekly sho" — phrase match with prefix on last: "weekly sho"*
    const result = service.list(listInput({ search: "weekly sho" }));
    expect(result.total).toBe(1);
    expect(result.data[0].merchant).toBe("ALDI");
  });

  it("returns empty for search with only special characters", async () => {
    const result = service.list(listInput({ search: "!@#" }));
    expect(result.total).toBe(0);
  });
});

// ─── list — FTS search by category name ──────────────────────────────────────

describe("list — FTS search by category name", async () => {
  let catId: number;

  beforeEach(async () => {
    [{ id: catId }] = db
      .insert(categories)
      .values({ name: "Groceries", icon: "cart" })
      .returning({ id: categories.id })
      .all();
    await service.create(tx({ description: "Weekly shop", merchant: "ALDI", categoryId: catId }));
    await service.create(tx({ description: "Coffee", merchant: "Starbucks" })); // no category
  });

  it("matches transactions by category name prefix", async () => {
    const result = service.list(listInput({ search: "groc" }));
    expect(result.total).toBe(1);
    expect(result.data[0].description).toBe("Weekly shop");
  });

  it("matches transactions by full category name", async () => {
    const result = service.list(listInput({ search: "Groceries" }));
    expect(result.total).toBe(1);
  });

  it("does not match uncategorized transactions for category search", async () => {
    const result = service.list(listInput({ search: "Groceries" }));
    expect(result.total).toBe(1);
    expect(result.data[0].merchant).toBe("ALDI");
  });
});

// ─── list — tag filtering ─────────────────────────────────────────────────────

describe("list — tag filtering", async () => {
  beforeEach(async () => {
    await service.create(tx({ description: "A", tags: ["food", "weekly"] }));
    await service.create(tx({ description: "B", tags: ["transport"] }));
    await service.create(tx({ description: "C", tags: ["food", "monthly"] }));
    await service.create(tx({ description: "D" })); // no tags
  });

  it("filters by single tag", async () => {
    const result = service.list(listInput({ tags: ["transport"] }));
    expect(result.total).toBe(1);
    expect(result.data[0].description).toBe("B");
  });

  it("filters by multiple tags (OR logic)", async () => {
    const result = service.list(listInput({ tags: ["weekly", "monthly"] }));
    expect(result.total).toBe(2);
  });

  it("does not match transactions without any of the tags", async () => {
    const result = service.list(listInput({ tags: ["food"] }));
    expect(result.total).toBe(2);
    const descs = result.data.map((r) => r.description).sort();
    expect(descs).toEqual(["A", "C"]);
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe("update", async () => {
  it("updates specified fields", async () => {
    const created = await service.create(tx({ amount: 1, description: "Original" }));
    const updated = await service.update(created.id, { amount: 9.99, description: "Updated" });
    expect(updated).not.toBeNull();
    expect(updated!.amount).toBe(9.99);
    expect(updated!.description).toBe("Updated");
  });

  it("does not change fields not included in the update", async () => {
    const created = await service.create(tx({ amount: 1, merchant: "ALDI" }));
    const updated = await service.update(created.id, { amount: 2 });
    expect(updated!.merchant).toBe("ALDI");
  });

  it("sets updatedAt on update", async () => {
    const created = await service.create(tx());
    const updated = await service.update(created.id, { amount: 5 });
    expect(updated!.updatedAt).toBeDefined();
    expect(updated!.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("clears nullable field when set to null", async () => {
    const created = await service.create(tx({ merchant: "ALDI" }));
    const updated = await service.update(created.id, { merchant: null });
    expect(updated!.merchant).toBeNull();
  });

  it("updates tags to a new array", async () => {
    const created = await service.create(tx({ tags: ["old"] }));
    const updated = await service.update(created.id, { tags: ["new", "tag"] });
    expect(updated!.tags).toEqual(["new", "tag"]);
  });

  it("clears tags when set to null", async () => {
    const created = await service.create(tx({ tags: ["food"] }));
    const updated = await service.update(created.id, { tags: null });
    expect(updated!.tags).toBeNull();
  });

  it("returns null for non-existent id", async () => {
    expect(await service.update(9999, { amount: 1 })).toBeNull();
  });
});

// ─── delete ───────────────────────────────────────────────────────────────────

describe("delete", async () => {
  it("deletes an existing transaction and returns true", async () => {
    const created = await service.create(tx());
    expect(service.delete(created.id)).toBe(true);
    expect(service.getById(created.id)).toBeNull();
  });

  it("returns false for non-existent id", async () => {
    expect(service.delete(9999)).toBe(false);
  });
});

// ─── deleteBatch ──────────────────────────────────────────────────────────────

describe("deleteBatch", async () => {
  it("deletes multiple transactions and returns count", async () => {
    const a = await service.create(tx({ description: "A" }));
    const b = await service.create(tx({ description: "B" }));
    await service.create(tx({ description: "C" }));

    const count = service.deleteBatch([a.id, b.id]);
    expect(count).toBe(2);
    expect(service.list(listInput()).total).toBe(1);
  });

  it("ignores non-existent ids gracefully", async () => {
    const a = await service.create(tx());
    const count = service.deleteBatch([a.id, 9999]);
    expect(count).toBe(1);
  });
});

// ─── updateBatch ──────────────────────────────────────────────────────────────

describe("updateBatch", async () => {
  it("updates multiple transactions in one call", async () => {
    const [cat] = db.insert(categories).values({ name: "Food" }).returning().all();
    const a = await service.create(tx({ description: "A" }));
    const b = await service.create(tx({ description: "B" }));

    const results = await service.updateBatch({
      updates: [
        { id: a.id, categoryId: cat.id },
        { id: b.id, description: "B updated" },
      ],
    });

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.id === a.id)?.categoryId).toBe(cat.id);
    expect(results.find((r) => r.id === b.id)?.description).toBe("B updated");
  });

  it("silently skips non-existent ids and returns only updated rows", async () => {
    const a = await service.create(tx({ description: "A" }));

    const results = await service.updateBatch({
      updates: [
        { id: a.id, description: "A updated" },
        { id: 9999, description: "Ghost" },
      ],
    });

    expect(results).toHaveLength(1);
    expect(results[0].description).toBe("A updated");
  });

  it("is atomic — all updates succeed or none do", async () => {
    const a = await service.create(tx({ description: "A" }));
    const b = await service.create(tx({ description: "B" }));

    await expect(
      service.updateBatch({
        updates: [
          { id: a.id, categoryId: 9999 }, // invalid FK — will throw
          { id: b.id, description: "B updated" },
        ],
      })
    ).rejects.toThrow();

    // neither row should be changed
    expect(service.getById(a.id)?.categoryId).toBeNull();
    expect(service.getById(b.id)?.description).toBe("B");
  });
});

// ─── listTags ─────────────────────────────────────────────────────────────────

describe("listTags", async () => {
  it("returns empty array when no tags exist", async () => {
    await service.create(tx());
    expect(service.listTags()).toEqual([]);
  });

  it("returns distinct tags sorted alphabetically", async () => {
    await service.create(tx({ tags: ["food", "weekly"] }));
    await service.create(tx({ tags: ["transport", "food"] }));
    await service.create(tx()); // no tags
    const tags = service.listTags();
    expect(tags).toEqual(["food", "transport", "weekly"]);
  });

  it("deduplicates tags that appear in multiple transactions", async () => {
    await service.create(tx({ tags: ["food"] }));
    await service.create(tx({ tags: ["food"] }));
    expect(service.listTags()).toEqual(["food"]);
  });
});

describe("transfer type", async () => {
  it("creates a transfer transaction successfully", async () => {
    const result = await service.create(
      tx({ amount: 500, type: "transfer", description: "Buy SPX" })
    );
    expect(result.type).toBe("transfer");
    expect(result.amount).toBe(500);
  });

  it("excludes transfers by default, includes with explicit type filter", async () => {
    await service.create(tx({ type: "expense" }));
    await service.create(tx({ type: "transfer", description: "Asset purchase" }));

    const all = service.list(ListTransactionsSchema.parse({}));
    expect(all.total).toBe(1); // transfers excluded by default

    const transfers = service.list(ListTransactionsSchema.parse({ type: "transfer" }));
    expect(transfers.total).toBe(1);
    expect(transfers.data[0].type).toBe("transfer");
  });
});
