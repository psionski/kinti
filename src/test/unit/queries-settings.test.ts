// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { z } from "zod";
import { makeQueryClient } from "@/lib/query-client";
import {
  useAddOpeningAssets,
  useClearSampleData,
  useSetBaseCurrency,
  useSetTimezone,
  useSetTutorial,
  type OpeningAsset,
} from "@/lib/queries/settings";
import { SetBaseCurrencySchema, SetTimezoneSchema } from "@/lib/validators/settings";
import { CreateAssetSchema, CreateOpeningLotSchema } from "@/lib/validators/assets";

let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;

function respond(status: number, body: unknown): void {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

function renderWithClient<T>(hook: () => T) {
  return renderHook(hook, {
    wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
  });
}

/** Each request sent, with its JSON body decoded. */
function sent(): { path: string; method: string | undefined; body: unknown }[] {
  return (fetchMock.mock.calls as [string, RequestInit][]).map(([path, init]) => ({
    path,
    method: init.method,
    body: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
  }));
}

/** Whether the route that parses `schema` accepts `body`. */
function accepts(schema: z.ZodType, body: unknown): boolean {
  return schema.safeParse(body).success;
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  client = makeQueryClient();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("settings writes", () => {
  it("puts the timezone in a body its route accepts", async () => {
    respond(200, { timezone: "Europe/Sofia" });
    const { result } = renderWithClient(useSetTimezone);

    await result.current.mutateAsync({ timezone: "Europe/Sofia" });

    const [request] = sent();
    expect(request).toMatchObject({ path: "/api/settings/timezone", method: "PUT" });
    expect(accepts(SetTimezoneSchema, request!.body)).toBe(true);
  });

  it("puts the base currency in a body its route accepts", async () => {
    respond(200, { currency: "BGN" });
    const { result } = renderWithClient(useSetBaseCurrency);

    await result.current.mutateAsync({ currency: "BGN" });

    const [request] = sent();
    expect(request).toMatchObject({ path: "/api/settings/base-currency", method: "PUT" });
    expect(accepts(SetBaseCurrencySchema, request!.body)).toBe(true);
  });

  it("surfaces the API's refusal to change the base currency", async () => {
    respond(400, { error: "Base currency is already set to EUR", code: "VALIDATION_ERROR" });
    const { result } = renderWithClient(useSetBaseCurrency);

    await expect(result.current.mutateAsync({ currency: "USD" })).rejects.toThrow(
      "Base currency is already set to EUR"
    );
  });

  it("puts the tutorial flag as a boolean", async () => {
    respond(200, { tutorial: false });
    const { result } = renderWithClient(useSetTutorial);

    await result.current.mutateAsync(false);

    expect(sent()).toEqual([
      { path: "/api/settings/tutorial", method: "PUT", body: { tutorial: false } },
    ]);
  });

  it("deletes the sample data", async () => {
    respond(200, { cleared: true });
    const { result } = renderWithClient(useClearSampleData);

    await result.current.mutateAsync();

    expect(sent()).toEqual([{ path: "/api/sample-data", method: "DELETE", body: undefined }]);
  });
});

describe("useAddOpeningAssets", () => {
  const savings: OpeningAsset = {
    key: "savings",
    asset: { name: "Savings", type: "deposit", currency: "EUR" },
    lot: { quantity: 2500, pricePerUnit: 1, date: "2026-03-01" },
  };
  const bitcoin: OpeningAsset = {
    key: "bitcoin",
    asset: { name: "Bitcoin", type: "crypto", currency: "EUR" },
    lot: { quantity: 0.5, pricePerUnit: 40000, date: "2026-03-01" },
  };

  /** Run an attempt that may fail, then let the hook re-render with what it saved. */
  async function attempt(
    result: { current: ReturnType<typeof useAddOpeningAssets> },
    holdings: OpeningAsset[]
  ): Promise<void> {
    await act(async () => {
      await result.current.mutateAsync(holdings).catch(() => undefined);
    });
  }

  it("creates each asset, then opens it with a lot under the id the API gave it", async () => {
    respond(201, { id: 7 });
    respond(201, { id: 1 });
    respond(201, { id: 8 });
    respond(201, { id: 2 });
    const { result } = renderWithClient(useAddOpeningAssets);

    await result.current.mutateAsync([savings, bitcoin]);

    const requests = sent();
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /api/assets",
      "POST /api/assets/7/lots",
      "POST /api/assets",
      "POST /api/assets/8/lots",
    ]);
    expect(requests.map((r) => r.body)).toEqual([
      savings.asset,
      savings.lot,
      bitcoin.asset,
      bitcoin.lot,
    ]);
    expect(accepts(CreateAssetSchema, requests[0]!.body)).toBe(true);
    expect(accepts(CreateOpeningLotSchema, requests[1]!.body)).toBe(true);
  });

  it("stops at the first refusal and reports the API's message", async () => {
    respond(201, { id: 7 });
    respond(400, { error: "Date cannot be in the future", code: "VALIDATION_ERROR" });
    const { result } = renderWithClient(useAddOpeningAssets);

    await expect(result.current.mutateAsync([savings, bitcoin])).rejects.toThrow(
      "Date cannot be in the future"
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resumes a retry after the holdings already saved", async () => {
    respond(201, { id: 7 });
    respond(201, { id: 1 });
    respond(500, { error: "Database is locked", code: "INTERNAL_ERROR" });
    const { result } = renderWithClient(useAddOpeningAssets);
    await attempt(result, [savings, bitcoin]);
    fetchMock.mockClear();

    respond(201, { id: 8 });
    respond(201, { id: 2 });
    await attempt(result, [savings, bitcoin]);

    expect(sent().map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /api/assets",
      "POST /api/assets/8/lots",
    ]);
    expect(sent()[0]!.body).toEqual(bitcoin.asset);
    expect(result.current.isSuccess).toBe(true);
  });

  it("books only the lot when the asset was created but its lot was refused", async () => {
    respond(201, { id: 7 });
    respond(400, { error: "Date cannot be in the future", code: "VALIDATION_ERROR" });
    const { result } = renderWithClient(useAddOpeningAssets);
    await attempt(result, [savings]);
    fetchMock.mockClear();

    respond(201, { id: 1 });
    await attempt(result, [{ ...savings, lot: { ...savings.lot, date: "2026-02-28" } }]);

    expect(sent()).toEqual([
      {
        path: "/api/assets/7/lots",
        method: "POST",
        body: { ...savings.lot, date: "2026-02-28" },
      },
    ]);
  });

  it("says which holdings already have their asset", async () => {
    respond(201, { id: 7 });
    respond(400, { error: "Date cannot be in the future", code: "VALIDATION_ERROR" });
    const { result } = renderWithClient(useAddOpeningAssets);
    expect(result.current.isCreated("savings")).toBe(false);

    await attempt(result, [savings, bitcoin]);

    expect(result.current.isCreated("savings")).toBe(true);
    expect(result.current.isCreated("bitcoin")).toBe(false);
  });
});
