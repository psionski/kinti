import { queryOptions, useMutation } from "@tanstack/react-query";
import type { z } from "zod";
import { apiGet, apiSend } from "@/lib/api-client";
import type {
  CreateTransactionSchema,
  DeleteTransactionsBatchSchema,
  ListTransactionsSchema,
  PaginatedTransactionsResponse,
  SuggestSchema,
  TransactionResponse,
  UpdateTransactionSchema,
  UpdateTransactionsBatchSchema,
} from "@/lib/validators/transactions";

/** Query parameters of `GET /api/transactions`, as a caller sends them. */
export type TransactionListParams = z.input<typeof ListTransactionsSchema>;
export type SuggestField = z.input<typeof SuggestSchema>["field"];

export const transactionKeys = {
  all: ["transactions"] as const,
  list: (params: TransactionListParams) => [...transactionKeys.all, "list", params] as const,
  tags: () => [...transactionKeys.all, "tags"] as const,
  suggestions: (field: SuggestField, q: string) =>
    [...transactionKeys.all, "suggestions", field, q] as const,
};

export function transactionListQuery(params: TransactionListParams) {
  return queryOptions({
    queryKey: transactionKeys.list(params),
    queryFn: ({ signal }) =>
      apiGet<PaginatedTransactionsResponse>("/api/transactions", params, { signal }),
  });
}

/** Every tag in use, for autocomplete. */
export function transactionTagsQuery() {
  return queryOptions({
    queryKey: transactionKeys.tags(),
    queryFn: ({ signal }) => apiGet<string[]>("/api/transactions/tags", {}, { signal }),
  });
}

/** Previously-used values of a free-text field; an empty `q` gives the most used. */
export function transactionSuggestionsQuery(field: SuggestField, q: string) {
  const trimmed = q.trim();
  return queryOptions({
    queryKey: transactionKeys.suggestions(field, trimmed),
    queryFn: ({ signal }) =>
      apiGet<string[]>("/api/transactions/suggest", { field, q: trimmed || undefined }, { signal }),
  });
}

export function useCreateTransaction() {
  return useMutation({
    mutationFn: (body: z.input<typeof CreateTransactionSchema>) =>
      apiSend<TransactionResponse>("POST", "/api/transactions", body),
  });
}

export function useUpdateTransaction() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & z.input<typeof UpdateTransactionSchema>) =>
      apiSend<TransactionResponse>("PATCH", `/api/transactions/${id}`, body),
  });
}

export function useUpdateTransactions() {
  return useMutation({
    mutationFn: (body: z.input<typeof UpdateTransactionsBatchSchema>) =>
      apiSend<TransactionResponse[]>("PATCH", "/api/transactions", body),
  });
}

export function useDeleteTransactions() {
  return useMutation({
    mutationFn: (body: z.input<typeof DeleteTransactionsBatchSchema>) =>
      apiSend<{ deleted: number }>("DELETE", "/api/transactions", body),
  });
}
