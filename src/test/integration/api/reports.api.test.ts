import { describe, it, expect, beforeEach } from "vitest";
import { setupTestServices, makeGet, makeJson, json } from "./helpers";

setupTestServices();

describe("Report API Routes", () => {
  let GET_SUMMARY: (req: Request) => Promise<Response>;
  let GET_CATEGORY_STATS: (req: Request) => Promise<Response>;
  let GET_TRENDS: (req: Request) => Promise<Response>;
  let GET_TOP_MERCHANTS: (req: Request) => Promise<Response>;
  let GET_INCOME: (req: Request) => Promise<Response>;
  let POST_TX: (req: Request) => Promise<Response>;
  let POST_CAT: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    const summary = await import("@/app/api/reports/summary/route");
    const categoryStats = await import("@/app/api/reports/category-stats/route");
    const trends = await import("@/app/api/reports/trends/route");
    const topMerchants = await import("@/app/api/reports/top-merchants/route");
    const income = await import("@/app/api/reports/income/route");
    const txs = await import("@/app/api/transactions/route");
    const cats = await import("@/app/api/categories/route");
    GET_SUMMARY = summary.GET;
    GET_CATEGORY_STATS = categoryStats.GET;
    GET_TRENDS = trends.GET;
    GET_TOP_MERCHANTS = topMerchants.GET;
    GET_INCOME = income.GET;
    POST_TX = txs.POST;
    POST_CAT = cats.POST;
  });

  async function seedData(): Promise<void> {
    const cat = await json<{ id: number }>(
      await POST_CAT(makeJson("POST", "/api/categories", { name: "Food" }))
    );
    await POST_TX(
      makeJson("POST", "/api/transactions", {
        amount: 20,
        description: "Lunch",
        date: "2025-01-15",
        categoryId: cat.id,
        merchant: "CafeX",
      })
    );
    await POST_TX(
      makeJson("POST", "/api/transactions", {
        amount: 30,
        description: "Dinner",
        date: "2025-01-20",
        categoryId: cat.id,
        merchant: "RestaurantY",
      })
    );
  }

  it("GET /summary returns spending summary", async () => {
    await seedData();
    const res = await GET_SUMMARY(
      makeGet("/api/reports/summary", {
        dateFrom: "2025-01-01",
        dateTo: "2025-01-31",
        groupBy: "category",
      })
    );
    expect(res.status).toBe(200);
    const body = await json<{ period: { total: number }; groups: unknown[] }>(res);
    expect(body.period.total).toBe(50);
    expect(body.groups).toHaveLength(1);
  });

  it("GET /category-stats returns category stats", async () => {
    await seedData();
    const res = await GET_CATEGORY_STATS(
      makeGet("/api/reports/category-stats", {
        dateFrom: "2025-01-01",
        dateTo: "2025-01-31",
        includeZeroSpend: "false",
      })
    );
    expect(res.status).toBe(200);
    const body = await json<{ items: Array<{ percentage: number }>; currency: string }>(res);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].percentage).toBe(100);
    expect(body.currency).toBe("EUR");
  });

  it("GET /trends returns trend data", async () => {
    await seedData();
    const res = await GET_TRENDS(makeGet("/api/reports/trends", { months: "3" }));
    expect(res.status).toBe(200);
    const body = await json<{ points: Array<{ month: string; total: number }>; currency: string }>(
      res
    );
    expect(body.points.length).toBeGreaterThanOrEqual(1);
    expect(body.currency).toBe("EUR");
  });

  // Regression: TrendsChart's category dropdown re-fetched this endpoint and
  // cast the whole response to TrendPoint[], then called .map() on it — but the
  // endpoint returns the envelope { points, currency }, not a bare array. The
  // mismatch threw "data.map is not a function" and surfaced as the global
  // error page. Pin the contract: the body is an object exposing `.points`, and
  // is NOT itself an array. Holds for the categoryId-filtered path too.
  it("GET /trends returns a { points } envelope, not a bare array", async () => {
    const cat = await json<{ id: number }>(
      await POST_CAT(makeJson("POST", "/api/categories", { name: "Travel" }))
    );
    await POST_TX(
      makeJson("POST", "/api/transactions", {
        amount: 40,
        description: "Train",
        date: "2025-01-10",
        categoryId: cat.id,
      })
    );

    const res = await GET_TRENDS(
      makeGet("/api/reports/trends", { months: "3", categoryId: String(cat.id), type: "expense" })
    );
    expect(res.status).toBe(200);
    const body = await json<unknown>(res);

    expect(Array.isArray(body)).toBe(false);
    expect(body).toMatchObject({ points: expect.any(Array), currency: "EUR" });
  });

  it("GET /top-merchants returns top merchants", async () => {
    await seedData();
    const res = await GET_TOP_MERCHANTS(
      makeGet("/api/reports/top-merchants", { dateFrom: "2025-01-01", dateTo: "2025-01-31" })
    );
    expect(res.status).toBe(200);
    const body = await json<{
      merchants: Array<{ merchant: string; total: number }>;
      currency: string;
    }>(res);
    expect(body.merchants).toHaveLength(2);
    expect(body.currency).toBe("EUR");
  });

  it("GET /summary returns 400 on missing params", async () => {
    const res = await GET_SUMMARY(makeGet("/api/reports/summary"));
    expect(res.status).toBe(400);
  });

  it("GET /income returns net income for all time", async () => {
    await seedData();
    // seedData creates two expense transactions: 20 + 30 = 50
    const res = await GET_INCOME(makeGet("/api/reports/income"));
    expect(res.status).toBe(200);
    const body = await json<{ totalIncome: number; totalExpenses: number; netIncome: number }>(res);
    expect(body.totalExpenses).toBe(50);
    expect(body.totalIncome).toBe(0);
    expect(body.netIncome).toBe(-50);
  });

  it("GET /income filters by date range", async () => {
    await seedData();
    // Add income in a different month
    await POST_TX(
      makeJson("POST", "/api/transactions", {
        amount: 100,
        type: "income",
        description: "Salary",
        date: "2025-02-01",
      })
    );

    const res = await GET_INCOME(
      makeGet("/api/reports/income", { dateFrom: "2025-01-01", dateTo: "2025-01-31" })
    );
    expect(res.status).toBe(200);
    const body = await json<{ totalIncome: number; totalExpenses: number; netIncome: number }>(res);
    expect(body.totalExpenses).toBe(50);
    expect(body.totalIncome).toBe(0);
    expect(body.netIncome).toBe(-50);
  });
});
