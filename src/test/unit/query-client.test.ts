import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import { makeQueryClient } from "@/lib/query-client";

describe("makeQueryClient", () => {
  it("invalidates every query once a mutation succeeds", async () => {
    const client = makeQueryClient();
    client.setQueryData(["transactions", "list", {}], { data: [] });
    client.setQueryData(["budgets", "2026-03"], []);

    await client
      .getMutationCache()
      .build(client, { mutationFn: async () => "done" })
      .execute(undefined);

    expect(client.getQueryState(["transactions", "list", {}])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["budgets", "2026-03"])?.isInvalidated).toBe(true);
  });

  it("spares queries that opt out of the refetch every mutation triggers", async () => {
    const client = makeQueryClient();
    client.setQueryData(["budgets", "2026-03"], []);
    client
      .getQueryCache()
      .build(client, { queryKey: ["providers"], meta: { skipGlobalInvalidation: true } })
      .setData([]);

    await client
      .getMutationCache()
      .build(client, { mutationFn: async () => "done" })
      .execute(undefined);

    expect(client.getQueryState(["providers"])?.isInvalidated).toBe(false);
    expect(client.getQueryState(["budgets", "2026-03"])?.isInvalidated).toBe(true);
  });

  it("leaves the cache alone when a mutation fails", async () => {
    const client = makeQueryClient();
    client.setQueryData(["budgets", "2026-03"], []);
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(new Error("nope")),
    });

    await expect(mutation.execute(undefined)).rejects.toThrow("nope");

    expect(client.getQueryState(["budgets", "2026-03"])?.isInvalidated).toBe(false);
  });

  it("does not retry a request the API answered", async () => {
    const client = makeQueryClient();
    const queryFn = vi.fn(() => Promise.reject(new ApiError("Not found", 404, "NOT_FOUND")));

    await expect(client.query({ queryKey: ["x"], queryFn })).rejects.toThrow("Not found");

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("retries once when the API never answered", async () => {
    const client = makeQueryClient();
    const queryFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce("ok");

    await expect(client.query({ queryKey: ["y"], queryFn, retryDelay: 0 })).resolves.toBe("ok");

    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});
