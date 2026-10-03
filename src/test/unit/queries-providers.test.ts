// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { makeQueryClient } from "@/lib/query-client";
import { providerListQuery, useSetProviderKey } from "@/lib/queries/providers";
import { SetApiKeyBodySchema } from "@/lib/validators/financial";

let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;

function respond(status: number, body: unknown): void {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  client = makeQueryClient();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("providerListQuery", () => {
  it("reads the provider statuses", async () => {
    const statuses = [
      {
        name: "alpha-vantage",
        assetTypes: ["investment"],
        apiKeyRequired: "required",
        apiKeySet: false,
        healthy: false,
      },
    ];
    respond(200, statuses);

    await expect(client.query(providerListQuery())).resolves.toEqual(statuses);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/financial/providers");
  });
});

describe("useSetProviderKey", () => {
  it("posts the key to the provider's route, in a body the route accepts", async () => {
    respond(200, { success: true, provider: "alpha-vantage" });
    const { result } = renderHook(useSetProviderKey, {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    await result.current.mutateAsync({ provider: "alpha-vantage", key: "secret" });

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/financial/providers/alpha-vantage/key");
    expect(init.method).toBe("POST");
    const body: unknown = JSON.parse(init.body as string);
    expect(body).toEqual({ key: "secret" });
    expect(SetApiKeyBodySchema.safeParse(body).success).toBe(true);
  });

  it("refreshes the provider list, which other mutations leave alone", async () => {
    client.setQueryData(providerListQuery().queryKey, []);
    respond(200, { success: true, provider: "alpha-vantage" });
    const { result } = renderHook(useSetProviderKey, {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    await result.current.mutateAsync({ provider: "alpha-vantage", key: "secret" });

    expect(client.getQueryState(providerListQuery().queryKey)?.isInvalidated).toBe(true);
  });
});

describe("the provider list under other mutations", () => {
  it("isn't invalidated, so its health checks don't spend provider quota", async () => {
    const { queryKey, meta } = providerListQuery();
    client.getQueryCache().build(client, { queryKey, meta }).setData([]);

    await client
      .getMutationCache()
      .build(client, { mutationFn: async () => "saved" })
      .execute(undefined);

    expect(client.getQueryState(providerListQuery().queryKey)?.isInvalidated).toBe(false);
  });
});
