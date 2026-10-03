// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query-client";
import { useFxPreview } from "@/hooks/use-fx-preview";

interface PendingRequest {
  url: URL;
  respond: (body: { converted: number; rate: number } | null) => void;
}

/** Requests the hook has sent, answered by the test in whatever order it likes. */
let requests: PendingRequest[];

beforeEach(() => {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (input: string, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
          requests.push({
            url: new URL(input, "http://localhost"),
            respond: (body) =>
              resolve(
                body === null
                  ? new Response(null, { status: 502 })
                  : new Response(JSON.stringify(body), { status: 200 })
              ),
          });
        })
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type Request = Parameters<typeof useFxPreview>[0];

const DEFAULTS: Request = { amount: 100, from: "USD", to: "EUR", date: "2026-03-15" };

function renderPreview(initial: Request) {
  const client = makeQueryClient();
  return renderHook((request: Request) => useFxPreview(request), {
    initialProps: initial,
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("useFxPreview", () => {
  it("sends nothing and shows nothing when there is nothing to quote", () => {
    const { result } = renderPreview({ ...DEFAULTS, amount: null });

    expect(result.current).toEqual({ preview: null, fetching: false });
    expect(requests).toHaveLength(0);
  });

  it("quotes the amount through the convert endpoint", async () => {
    const { result } = renderPreview(DEFAULTS);

    expect(result.current).toEqual({ preview: null, fetching: true });
    await waitFor(() => expect(requests).toHaveLength(1));
    const { url } = requests[0]!;
    expect(url.pathname).toBe("/api/financial/convert");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      amount: "100",
      from: "USD",
      to: "EUR",
      date: "2026-03-15",
    });

    act(() => requests[0]!.respond({ converted: 92.5, rate: 0.925 }));

    await waitFor(() => {
      expect(result.current).toEqual({ preview: { base: 92.5, rate: 0.925 }, fetching: false });
    });
  });

  it("keeps the previous quote on screen while a new one loads", async () => {
    const { result, rerender } = renderPreview(DEFAULTS);
    await waitFor(() => expect(requests).toHaveLength(1));
    act(() => requests[0]!.respond({ converted: 92.5, rate: 0.925 }));
    await waitFor(() => expect(result.current.fetching).toBe(false));

    rerender({ ...DEFAULTS, amount: 200 });

    expect(result.current).toEqual({ preview: { base: 92.5, rate: 0.925 }, fetching: true });

    await waitFor(() => expect(requests).toHaveLength(2));
    act(() => requests[1]!.respond({ converted: 185, rate: 0.925 }));
    await waitFor(() => {
      expect(result.current).toEqual({ preview: { base: 185, rate: 0.925 }, fetching: false });
    });
  });

  it("clears the quote in the same render the request stops being quotable", async () => {
    const { result, rerender } = renderPreview(DEFAULTS);
    await waitFor(() => expect(requests).toHaveLength(1));
    act(() => requests[0]!.respond({ converted: 92.5, rate: 0.925 }));
    await waitFor(() => expect(result.current.preview).not.toBeNull());

    rerender({ ...DEFAULTS, amount: null });

    expect(result.current).toEqual({ preview: null, fetching: false });
    expect(requests).toHaveLength(1);
  });

  it("ignores the answer to a request that was superseded", async () => {
    const { result, rerender } = renderPreview(DEFAULTS);
    await waitFor(() => expect(requests).toHaveLength(1));
    rerender({ ...DEFAULTS, date: "2026-03-16" });
    await waitFor(() => expect(requests).toHaveLength(2));

    act(() => requests[1]!.respond({ converted: 93, rate: 0.93 }));
    // A late answer to the first request must not replace the quote for the
    // date now on screen.
    act(() => requests[0]!.respond({ converted: 92.5, rate: 0.925 }));

    await waitFor(() => {
      expect(result.current).toEqual({ preview: { base: 93, rate: 0.93 }, fetching: false });
    });
  });

  it("shows no quote when the provider chain can't produce one", async () => {
    const { result } = renderPreview(DEFAULTS);
    await waitFor(() => expect(requests).toHaveLength(1));

    act(() => requests[0]!.respond(null));

    await waitFor(() => {
      expect(result.current).toEqual({ preview: null, fetching: false });
    });
  });
});
