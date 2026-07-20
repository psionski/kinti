import { describe, it, expect, beforeEach } from "vitest";
import { setupTestServices, makeGet, makeJson, json } from "./helpers";
import type { BudgetStatusResponse } from "@/lib/validators/budgets";

setupTestServices();

describe("Budget API Routes", () => {
  let POST_BUDGET: (req: Request) => Promise<Response>;
  let GET_BUDGET: (req: Request) => Promise<Response>;
  let DELETE_BUDGET: (req: Request) => Promise<Response>;
  let POST_RESET: (req: Request) => Promise<Response>;
  let GET_HISTORY: (req: Request) => Promise<Response>;
  let POST_CATEGORY: (req: Request) => Promise<Response>;
  let POST_TX: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const budgets = await import("@/app/api/budgets/route");
    const reset = await import("@/app/api/budgets/reset/route");
    const history = await import("@/app/api/budgets/history/route");
    const cats = await import("@/app/api/categories/route");
    const txs = await import("@/app/api/transactions/route");
    POST_BUDGET = budgets.POST;
    GET_BUDGET = budgets.GET;
    DELETE_BUDGET = budgets.DELETE;
    POST_RESET = reset.POST;
    GET_HISTORY = history.GET;
    POST_CATEGORY = cats.POST;
    POST_TX = txs.POST;
  });

  it("POST sets a budget and returns 201", async () => {
    const cat = await json<{ id: number }>(
      await POST_CATEGORY(makeJson("POST", "/api/categories", { name: "Food" }))
    );
    const res = await POST_BUDGET(
      makeJson("POST", "/api/budgets", {
        categoryId: cat.id,
        month: "2025-01",
        amount: 500,
      })
    );
    expect(res.status).toBe(201);
    const body = await json<{ amount: number }>(res);
    expect(body.amount).toBe(500);
  });

  it("GET returns budget status for a month", async () => {
    const cat = await json<{ id: number }>(
      await POST_CATEGORY(makeJson("POST", "/api/categories", { name: "Food" }))
    );
    await POST_BUDGET(
      makeJson("POST", "/api/budgets", {
        categoryId: cat.id,
        month: "2025-01",
        amount: 500,
      })
    );
    await POST_TX(
      makeJson("POST", "/api/transactions", {
        amount: 150,
        description: "Groceries",
        date: "2025-01-15",
        categoryId: cat.id,
        type: "expense",
      })
    );

    const res = await GET_BUDGET(makeGet("/api/budgets", { month: "2025-01" }));
    expect(res.status).toBe(200);
    const body = await json<BudgetStatusResponse>(res);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.budgetAmount).toBe(500);
    expect(body.items[0]!.spentAmount).toBe(150);
    expect(body.inheritedFrom).toBeNull();
  });

  it("GET returns inherited budgets when month has no own rows", async () => {
    const cat = await json<{ id: number }>(
      await POST_CATEGORY(makeJson("POST", "/api/categories", { name: "Food" }))
    );
    await POST_BUDGET(
      makeJson("POST", "/api/budgets", { categoryId: cat.id, month: "2025-01", amount: 500 })
    );

    const res = await GET_BUDGET(makeGet("/api/budgets", { month: "2025-02" }));
    expect(res.status).toBe(200);
    const body = await json<BudgetStatusResponse>(res);
    expect(body.inheritedFrom).toBe("2025-01");
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.budgetAmount).toBe(500);
  });

  it("DELETE soft-deletes a budget and returns success", async () => {
    const cat = await json<{ id: number }>(
      await POST_CATEGORY(makeJson("POST", "/api/categories", { name: "Food" }))
    );
    await POST_BUDGET(
      makeJson("POST", "/api/budgets", {
        categoryId: cat.id,
        month: "2025-01",
        amount: 500,
      })
    );

    const res = await DELETE_BUDGET(
      makeGet("/api/budgets", { categoryId: String(cat.id), month: "2025-01" })
    );
    expect(res.status).toBe(200);
    const body = await json<{ success: boolean }>(res);
    expect(body.success).toBe(true);

    // Verify it's gone from status
    const status = await json<BudgetStatusResponse>(
      await GET_BUDGET(makeGet("/api/budgets", { month: "2025-01" }))
    );
    expect(status.items).toHaveLength(0);
  });

  it("DELETE returns 404 for non-existent budget", async () => {
    const res = await DELETE_BUDGET(
      makeGet("/api/budgets", { categoryId: "999", month: "2025-01" })
    );
    expect(res.status).toBe(404);
  });

  it("POST /reset resets a month to inherited state", async () => {
    const cat1 = await json<{ id: number }>(
      await POST_CATEGORY(makeJson("POST", "/api/categories", { name: "Food" }))
    );
    const cat2 = await json<{ id: number }>(
      await POST_CATEGORY(makeJson("POST", "/api/categories", { name: "Transport" }))
    );
    // Jan has budgets
    await POST_BUDGET(
      makeJson("POST", "/api/budgets", { categoryId: cat1.id, month: "2025-01", amount: 500 })
    );
    await POST_BUDGET(
      makeJson("POST", "/api/budgets", { categoryId: cat2.id, month: "2025-01", amount: 300 })
    );
    // Materialize Feb with its own budget
    await POST_BUDGET(
      makeJson("POST", "/api/budgets", { categoryId: cat1.id, month: "2025-02", amount: 600 })
    );

    // Reset Feb — should fall back to inheriting from Jan
    const res = await POST_RESET(makeJson("POST", "/api/budgets/reset", { month: "2025-02" }));
    expect(res.status).toBe(200);
    const body = await json<{ success: boolean }>(res);
    expect(body.success).toBe(true);

    // Verify Feb now inherits from Jan
    const status = await json<BudgetStatusResponse>(
      await GET_BUDGET(makeGet("/api/budgets", { month: "2025-02" }))
    );
    expect(status.inheritedFrom).toBe("2025-01");
    expect(status.items).toHaveLength(2);
  });

  it("GET /history returns budget vs actual for recent months", async () => {
    const cat = await json<{ id: number }>(
      await POST_CATEGORY(makeJson("POST", "/api/categories", { name: "Food" }))
    );
    await POST_BUDGET(
      makeJson("POST", "/api/budgets", { categoryId: cat.id, month: "2025-01", amount: 500 })
    );
    await POST_TX(
      makeJson("POST", "/api/transactions", {
        amount: 200,
        description: "Groceries",
        date: "2025-01-15",
        categoryId: cat.id,
        type: "expense",
      })
    );

    const res = await GET_HISTORY(makeGet("/api/budgets/history", { months: "3" }));
    expect(res.status).toBe(200);
    const body = await json<{ month: string; totalBudget: number; totalSpent: number }[]>(res);
    expect(body).toHaveLength(3);
    for (const point of body) {
      expect(point).toHaveProperty("month");
      expect(point).toHaveProperty("totalBudget");
      expect(point).toHaveProperty("totalSpent");
      expect(point).toHaveProperty("percentUsed");
    }
  });
});
