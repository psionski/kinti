import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { apiGet, apiSend } from "@/lib/api-client";
import type {
  ProviderParamSchema,
  ProviderStatusResponse,
  SetApiKeyBodySchema,
} from "@/lib/validators/financial";
import type { ProviderName } from "@/lib/providers/types";

/**
 * Every fetch of the provider list health-checks each provider over the
 * network, and a keyed provider's check spends its daily quota (Alpha Vantage
 * allows 25 requests a day). So the list stays fresh far longer than the
 * client's default, isn't refetched when the tab regains focus or when an
 * unrelated mutation succeeds, and refreshes when a key is saved.
 */
const PROVIDER_LIST_STALE_TIME_MS = 5 * 60_000;

export const providerKeys = {
  all: ["providers"] as const,
  list: () => [...providerKeys.all, "list"] as const,
};

/** Every market data provider with its key and health status — `GET /api/financial/providers`. */
export function providerListQuery() {
  return queryOptions({
    queryKey: providerKeys.list(),
    queryFn: ({ signal }) =>
      apiGet<ProviderStatusResponse[]>("/api/financial/providers", {}, { signal }),
    staleTime: PROVIDER_LIST_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    meta: { skipGlobalInvalidation: true },
  });
}

export function useSetProviderKey() {
  const queryClient = useQueryClient();
  return useMutation({
    onSuccess: () => queryClient.invalidateQueries({ queryKey: providerKeys.all }),
    mutationFn: ({
      provider,
      ...body
    }: z.input<typeof ProviderParamSchema> & z.input<typeof SetApiKeyBodySchema>) =>
      apiSend<{ success: boolean; provider: ProviderName }>(
        "POST",
        `/api/financial/providers/${provider}/key`,
        body
      ),
  });
}
