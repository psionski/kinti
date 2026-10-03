import { experimental_streamedQuery as streamedQuery, queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import { ApiError, apiGet } from "@/lib/api-client";
import { toSearchParams } from "@/lib/api/search-params";
import { ErrorResponseSchema } from "@/lib/validators/common";
import type { SymbolMap } from "@/lib/validators/assets";
import type {
  ConvertCurrencySchema,
  ConvertResultResponse,
  GetPriceSchema,
  PriceResultResponse,
  SearchSymbolQuerySchema,
} from "@/lib/validators/financial";
import type { ProviderName, SymbolSearchResult } from "@/lib/providers/types";

/**
 * Query parameters of `GET /api/financial/price`. The symbol map travels as
 * JSON text, which the route's schema parses; callers pass the map itself.
 */
export type PriceParams = Omit<z.input<typeof GetPriceSchema>, "symbolMap"> & {
  symbolMap: SymbolMap;
};
/** Query parameters of `GET /api/financial/convert`. */
export type ConvertParams = z.input<typeof ConvertCurrencySchema>;
/** Query parameters of `GET /api/financial/search-symbol`. */
export type SymbolSearchParams = z.input<typeof SearchSymbolQuerySchema>;

/**
 * These lookups go to external providers, and nothing the app writes changes
 * their answers, so a mutation elsewhere doesn't refetch them — that would
 * spend provider quota on results that can't have moved.
 */
const PROVIDER_LOOKUP = { meta: { skipGlobalInvalidation: true } } as const;

export const financialKeys = {
  all: ["financial"] as const,
  price: (params: PriceParams) => [...financialKeys.all, "price", params] as const,
  convert: (params: ConvertParams) => [...financialKeys.all, "convert", params] as const,
  symbolSearch: (params: SymbolSearchParams) =>
    [...financialKeys.all, "symbol-search", params] as const,
};

/** The price of one unit of a tracked instrument on a day, from the provider chain. */
export function priceQuery(params: PriceParams) {
  return queryOptions({
    ...PROVIDER_LOOKUP,
    queryKey: financialKeys.price(params),
    queryFn: ({ signal }) =>
      apiGet<PriceResultResponse>(
        "/api/financial/price",
        { ...params, symbolMap: JSON.stringify(params.symbolMap) },
        { signal }
      ),
  });
}

/** `amount` in another currency at a day's rate — the chain the server books lots with. */
export function convertQuery(params: ConvertParams) {
  return queryOptions({
    ...PROVIDER_LOOKUP,
    queryKey: financialKeys.convert(params),
    queryFn: ({ signal }) =>
      apiGet<ConvertResultResponse>("/api/financial/convert", params, { signal }),
  });
}

/** One provider's matches, as the search endpoint streams them. */
interface SymbolSearchBatch {
  provider: ProviderName;
  results: SymbolSearchResult[];
}

/**
 * Symbols matching a query across every provider that serves the asset type.
 * The endpoint streams each provider's matches as they arrive, and the query's
 * data grows with them: it holds the first provider's results while the rest
 * are still `isFetching`.
 */
export function symbolSearchQuery(params: SymbolSearchParams) {
  return queryOptions({
    ...PROVIDER_LOOKUP,
    queryKey: financialKeys.symbolSearch(params),
    queryFn: streamedQuery({
      streamFn: ({ signal }) => streamSymbolSearch(params, signal),
      reducer: (found: SymbolSearchResult[], batch: SymbolSearchBatch) => [
        ...found,
        ...batch.results,
      ],
      initialValue: [],
    }),
    // Results live only while a search shows them: a stream cut off by a new
    // query keeps the batches it already received, which would otherwise be
    // cached as the whole answer. While shown they are never refetched, since
    // every search spends provider quota (Alpha Vantage allows 25 a day).
    staleTime: Infinity,
    gcTime: 0,
  });
}

/**
 * The search endpoint's server-sent events, decoded into provider batches.
 * `apiGet` reads a single JSON body, so this reads the stream itself.
 */
async function* streamSymbolSearch(
  params: SymbolSearchParams,
  signal: AbortSignal
): AsyncGenerator<SymbolSearchBatch> {
  const res = await fetch(`/api/financial/search-symbol?${toSearchParams(params)}`, { signal });
  if (!res.ok || !res.body) throw await streamError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    // Events end with a blank line; the tail is kept until the rest arrives.
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const raw of events) {
      const event = parseEvent(raw);
      if (event?.type === "done") return;
      if (event?.type === "error") {
        throw new ApiError("Symbol search failed.", res.status, "INTERNAL_ERROR");
      }
      if (event?.type === "results") yield JSON.parse(event.data) as SymbolSearchBatch;
    }
  }
}

function parseEvent(raw: string): { type: string; data: string } | null {
  const lines = raw.split("\n");
  const type = lines.find((line) => line.startsWith("event: "))?.slice(7);
  const data = lines.find((line) => line.startsWith("data: "))?.slice(6);
  return type === undefined || data === undefined ? null : { type, data };
}

/** The error contract of a refused search, read the way `apiGet` reads one. */
async function streamError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  const parsed = ErrorResponseSchema.safeParse(body);
  if (parsed.success) {
    return new ApiError(parsed.data.error, res.status, parsed.data.code, parsed.data.details);
  }
  return new ApiError(`Request failed (${res.status})`, res.status);
}
