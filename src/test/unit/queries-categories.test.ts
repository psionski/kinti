// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  categoryKeys,
  categoryListQuery,
  useCreateCategory,
  useDeleteCategory,
  useMergeCategories,
  useUpdateCategory,
} from "@/lib/queries/categories";
import { UpdateCategorySchema } from "@/lib/validators/categories";

interface SentRequest {
  url: string;
  init: RequestInit | undefined;
  respond: (body: unknown, status?: number) => void;
}

/** Requests sent so far, answered by the test. */
let requests: SentRequest[];

beforeEach(() => {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
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

/** The JSON body a request carried. */
function sentBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") throw new Error("The request carried no JSON body");
  return JSON.parse(init.body);
}

/** Run a mutation hook once, answering its request with `response`. */
async function send<V>(
  useMutationHook: () => { mutateAsync: (variables: V) => Promise<unknown> },
  variables: V,
  response: unknown = { success: true }
): Promise<{ url: string; init: RequestInit | undefined }> {
  const { result } = renderHook(useMutationHook, { wrapper });
  const done = act(() => result.current.mutateAsync(variables));
  await waitFor(() => expect(requests).toHaveLength(1));
  requests[0]!.respond(response);
  await done;
  return requests[0]!;
}

describe("categoryListQuery", () => {
  it("lives under the categories key", () => {
    expect(categoryListQuery().queryKey).toEqual([...categoryKeys.all, "list"]);
  });

  it("asks for every category with no query parameters, as the route takes none", async () => {
    renderHook(() => useQuery(categoryListQuery()), { wrapper });

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.url).toBe("/api/categories");
  });
});

describe("category mutations", () => {
  it("creates a category from a JSON body", async () => {
    const { url, init } = await send(useCreateCategory, { name: "Transport", color: "#3B82F6" });

    expect(url).toBe("/api/categories");
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ name: "Transport", color: "#3B82F6" }),
    });
  });

  it("patches the category in the path with the rest of the fields as the body", async () => {
    const { url, init } = await send(useUpdateCategory, {
      id: 7,
      name: "Public Transit",
      parentId: null,
      icon: null,
      color: null,
    });

    expect(url).toBe("/api/categories/7");
    expect(init?.method).toBe("PATCH");
    const body = sentBody(init);
    expect(body).toEqual({ name: "Public Transit", parentId: null, icon: null, color: null });
    expect(UpdateCategorySchema.safeParse(body).success).toBe(true);
  });

  it("merges a source category into a target", async () => {
    const { url, init } = await send(
      useMergeCategories,
      { sourceCategoryId: 3, targetCategoryId: 5 },
      {
        merged: true,
        sourceCategoryName: "Supermarket",
        targetCategoryName: "Food",
        transactionsMoved: 2,
        budgetsTransferred: 0,
      }
    );

    expect(url).toBe("/api/categories/merge");
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ sourceCategoryId: 3, targetCategoryId: 5 }),
    });
  });

  it("deletes the category in the path without a body", async () => {
    const { url, init } = await send(useDeleteCategory, 7);

    expect(url).toBe("/api/categories/7");
    expect(init).toMatchObject({ method: "DELETE", body: undefined });
  });

  it("fails with the server's own message", async () => {
    const { result } = renderHook(useCreateCategory, { wrapper });

    act(() => result.current.mutate({ name: "Food" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    requests[0]!.respond({ error: "Category name already exists", code: "CONFLICT" }, 409);

    await waitFor(() => expect(result.current.error?.message).toBe("Category name already exists"));
  });
});
