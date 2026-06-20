// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { makeTestDb } from "../helpers";
import { RecurringService, computeNextOccurrence } from "@/lib/services/recurring";
import { TransactionService } from "@/lib/services/transactions";
import { CategoryService } from "@/lib/services/categories";
import { CreateRecurringSchema } from "@/lib/validators/recurring";
import { recurringTransactions } from "@/lib/db/schema";

type TestDb = ReturnType<typeof makeTestDb>;

let db: TestDb;
let service: RecurringService;
let txService: TransactionService;

// Pin clock to 2026-04-01 — test data uses dates relative to this
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.UTC(2026, 3, 1)));
  db = makeTestDb();
  service = new RecurringService(db);
  txService = new TransactionService(db);
  new CategoryService(db);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Helper — defaults to a future startDate so tests that don't care about
 *  auto-generation aren't polluted with phantom transactions. */
function rec(overrides: Record<string, unknown> = {}) {
  return CreateRecurringSchema.parse({
    amount: 10,
    description: "Test recurring",
    frequency: "monthly",
    startDate: "2099-01-01",
    ...overrides,
  });
}

// ─── computeNextOccurrence ────────────────────────────────────────────────────

describe("computeNextOccurrence", async () => {
  function makeRow(overrides: Partial<(typeof recurringTransactions)["$inferInsert"]> = {}) {
    return {
      id: 1,
      amount: 10,
      currency: "EUR",
      type: "expense" as const,
      description: "Test",
      merchant: null,
      categoryId: null,
      frequency: "monthly" as const,
      dayOfMonth: null,
      dayOfWeek: null,
      startDate: "2026-01-15",
      endDate: null,
      lastGenerated: null,
      isActive: 1,
      notes: null,
      tags: null,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      ...overrides,
    };
  }

  it("returns null when inactive", async () => {
    const r = makeRow({ isActive: 0 });
    expect(computeNextOccurrence(r, "2026-03-01")).toBeNull();
  });

  it("returns null when endDate is in the past", async () => {
    const r = makeRow({ endDate: "2026-02-01" });
    expect(computeNextOccurrence(r, "2026-03-01")).toBeNull();
  });

  it("monthly: returns next occurrence on the same day of month", async () => {
    const r = makeRow({ startDate: "2026-01-15", frequency: "monthly" });
    expect(computeNextOccurrence(r, "2026-03-01")).toBe("2026-03-15");
  });

  it("monthly: uses dayOfMonth when specified", async () => {
    const r = makeRow({
      startDate: "2026-01-01",
      frequency: "monthly",
      dayOfMonth: 20,
    });
    expect(computeNextOccurrence(r, "2026-03-01")).toBe("2026-03-20");
  });

  it("monthly: advances to next month when current day has passed", async () => {
    const r = makeRow({ startDate: "2026-01-05", frequency: "monthly" });
    expect(computeNextOccurrence(r, "2026-03-10")).toBe("2026-04-05");
  });

  it("weekly: returns correct day of week", async () => {
    // dayOfWeek 1 = Monday; 2026-03-16 is a Monday
    const r = makeRow({
      startDate: "2026-01-01",
      frequency: "weekly",
      dayOfWeek: 1,
    });
    const result = computeNextOccurrence(r, "2026-03-15");
    expect(result).toBe("2026-03-16");
  });

  it("daily: returns next day", async () => {
    const r = makeRow({ startDate: "2026-01-01", frequency: "daily" });
    expect(computeNextOccurrence(r, "2026-03-15")).toBe("2026-03-16");
  });

  it("yearly: returns same month/day next year when past", async () => {
    const r = makeRow({ startDate: "2026-01-10", frequency: "yearly" });
    expect(computeNextOccurrence(r, "2026-01-11")).toBe("2027-01-10");
  });

  it("yearly: returns this year's occurrence when not yet passed", async () => {
    const r = makeRow({ startDate: "2026-06-15", frequency: "yearly" });
    expect(computeNextOccurrence(r, "2026-03-01")).toBe("2026-06-15");
  });

  it("returns null for unknown frequency", async () => {
    const r = makeRow({ frequency: "biweekly" as "monthly" });
    expect(computeNextOccurrence(r, "2026-03-01")).toBeNull();
  });

  it("monthly: handles cursor before startDate", async () => {
    const r = makeRow({ startDate: "2026-06-15", frequency: "monthly" });
    expect(computeNextOccurrence(r, "2026-01-01")).toBe("2026-06-15");
  });
});

// ─── create ───────────────────────────────────────────────────────────────────

