import { queryOptions, useMutation } from "@tanstack/react-query";
import type { z } from "zod";
import { apiGet, apiSend } from "@/lib/api-client";
import type {
  CreateRecurringSchema,
  RecurringResponse,
  UpdateRecurringSchema,
} from "@/lib/validators/recurring";

export const recurringKeys = {
  all: ["recurring"] as const,
  list: () => [...recurringKeys.all, "list"] as const,
  detail: (id: number) => [...recurringKeys.all, "detail", id] as const,
};

/** Every recurring template with its next occurrence — `GET /api/recurring`. */
export function recurringListQuery() {
  return queryOptions({
    queryKey: recurringKeys.list(),
    queryFn: ({ signal }) => apiGet<RecurringResponse[]>("/api/recurring", {}, { signal }),
  });
}

/** One recurring template — `GET /api/recurring/{id}`. */
export function recurringTemplateQuery(id: number) {
  return queryOptions({
    queryKey: recurringKeys.detail(id),
    queryFn: ({ signal }) => apiGet<RecurringResponse>(`/api/recurring/${id}`, {}, { signal }),
  });
}

export function useCreateRecurring() {
  return useMutation({
    mutationFn: (body: z.input<typeof CreateRecurringSchema>) =>
      apiSend<RecurringResponse>("POST", "/api/recurring", body),
  });
}

/** Edit a template; `isActive` alone pauses or resumes it. */
export function useUpdateRecurring() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & z.input<typeof UpdateRecurringSchema>) =>
      apiSend<RecurringResponse>("PATCH", `/api/recurring/${id}`, body),
  });
}

/** Delete a template. Transactions it already generated are kept. */
export function useDeleteRecurring() {
  return useMutation({
    mutationFn: (id: number) => apiSend<{ success: boolean }>("DELETE", `/api/recurring/${id}`),
  });
}
