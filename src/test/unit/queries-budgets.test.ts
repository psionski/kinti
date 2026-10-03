// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  keepPreviousData,
  useQuery,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { z } from "zod";
import {
  searchParamsToObject,
  toSearchParams,
  type SearchParamsInput,
} from "@/lib/api/search-params";
import {
  budgetStatsQuery,
  budgetStatusQuery,
  useDeleteBudget,
  useResetBudgets,
  useSetBudget,
} from "@/lib/queries/budgets";
import {
  DeleteBudgetSchema,
  GetBudgetStatusSchema,
  type BudgetStatusResponse,
} from "@/lib/validators/budgets";
import { BudgetStatsSchema } from "@/lib/validators/reports";

/** What the API's handler validates after a client sends `params` in the query string. */
function throughTheWire(schema: z.ZodType, params: SearchParamsInput) {
  return schema.safeParse(searchParamsToObject(toSearchParams(params), schema));
}

interface SentRequest {
  url: string;
  init: RequestInit | undefined;
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
            init,
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

/** Run a mutation hook once, answering its request with success. */
async function send<V>(
  useMutationHook: () => { mutateAsync: (variables: V) => Promise<unknown> },
  variables: V
): Promise<{ url: string; init: RequestInit | undefined }> {
  const { result } = renderHook(useMutationHook, { wrapper });
  const done = act(() => result.current.mutateAsync(variables));
  await waitFor(() => expect(requests).toHaveLength(1));
  requests[0]!.respond({ success: true });
  await done;
  return requests[0]!;
}

function status(month: string): BudgetStatusResponse {
  return {
    items: [
      {
        categoryId: 1,
        categoryName: `Food ${month}`,
        budgetAmount: 200,
        spentAmount: 50,
        remainingAmount: 150,
        percentUsed: 25,
        isOver: false,
      },
    ],
    inheritedFrom: null,
    currency: "EUR",
  };
}

describe("budget query params through the query string", () => {
  it("keeps the month as text the budgets route accepts", () => {
    const wire = throughTheWire(GetBudgetStatusSchema, { month: "2026-03" });

    expect(wire.success).toBe(true);
    expect(wire.data).toEqual({ month: "2026-03" });
  });

  it.each([
    { label: "only a month", params: { month: "2026-03" } },
    {
      label: "every option",
      params: {
        month: "2026-03",
        type: "all",
        includeZeroSpend: false,
        includeUncategorized: true,
      },
    },
  ] as const)("validates budget stats with $label as the params themselves do", ({ params }) => {
    const wire = throughTheWire(BudgetStatsSchema, params);

    expect(wire.success).toBe(true);
    expect(wire.data).toEqual(BudgetStatsSchema.parse(params));
  });

  it("names the budget to delete in a form the delete route accepts", () => {
    const wire = throughTheWire(DeleteBudgetSchema, { categoryId: 4, month: "2026-03" });

    expect(wire.data).toEqual({ categoryId: 4, month: "2026-03" });
  });
});

describe("budget queries", () => {
  it("keys each month apart, and status apart from stats", () => {
    const march = budgetStatusQuery({ month: "2026-03" }).queryKey;

    expect(march).not.toEqual(budgetStatusQuery({ month: "2026-04" }).queryKey);
    expect(march).not.toEqual(budgetStatsQuery({ month: "2026-03" }).queryKey);
  });

  it("asks the budgets route for the month's status", async () => {
    const { result } = renderHook(() => useQuery(budgetStatusQuery({ month: "2026-03" })), {
      wrapper,
    });
    await waitFor(() => expect(requests).toHaveLength(1));
    requests[0]!.respond(status("2026-03"));

    await waitFor(() => expect(result.current.data).toEqual(status("2026-03")));
    expect(requests[0]!.url).toBe("/api/budgets?month=2026-03");
  });

  it("asks the budget-stats report for the month's spending", async () => {
    renderHook(() => useQuery(budgetStatsQuery({ month: "2026-03" })), { wrapper });

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.url).toBe("/api/reports/budget-stats?month=2026-03");
  });

  it("shows the month asked for last, even when an earlier month answers after it", async () => {
    const { result, rerender } = renderHook(
      ({ month }: { month: string }) =>
        useQuery({ ...budgetStatusQuery({ month }), placeholderData: keepPreviousData }),
      { wrapper, initialProps: { month: "2026-03" } }
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    requests[0]!.respond(status("2026-03"));
    await waitFor(() => expect(result.current.data).toEqual(status("2026-03")));

    rerender({ month: "2026-04" });
    rerender({ month: "2026-05" });
    await waitFor(() => expect(requests).toHaveLength(3));
    // While May loads, March stays on screen, marked as a placeholder.
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data).toEqual(status("2026-03"));

    requests[2]!.respond(status("2026-05"));
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    requests[1]!.respond(status("2026-04"));

    await waitFor(() => expect(result.current.data).toEqual(status("2026-05")));
  });
});

describe("budget mutations", () => {
  it("sets a budget with a JSON body", async () => {
    const { url, init } = await send(useSetBudget, {
      categoryId: 4,
      month: "2026-03",
      amount: 200,
    });

    expect(url).toBe("/api/budgets");
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ categoryId: 4, month: "2026-03", amount: 200 }),
    });
  });

  it("deletes a budget named in the query string", async () => {
    const { url, init } = await send(useDeleteBudget, { categoryId: 4, month: "2026-03" });

    expect(url).toBe("/api/budgets?categoryId=4&month=2026-03");
    expect(init).toMatchObject({ method: "DELETE", body: undefined });
  });

  it("resets a month to inherited budgets", async () => {
    const { url, init } = await send(useResetBudgets, { month: "2026-03" });

    expect(url).toBe("/api/budgets/reset");
    expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ month: "2026-03" }) });
  });
});
