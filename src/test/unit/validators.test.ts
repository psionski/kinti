import { describe, it, expect } from "vitest";
import { PaginationSchema, ErrorResponseSchema } from "@/lib/validators/common";
import {
  CreateTransactionSchema,
  UpdateTransactionSchema,
  CreateTransactionsBatchSchema,
  ListTransactionsSchema,
  DeleteTransactionsBatchSchema,
} from "@/lib/validators/transactions";
import {
  CreateCategorySchema,
  UpdateCategorySchema,
  RecategorizeSchema,
  MergeCategoriesSchema,
} from "@/lib/validators/categories";
import {
  SetBudgetSchema,
  GetBudgetStatusSchema,
  ResetBudgetsSchema,
} from "@/lib/validators/budgets";
import { CreateRecurringSchema, UpdateRecurringSchema } from "@/lib/validators/recurring";

// ─── Common ───────────────────────────────────────────────────────────────────

describe("PaginationSchema", () => {
  it("applies defaults when no input", () => {
    const result = PaginationSchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it("accepts valid pagination", () => {
    const result = PaginationSchema.parse({ limit: 100, offset: 20 });
    expect(result.limit).toBe(100);
    expect(result.offset).toBe(20);
  });

  it("rejects limit > 200", () => {
    expect(() => PaginationSchema.parse({ limit: 201 })).toThrow();
  });

  it("rejects negative offset", () => {
    expect(() => PaginationSchema.parse({ offset: -1 })).toThrow();
  });
});

describe("ErrorResponseSchema", () => {
  it("parses a valid error response", () => {
    const result = ErrorResponseSchema.parse({
      error: "Not found",
      code: "NOT_FOUND",
    });
    expect(result.code).toBe("NOT_FOUND");
  });

  it("accepts optional details", () => {
    const result = ErrorResponseSchema.parse({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: { field: "amount" },
    });
    expect(result.details).toEqual({ field: "amount" });
  });

  it("rejects unknown error code", () => {
    expect(() => ErrorResponseSchema.parse({ error: "oops", code: "UNKNOWN_CODE" })).toThrow();
  });
});

// ─── Transactions ─────────────────────────────────────────────────────────────

describe("CreateTransactionSchema", () => {
  const valid = {
    amount: 12.1,
    description: "Coffee",
    date: "2026-03-17",
  };

  it("parses a minimal valid transaction", () => {
    const result = CreateTransactionSchema.parse(valid);
    expect(result.amount).toBe(12.1);
    expect(result.type).toBe("expense"); // default
  });

  it("accepts income type", () => {
    const result = CreateTransactionSchema.parse({ ...valid, type: "income" });
    expect(result.type).toBe("income");
  });

  it("accepts optional fields", () => {
    const result = CreateTransactionSchema.parse({
      ...valid,
      merchant: "Starbucks",
      categoryId: 1,
      notes: "Morning coffee",
      tags: ["coffee", "daily"],
    });
    expect(result.merchant).toBe("Starbucks");
    expect(result.tags).toEqual(["coffee", "daily"]);
  });

  it("rejects zero amount", () => {
    expect(() => CreateTransactionSchema.parse({ ...valid, amount: 0 })).toThrow();
  });

  it("allows a negative expense (a refund)", () => {
    const result = CreateTransactionSchema.parse({ ...valid, amount: -94, type: "expense" });
    expect(result.amount).toBe(-94);
  });

  it("allows negative amount (signed transfers)", () => {
    const result = CreateTransactionSchema.parse({ ...valid, amount: -1, type: "transfer" });
    expect(result.amount).toBe(-1);
  });

  it("accepts decimal amount", () => {
    const result = CreateTransactionSchema.parse({ ...valid, amount: 12.5 });
    expect(result.amount).toBe(12.5);
  });

  it("rejects empty description", () => {
    expect(() => CreateTransactionSchema.parse({ ...valid, description: "" })).toThrow();
  });

  it("rejects invalid date format", () => {
    expect(() => CreateTransactionSchema.parse({ ...valid, date: "17-03-2026" })).toThrow();
    expect(() => CreateTransactionSchema.parse({ ...valid, date: "2026/03/17" })).toThrow();
  });

  it("rejects invalid type", () => {
    expect(() => CreateTransactionSchema.parse({ ...valid, type: "invalid" })).toThrow();
  });
});

describe("UpdateTransactionSchema", () => {
  it("accepts empty object (all optional)", () => {
    const result = UpdateTransactionSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts partial update", () => {
    const result = UpdateTransactionSchema.parse({ amount: 5, description: "Updated" });
    expect(result.amount).toBe(5);
    expect(result.description).toBe("Updated");
  });

  it("accepts null categoryId to clear it", () => {
    const result = UpdateTransactionSchema.parse({ categoryId: null });
    expect(result.categoryId).toBeNull();
  });

  it("allows negative amount on update (signed transfers)", () => {
    const result = UpdateTransactionSchema.parse({ amount: -1 });
    expect(result.amount).toBe(-1);
  });
});

describe("CreateTransactionsBatchSchema", () => {
  const tx = { amount: 1, description: "Item", date: "2026-03-17" };

  it("accepts an array of transactions", () => {
    const result = CreateTransactionsBatchSchema.parse({ transactions: [tx, tx] });
    expect(result.transactions).toHaveLength(2);
  });

  it("accepts optional receiptId", () => {
    const result = CreateTransactionsBatchSchema.parse({ transactions: [tx], receiptId: 5 });
    expect(result.receiptId).toBe(5);
  });

  it("rejects empty array", () => {
    expect(() => CreateTransactionsBatchSchema.parse({ transactions: [] })).toThrow();
  });
});

describe("ListTransactionsSchema", () => {
  it("parses with defaults", () => {
    const result = ListTransactionsSchema.parse({});
    expect(result.sortBy).toBe("date");
    expect(result.sortOrder).toBe("desc");
    expect(result.limit).toBe(50);
  });

  it("accepts all filter fields", () => {
    const result = ListTransactionsSchema.parse({
      dateFrom: "2026-01-01",
      dateTo: "2026-03-31",
      categoryId: 2,
      amountMin: 1,
      amountMax: 50,
      merchant: "REWE",
      search: "groceries",
      tags: ["food"],
      type: "expense",
    });
    expect(result.dateFrom).toBe("2026-01-01");
    expect(result.tags).toEqual(["food"]);
  });

  it("rejects invalid sortBy value", () => {
    expect(() => ListTransactionsSchema.parse({ sortBy: "invalid" })).toThrow();
  });
});

describe("DeleteTransactionsBatchSchema", () => {
  it("accepts valid id array", () => {
    const result = DeleteTransactionsBatchSchema.parse({ ids: [1, 2, 3] });
    expect(result.ids).toHaveLength(3);
  });

  it("rejects empty array", () => {
    expect(() => DeleteTransactionsBatchSchema.parse({ ids: [] })).toThrow();
  });
});

// ─── Categories ───────────────────────────────────────────────────────────────

describe("CreateCategorySchema", () => {
  it("parses minimal valid category", () => {
    const result = CreateCategorySchema.parse({ name: "Groceries" });
    expect(result.name).toBe("Groceries");
  });

  it("accepts parentId and color", () => {
    const result = CreateCategorySchema.parse({
      name: "Vegetables",
      parentId: 1,
      color: "#4CAF50",
      icon: "🥦",
    });
    expect(result.parentId).toBe(1);
    expect(result.color).toBe("#4CAF50");
  });

  it("accepts 3-char hex color", () => {
    const result = CreateCategorySchema.parse({ name: "Test", color: "#F00" });
    expect(result.color).toBe("#F00");
  });

  it("rejects empty name", () => {
    expect(() => CreateCategorySchema.parse({ name: "" })).toThrow();
  });

  it("rejects invalid hex color", () => {
    expect(() => CreateCategorySchema.parse({ name: "Test", color: "red" })).toThrow();
    expect(() => CreateCategorySchema.parse({ name: "Test", color: "#GGG" })).toThrow();
  });
});

describe("UpdateCategorySchema", () => {
  it("accepts empty update", () => {
    const result = UpdateCategorySchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts null parentId to clear it", () => {
    const result = UpdateCategorySchema.parse({ parentId: null });
    expect(result.parentId).toBeNull();
  });
});

describe("RecategorizeSchema", () => {
  it("requires targetCategoryId", () => {
    expect(() => RecategorizeSchema.parse({})).toThrow();
  });

  it("accepts all filter fields", () => {
    const result = RecategorizeSchema.parse({
      targetCategoryId: 2,
      sourceCategoryId: 1,
      merchantPattern: "REWE",
      descriptionPattern: "groceries",
      dateFrom: "2026-01-01",
      dateTo: "2026-03-31",
    });
    expect(result.targetCategoryId).toBe(2);
    expect(result.merchantPattern).toBe("REWE");
  });
});

describe("MergeCategoriesSchema", () => {
  it("requires both IDs", () => {
    expect(() => MergeCategoriesSchema.parse({ sourceCategoryId: 1 })).toThrow();
    expect(() => MergeCategoriesSchema.parse({ targetCategoryId: 2 })).toThrow();
  });

  it("parses valid merge input", () => {
    const result = MergeCategoriesSchema.parse({ sourceCategoryId: 1, targetCategoryId: 2 });
    expect(result.sourceCategoryId).toBe(1);
    expect(result.targetCategoryId).toBe(2);
  });
});

// ─── Budgets ──────────────────────────────────────────────────────────────────

describe("SetBudgetSchema", () => {
  const valid = { categoryId: 1, month: "2026-03", amount: 500 };

  it("parses valid budget", () => {
    const result = SetBudgetSchema.parse(valid);
    expect(result.categoryId).toBe(1);
    expect(result.month).toBe("2026-03");
    expect(result.amount).toBe(500);
  });

  it("rejects invalid month format", () => {
    expect(() => SetBudgetSchema.parse({ ...valid, month: "2026-3" })).toThrow();
    expect(() => SetBudgetSchema.parse({ ...valid, month: "March 2026" })).toThrow();
  });

  it("rejects zero amount", () => {
    expect(() => SetBudgetSchema.parse({ ...valid, amount: 0 })).toThrow();
  });
});

describe("GetBudgetStatusSchema", () => {
  it("accepts valid month", () => {
    const result = GetBudgetStatusSchema.parse({ month: "2026-03" });
    expect(result.month).toBe("2026-03");
  });

  it("rejects invalid month", () => {
    expect(() => GetBudgetStatusSchema.parse({ month: "2026-3" })).toThrow();
  });
});

describe("ResetBudgetsSchema", () => {
  it("parses valid month", () => {
    const result = ResetBudgetsSchema.parse({ month: "2026-03" });
    expect(result.month).toBe("2026-03");
  });

  it("rejects invalid month", () => {
    expect(() => ResetBudgetsSchema.parse({ month: "invalid" })).toThrow();
  });
});

// ─── Recurring ────────────────────────────────────────────────────────────────

describe("CreateRecurringSchema", () => {
  const valid = {
    amount: 99,
    description: "Netflix",
    frequency: "monthly",
    startDate: "2026-01-01",
  };

  it("parses minimal valid recurring", () => {
    const result = CreateRecurringSchema.parse(valid);
    expect(result.type).toBe("expense"); // default
    expect(result.frequency).toBe("monthly");
  });

  it("accepts all frequency values", () => {
    for (const freq of ["daily", "weekly", "monthly", "yearly"] as const) {
      const result = CreateRecurringSchema.parse({ ...valid, frequency: freq });
      expect(result.frequency).toBe(freq);
    }
  });

  it("accepts dayOfMonth for monthly", () => {
    const result = CreateRecurringSchema.parse({ ...valid, dayOfMonth: 15 });
    expect(result.dayOfMonth).toBe(15);
  });

  it("accepts dayOfWeek for weekly", () => {
    const result = CreateRecurringSchema.parse({ ...valid, frequency: "weekly", dayOfWeek: 1 });
    expect(result.dayOfWeek).toBe(1);
  });

  it("accepts null endDate", () => {
    const result = CreateRecurringSchema.parse({ ...valid, endDate: null });
    expect(result.endDate).toBeNull();
  });

  it("rejects invalid frequency", () => {
    expect(() => CreateRecurringSchema.parse({ ...valid, frequency: "biweekly" })).toThrow();
  });

  it("rejects dayOfMonth out of range", () => {
    expect(() => CreateRecurringSchema.parse({ ...valid, dayOfMonth: 0 })).toThrow();
    expect(() => CreateRecurringSchema.parse({ ...valid, dayOfMonth: 32 })).toThrow();
  });

  it("rejects dayOfWeek out of range", () => {
    expect(() => CreateRecurringSchema.parse({ ...valid, dayOfWeek: -1 })).toThrow();
    expect(() => CreateRecurringSchema.parse({ ...valid, dayOfWeek: 7 })).toThrow();
  });
});

describe("UpdateRecurringSchema", () => {
  it("accepts empty update", () => {
    const result = UpdateRecurringSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts isActive toggle", () => {
    const result = UpdateRecurringSchema.parse({ isActive: false });
    expect(result.isActive).toBe(false);
  });

  it("accepts null categoryId to clear", () => {
    const result = UpdateRecurringSchema.parse({ categoryId: null });
    expect(result.categoryId).toBeNull();
  });
});
