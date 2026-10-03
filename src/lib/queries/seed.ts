import { QueryClient, dehydrate, type DehydratedState } from "@tanstack/react-query";

/**
 * Cache entries a server page hands to the client queries under it, through
 * `<HydrationBoundary state={...}>`. Each seed must store, under a query's
 * key, exactly what that query's fetch would return: call the service with the
 * endpoint's own schema applied to the key's params (`Schema.parse(params)`),
 * as the route does.
 *
 * Hydration replaces cached data that is older, so returning to a page shows
 * what the server just read rather than what the tab cached earlier.
 */
export function seedQueries(seed: (client: QueryClient) => void): DehydratedState {
  const client = new QueryClient();
  seed(client);
  return dehydrate(client);
}
