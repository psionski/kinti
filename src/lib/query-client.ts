import { MutationCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: {
      /**
       * Leave the query out of the refetch every mutation triggers. For reads
       * that cost more than a local database query (a network health check,
       * a rate-limited provider); the mutations that change them invalidate
       * them explicitly.
       */
      skipGlobalInvalidation?: boolean;
    };
  }
}

/**
 * How long fetched data counts as fresh. Pages hydrate from data the server
 * rendered moments earlier, so a fresh window stops every mount from fetching
 * it again; past it, returning to the tab refetches, which is how changes made
 * through the MCP server reach an open page.
 */
const STALE_TIME_MS = 30_000;

/**
 * The browser's query client. Every successful mutation invalidates every
 * query: a transaction moves budgets, reports, the cash balance and net worth
 * at once, and the API is local, so refetching what is on screen costs little
 * while a hand-kept dependency map would drift. The mutation stays pending
 * until the refetch lands, so a dialog closes onto current data. Queries whose
 * fetch is not cheap opt out with `meta.skipGlobalInvalidation`.
 */
export function makeQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        // An answer from the API is final; only retry when it never answered.
        retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 1,
      },
    },
    mutationCache: new MutationCache({
      onSuccess: () =>
        client.invalidateQueries({
          predicate: (query) => query.meta?.skipGlobalInvalidation !== true,
        }),
    }),
  });
  return client;
}
