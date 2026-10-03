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
  allocationQuery,
  assetPerformanceQuery,
  currencyExposureQuery,
  netWorthQuery,
  portfolioKeys,
  portfolioQuery,
  realizedPnlQuery,
} from "@/lib/queries/portfolio";
import {
  AssetPerformanceQuerySchema,
  NetWorthQuerySchema,
  RealizedPnlQuerySchema,
  type NetWorthPoint,
  type Window,
} from "@/lib/validators/portfolio-reports";

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

function netWorth(total: number): NetWorthPoint[] {
  return [{ date: "2026-06-30", cash: total, assets: 0, total }];
}

describe("portfolio query params through the query string", () => {
  it.each([
    {
      label: "a net-worth window",
      schema: NetWorthQuerySchema,
      params: { window: "ytd", interval: "weekly" },
    },
    { label: "the default net-worth window", schema: NetWorthQuerySchema, params: {} },
    { label: "performance over all time", schema: AssetPerformanceQuerySchema, params: {} },
    {
      label: "performance over a period",
      schema: AssetPerformanceQuerySchema,
      params: { from: "2026-01-01", to: "2026-06-30" },
    },
    {
      label: "realized P&L over a period",
      schema: RealizedPnlQuerySchema,
      params: { from: "2026-01-01", to: "2026-06-30" },
    },
  ] as const)("validates $label as the params themselves do", ({ schema, params }) => {
    const wire = throughTheWire(schema, params);

    expect(wire.success).toBe(true);
    expect(wire.data).toEqual(schema.parse(params));
  });
});

describe("portfolio queries", () => {
  it("keys each report and each set of params apart", () => {
    const keys = [
      portfolioQuery().queryKey,
      netWorthQuery({ window: "6m", interval: "monthly" }).queryKey,
      netWorthQuery({ window: "12m", interval: "monthly" }).queryKey,
      assetPerformanceQuery({}).queryKey,
      allocationQuery().queryKey,
      currencyExposureQuery().queryKey,
      realizedPnlQuery({}).queryKey,
    ];

    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
    for (const key of keys) expect(key[0]).toBe(portfolioKeys.all[0]);
  });

  it.each([
    { label: "the portfolio", use: () => useQuery(portfolioQuery()), url: "/api/portfolio" },
    {
      label: "net worth",
      use: () => useQuery(netWorthQuery({ window: "12m", interval: "monthly" })),
      url: "/api/portfolio/net-worth?window=12m&interval=monthly",
    },
    {
      label: "performance",
      use: () => useQuery(assetPerformanceQuery({})),
      url: "/api/portfolio/performance",
    },
    {
      label: "allocation",
      use: () => useQuery(allocationQuery()),
      url: "/api/portfolio/allocation",
    },
    {
      label: "currency exposure",
      use: () => useQuery(currencyExposureQuery()),
      url: "/api/portfolio/currency-exposure",
    },
    {
      label: "realized P&L",
      use: () => useQuery(realizedPnlQuery({ from: "2026-01-01" })),
      url: "/api/portfolio/realized-pnl?from=2026-01-01",
    },
  ])("asks the API for $label", async ({ use, url }) => {
    expect(await requestedUrl(use)).toBe(url);
  });
});

describe("switching the net-worth window", () => {
  function renderWindow(initial: Window) {
    return renderHook(
      ({ window }: { window: Window }) =>
        useQuery({
          ...netWorthQuery({ window, interval: "monthly" }),
          placeholderData: keepPreviousData,
        }),
      { wrapper, initialProps: { window: initial } }
    );
  }

  it("shows the window picked last, even when an earlier pick answers after it", async () => {
    const { result, rerender } = renderWindow("6m");
    await waitFor(() => expect(requests).toHaveLength(1));
    requests[0]!.respond(netWorth(6));
    await waitFor(() => expect(result.current.data).toEqual(netWorth(6)));

    rerender({ window: "all" });
    rerender({ window: "3m" });
    await waitFor(() => expect(requests).toHaveLength(3));
    // While the new window loads, the old line stays on screen, marked as stale.
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data).toEqual(netWorth(6));

    requests[2]!.respond(netWorth(3));
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    requests[1]!.respond(netWorth(99));

    await waitFor(() => expect(result.current.data).toEqual(netWorth(3)));
  });

  it("shows a failed window's error instead of the previous window's line", async () => {
    const { result, rerender } = renderWindow("6m");
    await waitFor(() => expect(requests).toHaveLength(1));
    requests[0]!.respond(netWorth(6));
    await waitFor(() => expect(result.current.data).toEqual(netWorth(6)));

    rerender({ window: "12m" });
    await waitFor(() => expect(requests).toHaveLength(2));
    requests[1]!.respond({ error: "Database is locked", code: "INTERNAL_ERROR" }, 500);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Database is locked");
    expect(result.current.data).toBeUndefined();
  });
});
