import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeTestDb } from "@/test/helpers";
import { TransactionService } from "@/lib/services/transactions";
import { CategoryService } from "@/lib/services/categories";
import { ReportService } from "@/lib/services/reports";
import { BudgetService } from "@/lib/services/budgets";
import { RecurringService } from "@/lib/services/recurring";
import { ReceiptService } from "@/lib/services/receipts";
import type { AppDb } from "@/lib/db";

// Mock fs — ReceiptService uses it for image file ops
vi.mock("fs", () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => Buffer.from("fake-image")),
  unlinkSync: vi.fn(),
}));

// ─── MCP JSON-RPC helpers ────────────────────────────────────────────────────

const MCP_BASE = "http://localhost:4000/api/mcp";

function mcpRequest(body: unknown): Request {
  return new Request(MCP_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
}

function initRequest() {
  return mcpRequest({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test-client", version: "0.0.1" },
    },
  });
}

function toolsListRequest() {
  return mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
}

function toolCallRequest(name: string, args: Record<string, unknown>) {
  return mcpRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name, arguments: args },
  });
}

async function parseResult(res: Response): Promise<unknown> {
  const body = await res.json();
  return (body as { result?: unknown }).result;
}

function parseToolText(result: unknown): unknown {
  const text = (result as { content: { text: string }[] }).content[0].text;
  return JSON.parse(text);
}

// ─── Test setup ──────────────────────────────────────────────────────────────

let db: AppDb;

beforeEach(() => {
  db = makeTestDb();

  vi.doMock("@/lib/api/services", () => ({
    getTransactionService: () => new TransactionService(db),
    getCategoryService: () => new CategoryService(db),
    getReportService: () => new ReportService(db),
    getBudgetService: () => new BudgetService(db, new ReportService(db)),
    getRecurringService: () => new RecurringService(db),
    getReceiptService: () => new ReceiptService(db),
  }));

  vi.doMock("@/lib/db", () => ({
    getDb: () => db,
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Infrastructure ──────────────────────────────────────────────────────────

describe("MCP infrastructure", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    POST = (await import("@/app/api/mcp/route")).POST;
  });

  it("responds to initialize", async () => {
    const res = await POST(initRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect((body as { result?: { serverInfo?: { name: string } } }).result?.serverInfo?.name).toBe(
      "kinti"
    );
  });

  it("lists all registered tools", async () => {
    await POST(initRequest());
    const res = await POST(toolsListRequest());
    expect(res.status).toBe(200);
    const result = await parseResult(res);
    const tools = (result as { tools: { name: string }[] }).tools.map((t) => t.name);
    expect(tools).toContain("create_transaction");
    expect(tools).toContain("list_categories");
    expect(tools).toContain("query");
    expect(tools).toContain("delete_receipt");
  });
});

// ─── query tool — SQL validation + direct DB access ──────────────────────────

describe("query tool", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    POST = (await import("@/app/api/mcp/route")).POST;
    await POST(initRequest());
  });

  it("executes read-only SQL and returns rows", async () => {
    const svc = new TransactionService(db);
    svc.create({ amount: 3, description: "Test", date: "2025-06-01", type: "expense" });

    const res = await POST(
      toolCallRequest("query", { sql: "SELECT count(*) AS n FROM transactions" })
    );
    const rows = parseToolText(await parseResult(res)) as { n: number }[];
    expect(rows[0].n).toBe(1);
  });

  it("rejects non-SELECT statements", async () => {
    const res = await POST(toolCallRequest("query", { sql: "DELETE FROM transactions" }));
    const body = await res.json();
    expect((body as { result?: { isError?: boolean } }).result?.isError).toBe(true);
  });

  it("allows WITH (CTE) statements", async () => {
    const res = await POST(
      toolCallRequest("query", {
        sql: "WITH cte AS (SELECT 1 AS x) SELECT * FROM cte",
      })
    );
    const rows = parseToolText(await parseResult(res)) as { x: number }[];
    expect(rows[0].x).toBe(1);
  });

  it("rejects INSERT disguised with leading whitespace", async () => {
    const res = await POST(
      toolCallRequest("query", { sql: "  INSERT INTO transactions VALUES (1)" })
    );
    const body = await res.json();
    expect((body as { result?: { isError?: boolean } }).result?.isError).toBe(true);
  });
});

