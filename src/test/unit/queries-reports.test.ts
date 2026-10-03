// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  keepPreviousData,
  useQuery,
} from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { z } from "zod";
import {
  searchParamsToObject,
  toSearchParams,
  type SearchParamsInput,
} from "@/lib/api/search-params";
import {
  categoryTrendsQuery,
  netIncomeQuery,
  reportKeys,
  spendingSummaryQuery,
  topMerchantsQuery,
  trendsQuery,
  type NetIncomeParams,
} from "@/lib/queries/reports";
import {
  CategoryTrendsSchema,
  NetIncomeSchema,
  SpendingSummarySchema,
  TopMerchantsSchema,
  TrendsSchema,
  type NetIncomeResult,
} from "@/lib/validators/reports";

/** What the API's handler validates after a client sends `params` in the query string. */
function throughTheWire(schema: z.ZodType, params: SearchParamsInput) {
  return schema.safeParse(searchParamsToObject(toSearchParams(params), schema));
}

interface SentRequest {
  url: string;
  respond: (body: unknown, status?: number) => void;
}

/** Requests sent so far, answered by the test in whatever order it likes. */
let requests: SentRequest[];

beforeEach(() => {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
          requests.push({
            url,
            respond: (body, status = 200) =>
              resolve(new Response(JSON.stringify(body), { status })),
          });
        })
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

/** The URL a query hook requests. */
async function requestedUrl(useReport: () => unknown): Promise<string> {
  renderHook(useReport, { wrapper });
  await waitFor(() => expect(requests).toHaveLength(1));
  return requests[0]!.url;
}

function balance(totalIncome: number): NetIncomeResult {
  return {
    totalIncome,
    totalExpenses: 100,
    netIncome: totalIncome - 100,
    transactionCount: 3,
    currency: "EUR",
  };
}

describe("report query params through the query string", () => {
  it.each([
    {
      label: "net income over a period",
      schema: NetIncomeSchema,
      params: { dateFrom: "2026-01-01", dateTo: "2026-06-30" },
    },
    { label: "net income over all time", schema: NetIncomeSchema, params: {} },
    { label: "trends", schema: TrendsSchema, params: { months: 12, type: "income" } },
    {
      label: "one category's trend",
      schema: TrendsSchema,
      params: { months: 3, type: "expense", categoryId: 7 },
    },
    {
      label: "category trends",
      schema: CategoryTrendsSchema,
      params: { dateFrom: "2026-01-01", dateTo: "2026-06-30", type: "expense" },
    },
    {
      label: "a summary against a comparison period",
      schema: SpendingSummarySchema,
      params: {
        dateFrom: "2026-01-01",
        dateTo: "2026-06-30",
        groupBy: "category",
        type: "expense",
        compareDateFrom: "2025-07-01",
        compareDateTo: "2025-12-31",
        includeTransfers: true,
      },
    },
    {
      label: "top merchants",
      schema: TopMerchantsSchema,
      params: { dateFrom: "2026-01-01", dateTo: "2026-06-30", type: "expense", limit: 25 },
    },
  ] as const)("validates $label as the params themselves do", ({ schema, params }) => {
    const wire = throughTheWire(schema, params);

    expect(wire.success).toBe(true);
    expect(wire.data).toEqual(schema.parse(params));
  });
});

describe("report queries", () => {
  it("keys each report and each set of params apart", () => {
    const period = { dateFrom: "2026-01-01", dateTo: "2026-06-30" };
    const keys = [
      netIncomeQuery(period).queryKey,
      netIncomeQuery({ ...period, dateTo: "2026-03-31" }).queryKey,
      trendsQuery({ months: 6, type: "income" }).queryKey,
      trendsQuery({ months: 6, type: "expense" }).queryKey,
      categoryTrendsQuery(period).queryKey,
      spendingSummaryQuery(period).queryKey,
      topMerchantsQuery(period).queryKey,
    ];

    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
    for (const key of keys) expect(key[0]).toBe(reportKeys.all[0]);
  });

  it.each([
    {
      label: "net income",
      use: () => useQuery(netIncomeQuery({ dateFrom: "2026-01-01", dateTo: "2026-06-30" })),
      url: "/api/reports/income?dateFrom=2026-01-01&dateTo=2026-06-30",
    },
    {
      label: "trends",
      use: () => useQuery(trendsQuery({ months: 6, type: "income" })),
      url: "/api/reports/trends?months=6&type=income",
    },
    {
      label: "category trends",
      use: () =>
        useQuery(
          categoryTrendsQuery({ dateFrom: "2026-01-01", dateTo: "2026-06-30", type: "expense" })
        ),
      url: "/api/reports/category-trends?dateFrom=2026-01-01&dateTo=2026-06-30&type=expense",
    },
    {
      label: "the spending summary",
      use: () =>
        useQuery(
          spendingSummaryQuery({
            dateFrom: "2026-01-01",
            dateTo: "2026-06-30",
            compareDateFrom: "2025-07-01",
            compareDateTo: "2025-12-31",
          })
        ),
      url: "/api/reports/summary?dateFrom=2026-01-01&dateTo=2026-06-30&compareDateFrom=2025-07-01&compareDateTo=2025-12-31",
    },
    {
      label: "top merchants",
      use: () => useQuery(topMerchantsQuery({ dateFrom: "2026-01-01", dateTo: "2026-06-30" })),
      url: "/api/reports/top-merchants?dateFrom=2026-01-01&dateTo=2026-06-30",
    },
  ])("asks the API for $label", async ({ use, url }) => {
    expect(await requestedUrl(use)).toBe(url);
  });
});

describe("switching a report's range", () => {
  const MARCH = { dateFrom: "2026-03-01", dateTo: "2026-03-31" };
  const Q2 = { dateFrom: "2026-04-01", dateTo: "2026-06-30" };
  const H1 = { dateFrom: "2026-01-01", dateTo: "2026-06-30" };

  function renderRange(initial: NetIncomeParams) {
    return renderHook(
      ({ params }: { params: NetIncomeParams }) =>
        useQuery({ ...netIncomeQuery(params), placeholderData: keepPreviousData }),
      { wrapper, initialProps: { params: initial } }
    );
  }

  it("shows the range picked last, even when an earlier pick answers after it", async () => {
    const { result, rerender } = renderRange(MARCH);
    await waitFor(() => expect(requests).toHaveLength(1));
    requests[0]!.respond(balance(1));
    await waitFor(() => expect(result.current.data).toEqual(balance(1)));

    rerender({ params: Q2 });
    rerender({ params: H1 });
    await waitFor(() => expect(requests).toHaveLength(3));
    // While the new range loads, the old figures stay on screen, marked as stale.
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data).toEqual(balance(1));

    requests[2]!.respond(balance(3));
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    requests[1]!.respond(balance(2));

    await waitFor(() => expect(result.current.data).toEqual(balance(3)));
  });

  it("shows a failed range's error instead of the previous range's figures", async () => {
    const { result, rerender } = renderRange(MARCH);
    await waitFor(() => expect(requests).toHaveLength(1));
    requests[0]!.respond(balance(1));
    await waitFor(() => expect(result.current.data).toEqual(balance(1)));

    rerender({ params: H1 });
    await waitFor(() => expect(requests).toHaveLength(2));
    requests[1]!.respond({ error: "Database is locked", code: "INTERNAL_ERROR" }, 500);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Database is locked");
    expect(result.current.data).toBeUndefined();
  });
});
