"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { convertQuery } from "@/lib/queries/financial";

export interface FxPreview {
  /** `amount` converted into the target currency. */
  base: number;
  /** One unit of the source currency, in the target currency. */
  rate: number;
}

interface FxPreviewRequest {
  /** What to convert, or `null` when there is nothing to quote. */
  amount: number | null;
  from: string;
  to: string;
  /** The day whose rate applies (`YYYY-MM-DD`). */
  date: string;
}

/**
 * A read-only quote of `amount` in another currency, from
 * `/api/financial/convert` — the same FX provider chain the server applies when
 * it books a lot, so the preview matches the value that gets persisted.
 *
 * While a new quote loads, the previous one stays on screen and `fetching` is
 * set, so typing an amount doesn't make the preview flicker. A request that
 * can't be quoted (`amount: null`) clears it at once, and one the provider
 * chain can't answer shows no quote.
 */
export function useFxPreview({ amount, from, to, date }: FxPreviewRequest): {
  preview: FxPreview | null;
  fetching: boolean;
} {
  const quote = useQuery({
    ...convertQuery({ amount: amount ?? 0, from, to, date }),
    enabled: amount !== null,
    placeholderData: keepPreviousData,
  });

  if (amount === null) return { preview: null, fetching: false };
  return {
    preview: quote.data ? { base: quote.data.converted, rate: quote.data.rate } : null,
    fetching: quote.isFetching,
  };
}
