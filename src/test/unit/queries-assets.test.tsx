// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { makeQueryClient } from "@/lib/query-client";
import { searchParamsToObject, toSearchParams } from "@/lib/api/search-params";
import {
  assetHistoryQuery,
  assetListQuery,
  assetLotsQuery,
  assetQuery,
  useBuyAsset,
  useCreateAsset,
  useDeleteAsset,
  useRecordAssetPrice,
  useSellAsset,
  useUpdateAsset,
  type AssetHistoryParams,
} from "@/lib/queries/assets";
import {
  BuyAssetSchema,
  CreateAssetSchema,
  RecordPriceSchema,
  SellAssetSchema,
  UpdateAssetSchema,
} from "@/lib/validators/assets";
import { AssetHistoryQuerySchema } from "@/lib/validators/portfolio-reports";

/** What the API's GET handler validates after a client sends `params`. */
function throughTheWire(schema: z.ZodType, params: Parameters<typeof toSearchParams>[0]) {
  return schema.safeParse(searchParamsToObject(toSearchParams(params), schema));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(Response.json({})));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The path, query, method and JSON body of the `n`th request sent. */
function requested(n = 0): { url: string; method: string; body: unknown } {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  return {
    url,
    method: init.method ?? "GET",
    body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
  };
}

function renderMutation<T>(useHook: () => T): T {
  const client = makeQueryClient();
  return renderHook(useHook, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  }).result.current;
}

describe("asset history params", () => {
  it.each([
    { label: "the default window", params: {} },
    { label: "a chosen window", params: { window: "12m" } },
  ] satisfies { label: string; params: AssetHistoryParams }[])(
    "validates $label exactly as sending the params directly would",
    ({ params }) => {
      const wire = throughTheWire(AssetHistoryQuerySchema, params);

      expect(wire.success).toBe(true);
      expect(wire.data).toEqual(AssetHistoryQuerySchema.parse(params));
    }
  );

  it("keys each window of each asset apart", () => {
    const keys = [
      assetHistoryQuery(1, { window: "3m" }).queryKey,
      assetHistoryQuery(1, { window: "6m" }).queryKey,
      assetHistoryQuery(2, { window: "3m" }).queryKey,
    ].map((key) => JSON.stringify(key));

    expect(new Set(keys).size).toBe(3);
  });
});

describe("asset queries", () => {
  it.each([
    {
      label: "the list",
      read: (client: QueryClient) => client.query(assetListQuery()),
      url: "/api/assets",
    },
    {
      label: "one asset",
      read: (client: QueryClient) => client.query(assetQuery(7)),
      url: "/api/assets/7",
    },
    {
      label: "its lots",
      read: (client: QueryClient) => client.query(assetLotsQuery(7)),
      url: "/api/assets/7/lots",
    },
    {
      label: "its history",
      read: (client: QueryClient) => client.query(assetHistoryQuery(7, { window: "all" })),
      url: "/api/assets/7/history?window=all",
    },
  ])("reads $label from $url", async ({ read, url }) => {
    await read(makeQueryClient());

    expect(requested().url).toBe(url);
  });
});

describe("asset mutations", () => {
  it("creates an asset from a body the route accepts", async () => {
    const body = {
      name: "Bitcoin",
      type: "crypto",
      currency: "EUR",
      symbolMap: { coingecko: "bitcoin" },
    } as const;

    await renderMutation(useCreateAsset).mutateAsync(body);

    expect(requested()).toMatchObject({ url: "/api/assets", method: "POST", body });
    expect(CreateAssetSchema.safeParse(requested().body).success).toBe(true);
  });

  it("sends an update to the asset's own path, without its id in the body", async () => {
    await renderMutation(useUpdateAsset).mutateAsync({ id: 4, symbolMap: null });

    expect(requested()).toEqual({
      url: "/api/assets/4",
      method: "PATCH",
      body: { symbolMap: null },
    });
    expect(UpdateAssetSchema.safeParse(requested().body).success).toBe(true);
  });

  it("deletes an asset, reading nothing back from the 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(renderMutation(useDeleteAsset).mutateAsync(4)).resolves.toBeUndefined();

    expect(requested()).toMatchObject({ url: "/api/assets/4", method: "DELETE" });
  });

  it.each([
    { label: "buy", useHook: useBuyAsset, path: "buy", schema: BuyAssetSchema },
    { label: "sell", useHook: useSellAsset, path: "sell", schema: SellAssetSchema },
  ])("books a $label against the asset", async ({ useHook, path, schema }) => {
    const trade = { quantity: 2, pricePerUnit: 100, date: "2026-03-15", description: "Rebalance" };

    await renderMutation(useHook).mutateAsync({ id: 9, ...trade });

    expect(requested()).toEqual({ url: `/api/assets/9/${path}`, method: "POST", body: trade });
    expect(schema.safeParse(requested().body).success).toBe(true);
  });

  it("records a price against the asset", async () => {
    const mark = { pricePerUnit: 360, recordedAt: "2026-03-14T00:00:00" };

    await renderMutation(useRecordAssetPrice).mutateAsync({ id: 9, ...mark });

    expect(requested()).toEqual({ url: "/api/assets/9/prices", method: "POST", body: mark });
    expect(RecordPriceSchema.safeParse(requested().body).success).toBe(true);
  });

  it("fails with the server's own message", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Insufficient holdings", code: "CONFLICT" }, { status: 409 })
    );

    await expect(
      renderMutation(useSellAsset).mutateAsync({
        id: 9,
        quantity: 50,
        pricePerUnit: 100,
        date: "2026-03-15",
      })
    ).rejects.toMatchObject({ message: "Insufficient holdings", status: 409 });
  });
});
