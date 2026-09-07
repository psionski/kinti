import { makeTestDb } from "@/test/helpers";
import { TransactionService } from "@/lib/services/transactions";
import { CategoryService } from "@/lib/services/categories";
import { ReportService } from "@/lib/services/reports";
import { BudgetService } from "@/lib/services/budgets";
import { RecurringService } from "@/lib/services/recurring";
import { AssetService } from "@/lib/services/assets";
import { AssetPriceService } from "@/lib/services/asset-prices";
import type { AppDb } from "@/lib/db";

/**
 * Mock the api/services module so route handlers use an in-memory test DB.
 *
 * Call this in `beforeAll` / `beforeEach` — it returns the test DB so you can
 * seed data and assert state directly.
 */
export function setupTestServices(): { getDb: () => AppDb } {
  let db: AppDb;

  beforeEach(() => {
    db = makeTestDb();

    // Dynamic import mock — vi.mock hoists, so we use factory
    vi.doMock("@/lib/api/services", () => ({
      getTransactionService: () => new TransactionService(db),
      getCategoryService: () => new CategoryService(db),
      getReportService: () => new ReportService(db),
      getBudgetService: () => new BudgetService(db, new ReportService(db)),
      getRecurringService: () => new RecurringService(db),
      getAssetService: () => new AssetService(db),
      getAssetPriceService: () => new AssetPriceService(db),
    }));

    // Also mock getDb for the receipt route which imports it directly
    vi.doMock("@/lib/db", () => ({
      getDb: () => db,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  return {
    getDb: () => db,
  };
}

/** Build a GET Request with query params. */
export function makeGet(path: string, params?: Record<string, string>): Request {
  const url = new URL(path, "http://localhost:4000");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return new Request(url.toString(), { method: "GET" });
}

/** Build a POST/PATCH/DELETE Request with a JSON body. */
export function makeJson(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Request {
  return new Request(new URL(path, "http://localhost:4000").toString(), {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Extract JSON from a Response. */
export async function json<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
