import { describe, it, expect, beforeEach } from "vitest";
import { setupTestServices, makeGet, makeJson, json } from "./helpers";

setupTestServices();

describe("Transaction API Routes", () => {
  let POST: (req: Request) => Promise<Response>;
  let GET: (req: Request) => Promise<Response>;
  let BATCH_DELETE: (req: Request) => Promise<Response>;
  let BATCH_POST: (req: Request) => Promise<Response>;
  let GET_TAGS: () => Promise<Response>;
  let GET_SUGGEST: (req: Request) => Promise<Response>;
  let GET_BY_ID: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let PATCH: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    const collection = await import("@/app/api/transactions/route");
    const single = await import("@/app/api/transactions/[id]/route");
    const batch = await import("@/app/api/transactions/batch/route");
    const tags = await import("@/app/api/transactions/tags/route");
    const suggest = await import("@/app/api/transactions/suggest/route");
    POST = collection.POST;
    GET = collection.GET;
    BATCH_DELETE = collection.DELETE;
    BATCH_POST = batch.POST;
    GET_TAGS = tags.GET;
    GET_SUGGEST = suggest.GET;
    GET_BY_ID = single.GET;
    PATCH = single.PATCH;
    DELETE = single.DELETE;
  });

  const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

  it("POST creates a transaction and returns 201", async () => {
    const res = await POST(
      makeJson("POST", "/api/transactions", {
        amount: 15,
        description: "Coffee",
        date: "2025-01-15",
        type: "expense",
      })
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body).toMatchObject({ amount: 15, description: "Coffee" });
  });

  it("POST returns 400 on invalid body", async () => {
    const res = await POST(makeJson("POST", "/api/transactions", { amount: -5 }));
    expect(res.status).toBe(400);
    const body = await json<{ code: string }>(res);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("GET lists transactions with pagination", async () => {
    // Seed two transactions
    await POST(
      makeJson("POST", "/api/transactions", {
        amount: 10,
        description: "A",
        date: "2025-01-01",
      })
    );
    await POST(
      makeJson("POST", "/api/transactions", {
        amount: 20,
        description: "B",
        date: "2025-01-02",
      })
    );

    const res = await GET(makeGet("/api/transactions", { limit: "10" }));
    expect(res.status).toBe(200);
    const body = await json<{ data: unknown[]; total: number; hasMore: boolean }>(res);
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.hasMore).toBe(false);
  });

  it("GET filters by date range", async () => {
    await POST(
      makeJson("POST", "/api/transactions", {
        amount: 10,
        description: "Jan",
        date: "2025-01-15",
      })
    );
    await POST(
      makeJson("POST", "/api/transactions", {
        amount: 20,
        description: "Feb",
        date: "2025-02-15",
      })
    );

    const res = await GET(
      makeGet("/api/transactions", { dateFrom: "2025-02-01", dateTo: "2025-02-28" })
    );
    const body = await json<{ data: Array<{ description: string }>; total: number }>(res);
    expect(body.total).toBe(1);
    expect(body.data[0]!.description).toBe("Feb");
  });

  it("GET by ID returns 404 for nonexistent", async () => {
    const res = await GET_BY_ID(makeGet("/api/transactions/999"), ctx(999));
    expect(res.status).toBe(404);
  });

  it("PATCH updates a transaction", async () => {
    const createRes = await POST(
      makeJson("POST", "/api/transactions", {
        amount: 10,
        description: "Old",
        date: "2025-01-01",
      })
    );
    const created = await json<{ id: number }>(createRes);

    const res = await PATCH(
      makeJson("PATCH", `/api/transactions/${created.id}`, { description: "New" }),
      ctx(created.id)
    );
    expect(res.status).toBe(200);
    const body = await json<{ description: string }>(res);
    expect(body.description).toBe("New");
  });

  it("DELETE removes a transaction", async () => {
    const createRes = await POST(
      makeJson("POST", "/api/transactions", {
        amount: 10,
        description: "Delete me",
        date: "2025-01-01",
      })
    );
    const created = await json<{ id: number }>(createRes);

    const res = await DELETE(
      makeJson("DELETE", `/api/transactions/${created.id}`),
      ctx(created.id)
    );
    expect(res.status).toBe(200);

    const getRes = await GET_BY_ID(makeGet(`/api/transactions/${created.id}`), ctx(created.id));
    expect(getRes.status).toBe(404);
  });

  it("DELETE (batch) removes multiple transactions", async () => {
    const r1 = await json<{ id: number }>(
      await POST(
        makeJson("POST", "/api/transactions", {
          amount: 1,
          description: "A",
          date: "2025-01-01",
        })
      )
    );
    const r2 = await json<{ id: number }>(
      await POST(
        makeJson("POST", "/api/transactions", {
          amount: 2,
          description: "B",
          date: "2025-01-02",
        })
      )
    );

    const res = await BATCH_DELETE(
      makeJson("DELETE", "/api/transactions", { ids: [r1.id, r2.id] })
    );
    expect(res.status).toBe(200);
    const body = await json<{ deleted: number }>(res);
    expect(body.deleted).toBe(2);
  });

  it("POST /batch creates multiple transactions", async () => {
    const res = await BATCH_POST(
      makeJson("POST", "/api/transactions/batch", {
        transactions: [
          { amount: 1, description: "A", date: "2025-01-01" },
          { amount: 2, description: "B", date: "2025-01-02" },
        ],
      })
    );
    expect(res.status).toBe(201);
    const body = await json<Array<{ description: string }>>(res);
    expect(body).toHaveLength(2);
    expect(body[0]!.description).toBe("A");
    expect(body[1]!.description).toBe("B");
  });

  it("POST /batch returns 400 with empty transactions array", async () => {
    const res = await BATCH_POST(makeJson("POST", "/api/transactions/batch", { transactions: [] }));
    expect(res.status).toBe(400);
  });

  it("GET /tags returns distinct tags", async () => {
    await POST(
      makeJson("POST", "/api/transactions", {
        amount: 1,
        description: "A",
        date: "2025-01-01",
        tags: ["groceries", "weekly"],
      })
    );
    await POST(
      makeJson("POST", "/api/transactions", {
        amount: 2,
        description: "B",
        date: "2025-01-02",
        tags: ["groceries", "monthly"],
      })
    );

    const res = await GET_TAGS();
    expect(res.status).toBe(200);
    const body = await json<string[]>(res);
    expect(body).toContain("groceries");
    expect(body).toContain("weekly");
    expect(body).toContain("monthly");
    expect(body).toHaveLength(3);
  });

  it("GET /tags returns empty array when no tags", async () => {
    const res = await GET_TAGS();
    expect(res.status).toBe(200);
    const body = await json<string[]>(res);
    expect(body).toEqual([]);
  });

  it("GET /suggest returns frequency-ranked distinct values for a field", async () => {
    for (let i = 0; i < 2; i++) {
      await POST(
        makeJson("POST", "/api/transactions", {
          amount: 1,
          description: "Weekly groceries",
          date: "2025-01-01",
        })
      );
    }
    await POST(
      makeJson("POST", "/api/transactions", {
        amount: 1,
        description: "Weekly gym",
        date: "2025-01-02",
      })
    );

    const res = await GET_SUGGEST(
      makeGet("/api/transactions/suggest", { field: "description", q: "week" })
    );
    expect(res.status).toBe(200);
    const body = await json<string[]>(res);
    expect(body[0]).toBe("Weekly groceries"); // most-used first
    expect(body).toContain("Weekly gym");
  });

  it("GET /suggest returns 400 for a missing/invalid field", async () => {
    const res = await GET_SUGGEST(makeGet("/api/transactions/suggest", { q: "x" }));
    expect(res.status).toBe(400);
    const body = await json<{ code: string }>(res);
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});
