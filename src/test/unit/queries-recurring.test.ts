// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  recurringKeys,
  recurringListQuery,
  recurringTemplateQuery,
  useCreateRecurring,
  useDeleteRecurring,
  useUpdateRecurring,
} from "@/lib/queries/recurring";
import { CreateRecurringSchema, UpdateRecurringSchema } from "@/lib/validators/recurring";
import type { RecurringFormData } from "@/components/recurring/recurring-form-dialog";
import {
  toCreateRecurringBody,
  toUpdateRecurringBody,
} from "@/components/recurring/recurring-request";

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

/** A monthly template as the form submits it, optional fields left blank. */
const FORM: RecurringFormData = {
  type: "expense",
  description: "Netflix Subscription",
  amount: 15.99,
  currency: "EUR",
  frequency: "monthly",
  startDate: "2026-01-01",
  merchant: "",
  categoryId: null,
  endDate: "",
  notes: "",
  dayOfMonth: null,
  dayOfWeek: null,
};

describe("recurring queries", () => {
  it("keys the list apart from any one template", () => {
    const list = recurringListQuery().queryKey;

    expect(list.slice(0, 1)).toEqual(recurringKeys.all);
    expect(list).not.toEqual(recurringTemplateQuery(1).queryKey);
  });

  it("asks for every template with no query parameters, as the route takes none", async () => {
    renderHook(() => useQuery(recurringListQuery()), { wrapper });

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.url).toBe("/api/recurring");
  });
});

describe("recurring mutations", () => {
  it("creates a template from the form, leaving out its empty fields", async () => {
    const { url, init } = await send(useCreateRecurring, toCreateRecurringBody(FORM));

    expect(url).toBe("/api/recurring");
    expect(init?.method).toBe("POST");
    const body = sentBody(init);
    expect(body).toEqual({
      type: "expense",
      description: "Netflix Subscription",
      amount: 15.99,
      currency: "EUR",
      frequency: "monthly",
      startDate: "2026-01-01",
    });
    expect(CreateRecurringSchema.safeParse(body).success).toBe(true);
  });

  it("patches the template in the path with an edited form the route accepts", async () => {
    const { url, init } = await send(useUpdateRecurring, {
      id: 3,
      ...toUpdateRecurringBody({ ...FORM, amount: 17.99 }),
    });

    expect(url).toBe("/api/recurring/3");
    expect(init?.method).toBe("PATCH");
    const body = sentBody(init);
    expect(body).not.toHaveProperty("id");
    expect(UpdateRecurringSchema.safeParse(body).success).toBe(true);
  });

  it("pauses a template with isActive alone", async () => {
    const { url, init } = await send(useUpdateRecurring, { id: 3, isActive: false });

    expect(url).toBe("/api/recurring/3");
    expect(init).toMatchObject({ method: "PATCH", body: JSON.stringify({ isActive: false }) });
  });

  it("deletes the template in the path without a body", async () => {
    const { url, init } = await send(useDeleteRecurring, 3);

    expect(url).toBe("/api/recurring/3");
    expect(init).toMatchObject({ method: "DELETE", body: undefined });
  });
});