describe("create", async () => {
  it("creates a recurring template and returns it", async () => {
    const result = await service.create(rec());
    expect(result.id).toBeGreaterThan(0);
    expect(result.amount).toBe(10);
    expect(result.frequency).toBe("monthly");
    expect(result.isActive).toBe(1);
  });

  it("parses tags from JSON to string array", async () => {
    const result = await service.create(rec({ tags: ["bills", "fixed"] }));
    expect(result.tags).toEqual(["bills", "fixed"]);
  });

  it("includes nextOccurrence", async () => {
    const result = await service.create(rec({ startDate: "2026-01-15" }));
    // After auto-generating Jan-15, Feb-15, Mar-15, next should be Apr-15
    expect(result.nextOccurrence).toBe("2026-04-15");
  });

  // ─── auto-generation on create ─────────────────────────────────────────────

  it("auto-generates transactions when startDate is in the past", async () => {
    // Clock = 2026-04-01 — should generate Jan-15, Feb-15, Mar-15
    await service.create(rec({ startDate: "2026-01-15", frequency: "monthly" }));

    const txs = txService.list({
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "asc",
    });
    expect(txs.total).toBe(3);
    expect(txs.data.map((t) => t.date)).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
    for (const tx of txs.data) {
      expect(tx.recurringId).not.toBeNull();
    }
  });

  it("auto-generates exactly 1 transaction when startDate is today", async () => {
    // Clock = 2026-04-01
    await service.create(rec({ startDate: "2026-04-01", frequency: "monthly" }));

    const txs = txService.list({
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "asc",
    });
    expect(txs.total).toBe(1);
    expect(txs.data[0].date).toBe("2026-04-01");
  });

  it("does not auto-generate when startDate is in the future", async () => {
    await service.create(rec({ startDate: "2099-01-01", frequency: "monthly" }));

    const txs = txService.list({
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "asc",
    });
    expect(txs.total).toBe(0);
  });

  it("generated transactions inherit all fields from the template", async () => {
    const catService = new CategoryService(db);
    const cat = catService.create({ name: "Subscriptions" });
    await service.create(
      rec({
        startDate: "2026-04-01",
        amount: 12.99,
        type: "expense",
        description: "Netflix",
        merchant: "Netflix Inc",
        categoryId: cat.id,
        notes: "Shared plan",
        tags: ["streaming", "entertainment"],
      })
    );

    const txs = txService.list({
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "asc",
    });
    expect(txs.total).toBe(1);
    const tx = txs.data[0];
    expect(tx.amount).toBe(12.99);
    expect(tx.type).toBe("expense");
    expect(tx.description).toBe("Netflix");
    expect(tx.merchant).toBe("Netflix Inc");
    expect(tx.categoryId).toBe(cat.id);
    expect(tx.notes).toBe("Shared plan");
    expect(tx.tags).toEqual(["streaming", "entertainment"]);
  });

  it("sets lastGenerated after auto-generation", async () => {
    // Clock = 2026-04-01, monthly from Jan-15 → generates up to Mar-15
    const created = await service.create(rec({ startDate: "2026-01-15", frequency: "monthly" }));

    const fresh = service.getById(created.id)!;
    expect(fresh.lastGenerated).toBe("2026-03-15");
  });

  it("leaves lastGenerated null when startDate is in the future", async () => {
    const created = await service.create(rec());

    const fresh = service.getById(created.id)!;
    expect(fresh.lastGenerated).toBeNull();
  });

  it("auto-generation is idempotent with subsequent generatePending", async () => {
    await service.create(rec({ startDate: "2026-01-15", frequency: "monthly" }));

    const countAfterCreate = txService.list({
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "asc",
    }).total;

    // Running generatePending again should not create duplicates
    await service.generatePending();
    const countAfterGenerate = txService.list({
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "asc",
    }).total;

    expect(countAfterGenerate).toBe(countAfterCreate);
  });

  it("create then advance clock — generatePending picks up new occurrences", async () => {
    await service.create(rec({ startDate: "2026-04-01", frequency: "monthly" }));

    // 1 transaction generated on create (2026-04-01)
    expect(txService.list({ limit: 50, offset: 0, sortBy: "date", sortOrder: "asc" }).total).toBe(
      1
    );

    // Advance clock by 2 months
    vi.setSystemTime(new Date(Date.UTC(2026, 5, 1))); // 2026-06-01

    const count = await service.generatePending();
    expect(count).toBe(2); // May-01, Jun-01

    const txs = txService.list({
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "asc",
    });
    expect(txs.total).toBe(3);
    expect(txs.data.map((t) => t.date)).toEqual(["2026-04-01", "2026-05-01", "2026-06-01"]);
  });
});

// ─── list ─────────────────────────────────────────────────────────────────────

