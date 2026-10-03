import { queryOptions, useMutation } from "@tanstack/react-query";
import type { z } from "zod";
import { apiGet, apiSend } from "@/lib/api-client";
import type {
  AssetLotResponse,
  AssetPriceResponse,
  AssetResponse,
  AssetWithMetrics,
  BuyAssetSchema,
  CreateAssetSchema,
  RecordPriceSchema,
  SellAssetSchema,
  UpdateAssetSchema,
} from "@/lib/validators/assets";
import type {
  AssetHistoryQuerySchema,
  AssetHistoryResult,
} from "@/lib/validators/portfolio-reports";
import type { TransactionResponse } from "@/lib/validators/transactions";

/** Query parameters of `GET /api/assets/{id}/history`, as a caller sends them. */
export type AssetHistoryParams = z.input<typeof AssetHistoryQuerySchema>;

/** What a buy or sell books: the lot, and the transfer that moved the cash. */
export interface LotTrade {
  lot: AssetLotResponse;
  transaction: TransactionResponse;
}

export const assetKeys = {
  all: ["assets"] as const,
  list: () => [...assetKeys.all, "list"] as const,
  detail: (id: number) => [...assetKeys.all, "detail", id] as const,
  lots: (id: number) => [...assetKeys.all, "lots", id] as const,
  history: (id: number, params: AssetHistoryParams) =>
    [...assetKeys.all, "history", id, params] as const,
};

/** Every asset with its holdings, value and P&L — `GET /api/assets`. */
export function assetListQuery() {
  return queryOptions({
    queryKey: assetKeys.list(),
    queryFn: ({ signal }) => apiGet<AssetWithMetrics[]>("/api/assets", {}, { signal }),
  });
}

/** One asset with its metrics — `GET /api/assets/{id}`. */
export function assetQuery(id: number) {
  return queryOptions({
    queryKey: assetKeys.detail(id),
    queryFn: ({ signal }) => apiGet<AssetWithMetrics>(`/api/assets/${id}`, {}, { signal }),
  });
}

/** An asset's lots, newest first — `GET /api/assets/{id}/lots`. */
export function assetLotsQuery(id: number) {
  return queryOptions({
    queryKey: assetKeys.lots(id),
    queryFn: ({ signal }) => apiGet<AssetLotResponse[]>(`/api/assets/${id}/lots`, {}, { signal }),
  });
}

/** An asset's price, rate and value timeline over a window. */
export function assetHistoryQuery(id: number, params: AssetHistoryParams) {
  return queryOptions({
    queryKey: assetKeys.history(id, params),
    queryFn: ({ signal }) =>
      apiGet<AssetHistoryResult>(`/api/assets/${id}/history`, params, { signal }),
  });
}

export function useCreateAsset() {
  return useMutation({
    mutationFn: (body: z.input<typeof CreateAssetSchema>) =>
      apiSend<AssetResponse>("POST", "/api/assets", body),
  });
}

export function useUpdateAsset() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & z.input<typeof UpdateAssetSchema>) =>
      apiSend<AssetResponse>("PATCH", `/api/assets/${id}`, body),
  });
}

export function useDeleteAsset() {
  return useMutation({
    mutationFn: (id: number) => apiSend<undefined>("DELETE", `/api/assets/${id}`),
  });
}

/** Buy units of an asset, or deposit into an account (a deposit's unit price is 1). */
export function useBuyAsset() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & z.input<typeof BuyAssetSchema>) =>
      apiSend<LotTrade>("POST", `/api/assets/${id}/buy`, body),
  });
}

/** Sell units of an asset, or withdraw from an account. */
export function useSellAsset() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & z.input<typeof SellAssetSchema>) =>
      apiSend<LotTrade>("POST", `/api/assets/${id}/sell`, body),
  });
}

/** Record a hand-entered price for an asset. */
export function useRecordAssetPrice() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & z.input<typeof RecordPriceSchema>) =>
      apiSend<AssetPriceResponse>("POST", `/api/assets/${id}/prices`, body),
  });
}