// ─── get_db_schema — direct sqlite_master query + filtering ──────────────────

describe("get_db_schema tool", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    POST = (await import("@/app/api/mcp/route")).POST;
    await POST(initRequest());
  });

  it("returns user tables with DDL and conventions", async () => {
    const res = await POST(toolCallRequest("get_db_schema", {}));
    expect(res.status).toBe(200);
    const data = parseToolText(await parseResult(res)) as {
      tables: { name: string; sql: string }[];
      conventions: string;
    };
    const names = data.tables.map((t) => t.name);
    expect(names).toContain("transactions");
    expect(names).toContain("categories");
    expect(names).toContain("budgets");
    expect(data.conventions).toContain("ISO 8601");
  });

  it("excludes internal sqlite tables and FTS tables", async () => {
    const res = await POST(toolCallRequest("get_db_schema", {}));
    const data = parseToolText(await parseResult(res)) as {
      tables: { name: string }[];
    };
    const names = data.tables.map((t) => t.name);
    expect(names.every((n) => !n.startsWith("sqlite_"))).toBe(true);
    expect(names.every((n) => !n.includes("_fts_"))).toBe(true);
  });
});

// ─── delete_transaction — array/single polymorphism ──────────────────────────

describe("delete_transaction tool", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    POST = (await import("@/app/api/mcp/route")).POST;
    await POST(initRequest());
  });

  it("deletes a single transaction by ID", async () => {
    const svc = new TransactionService(db);
    const tx = await svc.create({
      amount: 1,
      description: "Single",
      date: "2025-06-01",
      type: "expense",
    });

    const res = await POST(toolCallRequest("delete_transaction", { id: tx.id }));
    expect(res.status).toBe(200);
    const data = parseToolText(await parseResult(res)) as { deleted: number };
    expect(data.deleted).toBe(1);
    expect(svc.getById(tx.id)).toBeNull();
  });

  it("deletes multiple transactions when given an array", async () => {
    const svc = new TransactionService(db);
    const tx1 = await svc.create({
      amount: 1,
      description: "A",
      date: "2025-06-01",
      type: "expense",
    });
    const tx2 = await svc.create({
      amount: 2,
      description: "B",
      date: "2025-06-01",
      type: "expense",
    });

    const res = await POST(toolCallRequest("delete_transaction", { id: [tx1.id, tx2.id] }));
    expect(res.status).toBe(200);
    const data = parseToolText(await parseResult(res)) as { deleted: number };
    expect(data.deleted).toBe(2);
  });

  it("throws for non-existent single ID", async () => {
    const res = await POST(toolCallRequest("delete_transaction", { id: 99999 }));
    const body = await res.json();
    expect((body as { result?: { isError?: boolean } }).result?.isError).toBe(true);
  });
});

// ─── delete_receipt — array/single polymorphism ──────────────────────────────

describe("delete_receipt tool", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    POST = (await import("@/app/api/mcp/route")).POST;
    await POST(initRequest());
  });

  it("deletes a single receipt by ID", async () => {
    const svc = new ReceiptService(db);
    const r = svc.upload(Buffer.from("img"), ".jpg", { date: "2025-06-01" });

    const res = await POST(toolCallRequest("delete_receipt", { id: r.id }));
    expect(res.status).toBe(200);
    const data = parseToolText(await parseResult(res)) as { deleted: number };
    expect(data.deleted).toBe(1);
    expect(svc.getById(r.id)).toBeNull();
  });

  it("deletes multiple receipts when given an array", async () => {
    const svc = new ReceiptService(db);
    const r1 = svc.upload(Buffer.from("img"), ".jpg", { date: "2025-06-01" });
    const r2 = svc.upload(Buffer.from("img"), ".jpg", { date: "2025-06-02" });

    const res = await POST(toolCallRequest("delete_receipt", { id: [r1.id, r2.id] }));
    expect(res.status).toBe(200);
    const data = parseToolText(await parseResult(res)) as { deleted: number };
    expect(data.deleted).toBe(2);
  });

  it("throws for non-existent single ID", async () => {
    const res = await POST(toolCallRequest("delete_receipt", { id: 99999 }));
    const body = await res.json();
    expect((body as { result?: { isError?: boolean } }).result?.isError).toBe(true);
  });
});
