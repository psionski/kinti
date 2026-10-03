"use client";

import { QueryClientProvider, environmentManager, type QueryClient } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query-client";

let browserQueryClient: QueryClient | undefined;

/**
 * One client per server render (so requests never share a cache), one for the
 * life of the browser tab. Not `useState`: a render that suspends before
 * committing would throw the client away and start over with an empty cache.
 */
function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
