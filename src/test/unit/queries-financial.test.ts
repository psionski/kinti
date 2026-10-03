import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "@/lib/api-client";
import { makeQueryClient } from "@/lib/query-client";
import { searchParamsToObject, toSearchParams } from "@/lib/api/search-params";
import {
  convertQuery,
  priceQuery,
  symbolSearchQuery,
  type ConvertParams,
  type SymbolSearchParams,
} from "@/lib/queries/financial";
import {
  ConvertCurrencySchema,
  GetPriceSchema,
  SearchSymbolQuerySchema,
} from "@/lib/validators/financial";

/** What the API's GET handler validates after a client sends `params`. */
function throughTheWire(schema: z.ZodType, params: Parameters<typeof toSearchParams>[0]) {
  return schema.safeParse(searchParamsToObject(toSearchParams(params), schema));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The URL of the `n`th request sent, resolved against a dummy origin. */
function requested(n = 0): URL {
  return new URL(fetchMock.mock.calls[n]![0] as string, "http://localhost");
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A streamed response whose body the test writes chunk by chunk. */
function streamedResponse(): {
  response: Response;
  write: (text: string) => void;
  end: () => void;
} {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
  const encoder = new TextEncoder();
  return {
    response: new Response(body, { headers: { "Content-Type": "text/event-stream" } }),
    write: (text) => controller.enqueue(encoder.encode(text)),
    end: () => controller.close(),
  };
}

describe("convert params", () => {
  it.each([
    {
      label: "a dated quote",
      params: { amount: 15.99, from: "USD", to: "EUR", date: "2026-03-15" },
    },
    { label: "today's quote", params: { amount: 100, from: "GBP", to: "EUR" } },
  ] satisfies { label: string; params: ConvertParams }[])(
    "validates $label exactly as sending the params directly would",
    ({ params }) => {
      const wire = throughTheWire(ConvertCurrencySchema, params);

      expect(wire.success).toBe(true);
      expect(wire.data).toEqual(ConvertCurrencySchema.parse(params));
    }
  );

  it("asks the convert endpoint", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ converted: 92.5, rate: 0.925 }));

    await makeQueryClient().query(
      convertQuery({ amount: 100, from: "USD", to: "EUR", date: "2026-03-15" })
    );

    expect(requested().pathname).toBe("/api/financial/convert");
  });
});

describe("symbol search params", () => {
  it.each([
    { label: "a plain query", params: { query: "bitcoin" } },
    { label: "a query for one asset type", params: { query: "apple", assetType: "investment" } },
    { label: "a numeric-looking query", params: { query: "2024" } },
  ] satisfies { label: string; params: SymbolSearchParams }[])(
    "validates $label exactly as sending the params directly would",
    ({ params }) => {
      const wire = throughTheWire(SearchSymbolQuerySchema, params);

      expect(wire.success).toBe(true);
      expect(wire.data).toEqual(SearchSymbolQuerySchema.parse(params));
    }
  );
});

describe("priceQuery", () => {
  it("sends the symbol map as JSON the route's schema reads back", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ price: 345.63 }));
    const symbolMap = { coingecko: "bitcoin", "alpha-vantage": "BTC" };

    await makeQueryClient().query(priceQuery({ symbolMap, currency: "USD", date: "2026-03-15" }));

    const url = requested();
    expect(url.pathname).toBe("/api/financial/price");
    expect(GetPriceSchema.parse(searchParamsToObject(url.searchParams, GetPriceSchema))).toEqual({
      symbolMap,
      currency: "USD",
      date: "2026-03-15",
    });
  });

  it("keys a lookup by the map's contents, not its key order", () => {
    const date = "2026-03-15";
    const a = priceQuery({ symbolMap: { coingecko: "bitcoin", "alpha-vantage": "BTC" }, date });
    const b = priceQuery({ symbolMap: { "alpha-vantage": "BTC", coingecko: "bitcoin" }, date });
    const price = {
      symbol: "bitcoin",
      price: 1,
      currency: "EUR",
      date,
      provider: "coingecko",
      stale: false,
    } as const;
    const client = makeQueryClient();
    client.setQueryData(a.queryKey, price);

    expect(client.getQueryData(b.queryKey)).toEqual(price);
  });
});

describe("symbolSearchQuery", () => {
  it("asks the search endpoint with the query and asset type", async () => {
    const { response, end } = streamedResponse();
    fetchMock.mockResolvedValueOnce(response);
    end();

    await makeQueryClient().query(symbolSearchQuery({ query: "btc", assetType: "crypto" }));

    const url = requested();
    expect(url.pathname).toBe("/api/financial/search-symbol");
    expect(Object.fromEntries(url.searchParams)).toEqual({ query: "btc", assetType: "crypto" });
  });

  it("shows each provider's matches as they arrive", async () => {
    const { response, write, end } = streamedResponse();
    fetchMock.mockResolvedValueOnce(response);
    const client = makeQueryClient();
    const query = symbolSearchQuery({ query: "usd" });
    const bitcoin = { provider: "coingecko", symbol: "bitcoin", name: "Bitcoin", type: "crypto" };
    const dollar = { provider: "frankfurter", symbol: "USD", name: "US Dollar", type: "currency" };

    const done = client.query(query);
    write(sse("results", { provider: "coingecko", results: [bitcoin] }));

    await vi.waitFor(() => expect(client.getQueryData(query.queryKey)).toEqual([bitcoin]));
    expect(client.getQueryState(query.queryKey)?.fetchStatus).toBe("fetching");

    // An event split across chunks is read once it is whole.
    const second = sse("results", { provider: "frankfurter", results: [dollar] });
    write(second.slice(0, 20));
    write(second.slice(20) + sse("done", {}));
    end();

    await expect(done).resolves.toEqual([bitcoin, dollar]);
  });

  it("finds nothing when no provider has a match", async () => {
    const { response, write, end } = streamedResponse();
    fetchMock.mockResolvedValueOnce(response);
    write(sse("done", {}));
    end();

    await expect(makeQueryClient().query(symbolSearchQuery({ query: "zzz" }))).resolves.toEqual([]);
  });

  it("fails when the server reports the search failed", async () => {
    const { response, write, end } = streamedResponse();
    fetchMock.mockResolvedValueOnce(response);
    write(sse("error", {}));
    end();

    const error = await makeQueryClient()
      .query(symbolSearchQuery({ query: "btc" }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: "Symbol search failed." });
    // An answer from the API is final, so the search is not sent again.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("carries the API's error contract when the request is refused", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Validation failed", code: "VALIDATION_ERROR" }, { status: 400 })
    );

    const error = await makeQueryClient()
      .query(symbolSearchQuery({ query: "x" }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: "Validation failed",
      status: 400,
      code: "VALIDATION_ERROR",
    });
  });
});