describe("list", async () => {
  it("returns all recurring templates", async () => {
    await service.create(rec({ description: "Netflix" }));
    await service.create(rec({ description: "Gym" }));
    expect(service.list()).toHaveLength(2);
  });

  it("returns empty array when none exist", async () => {
    expect(service.list()).toHaveLength(0);
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe("update", async () => {
  it("updates specified fields", async () => {
    const created = await service.create(rec({ amount: 10 }));
    const updated = service.update(created.id, {
      amount: 20,
      description: "Updated",
    });
    expect(updated).not.toBeNull();
    expect(updated!.amount).toBe(20);
    expect(updated!.description).toBe("Updated");
  });

  it("deactivates a recurring template", async () => {
    const created = await service.create(rec());
    const updated = service.update(created.id, { isActive: false });
    expect(updated!.isActive).toBe(0);
    expect(updated!.nextOccurrence).toBeNull();
  });

  it("returns null for non-existent id", async () => {
    expect(service.update(9999, { amount: 1 })).toBeNull();
  });
});

// ─── delete ───────────────────────────────────────────────────────────────────

describe("delete", async () => {
  it("deletes a recurring template and returns true", async () => {
    const created = await service.create(rec());
    expect(service.delete(created.id)).toBe(true);
    expect(service.getById(created.id)).toBeNull();
  });

  it("returns false for non-existent id", async () => {
    expect(service.delete(9999)).toBe(false);
  });

  it("keeps auto-generated transactions after deleting the template", async () => {
    // Create with past startDate — auto-generates transactions
    const created = await service.create(rec({ startDate: "2026-01-01", frequency: "monthly" }));

    const beforeDelete = txService.list({
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "asc",
    });
    expect(beforeDelete.total).toBeGreaterThan(0);

    service.delete(created.id);

    const afterDelete = txService.list({
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "asc",
    });
    expect(afterDelete.total).toBe(beforeDelete.total);
  });
});

// ─── generatePending ──────────────────────────────────────────────────────────

describe("generatePending", async () => {
  it("generates monthly transactions up to the given date", async () => {
    await service.create(rec({ startDate: "2027-01-15", frequency: "monthly" }));

    const count = await service.generatePending("2027-04-30");
    expect(count).toBe(4); // Jan-15, Feb-15, Mar-15, Apr-15

    const txs = txService.list({
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "asc",
    });
    const dates = txs.data.map((t) => t.date);
    expect(dates).toContain("2027-01-15");
    expect(dates).toContain("2027-02-15");
    expect(dates).toContain("2027-03-15");
    expect(dates).toContain("2027-04-15");
  });

  it("does not generate past lastGenerated", async () => {
    await service.create(rec({ startDate: "2027-01-15", frequency: "monthly" }));
    // First run: generates up to March
    await service.generatePending("2027-03-31");
    const firstCount = txService.list({
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "asc",
    }).total;

    // Second run with same date: should not create duplicates
    await service.generatePending("2027-03-31");
    const secondCount = txService.list({
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "asc",
    }).total;

    expect(secondCount).toBe(firstCount);
  });

  it("generates daily transactions", async () => {
    await service.create(rec({ startDate: "2027-03-01", frequency: "daily" }));
    const count = await service.generatePending("2027-03-07");
    expect(count).toBe(7);
  });

  it("generates weekly transactions", async () => {
    // 2027-03-01 is a Monday
    await service.create(rec({ startDate: "2027-03-01", frequency: "weekly" }));
    const count = await service.generatePending("2027-03-29");
    // Mondays: Mar 1, 8, 15, 22, 29 = 5
    expect(count).toBe(5);
  });

  it("generates yearly transactions", async () => {
    await service.create(rec({ startDate: "2027-03-01", frequency: "yearly" }));
    const count = await service.generatePending("2029-12-31");
    // 2027-03-01, 2028-03-01, 2029-03-01 = 3
    expect(count).toBe(3);
  });

  it("respects endDate — does not generate past it", async () => {
    await service.create(
      rec({
        startDate: "2027-01-15",
        frequency: "monthly",
        endDate: "2027-02-28",
      })
    );
    const count = await service.generatePending("2027-06-30");
    expect(count).toBe(2); // Jan-15 and Feb-15 only
  });

  it("skips inactive templates", async () => {
    await service.create(rec({ startDate: "2027-01-15", frequency: "monthly" }));
    const created = service.list()[0];
    service.update(created.id, { isActive: false });

    const count = await service.generatePending("2027-06-30");
    expect(count).toBe(0);
  });

  it("links generated transactions to the recurring template via recurringId", async () => {
    const r = await service.create(rec({ startDate: "2027-03-01", frequency: "monthly" }));
    await service.generatePending("2027-03-31");

    const txs = txService.list({
      limit: 50,
      offset: 0,
      sortBy: "date",
      sortOrder: "asc",
      recurringId: r.id,
    });
    expect(txs.total).toBe(1);
    expect(txs.data[0].recurringId).toBe(r.id);
  });

  it("returns 0 when no active templates exist", async () => {
    const count = await service.generatePending("2026-12-31");
    expect(count).toBe(0);
  });
});
