import { queryOptions, useMutation } from "@tanstack/react-query";
import { apiGet, apiSend, apiUpload } from "@/lib/api-client";
import type { ReceiptResponse } from "@/lib/validators/receipts";

export const receiptKeys = {
  all: ["receipts"] as const,
  detail: (id: number) => [...receiptKeys.all, "detail", id] as const,
};

/** One receipt — `GET /api/receipts/{id}`. */
export function receiptQuery(id: number) {
  return queryOptions({
    queryKey: receiptKeys.detail(id),
    queryFn: ({ signal }) => apiGet<ReceiptResponse>(`/api/receipts/${id}`, {}, { signal }),
  });
}

export function useDeleteReceipt() {
  return useMutation({
    mutationFn: (id: number) => apiSend<{ success: boolean }>("DELETE", `/api/receipts/${id}`),
  });
}

/** Upload a receipt image with optional `merchant`/`date`/`total` fields. */
export function useUploadReceipt() {
  return useMutation({
    mutationFn: (form: FormData) => apiUpload<{ receipt_id: number }>("/api/receipts/upload", form),
  });
}
