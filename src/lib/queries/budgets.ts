import { queryOptions, useMutation } from "@tanstack/react-query";
import type { z } from "zod";
import { apiGet, apiSend } from "@/lib/api-client";
import { toSearchParams } from "@/lib/api/search-params";
import type {
  BudgetResponse,
  BudgetStatusResponse,
  DeleteBudgetSchema,
  GetBudgetStatusSchema,
  ResetBudgetsSchema,
  SetBudgetSchema,
} from "@/lib/validators/budgets";
import type { BudgetStatsResult, BudgetStatsSchema } from "@/lib/validators/reports";

/** Query parameters of `GET /api/budgets`, as a caller sends them. */
export type BudgetStatusParams = z.input<typeof GetBudgetStatusSchema>;
/** Query parameters of `GET /api/reports/budget-stats`, as a caller sends them. */
export type BudgetStatsParams = z.input<typeof BudgetStatsSchema>;

export const budgetKeys = {
  all: ["budgets"] as const,
  status: (params: BudgetStatusParams) => [...budgetKeys.all, "status", params] as const,
  stats: (params: BudgetStatsParams) => [...budgetKeys.all, "stats", params] as const,
};

/** A month's budgets with what has been spent against them. */
export function budgetStatusQuery(params: BudgetStatusParams) {
  return queryOptions({
    queryKey: budgetKeys.status(params),
    queryFn: ({ signal }) => apiGet<BudgetStatusResponse>("/api/budgets", params, { signal }),
  });
}

/** Every category's spending in a month, with its budget where it has one. */
export function budgetStatsQuery(params: BudgetStatsParams) {
  return queryOptions({
    queryKey: budgetKeys.stats(params),
    queryFn: ({ signal }) =>
      apiGet<BudgetStatsResult>("/api/reports/budget-stats", params, { signal }),
  });
}

/** Create or replace a category's budget for a month. */
export function useSetBudget() {
  return useMutation({
    mutationFn: (body: z.input<typeof SetBudgetSchema>) =>
      apiSend<BudgetResponse>("POST", "/api/budgets", body),
  });
}

export function useDeleteBudget() {
  return useMutation({
    // The route reads which budget to delete from the query string, not a body.
    mutationFn: (params: z.input<typeof DeleteBudgetSchema>) =>
      apiSend<{ success: boolean }>("DELETE", `/api/budgets?${toSearchParams(params).toString()}`),
  });
}

/** Drop a month's own budgets so it inherits from the latest earlier month again. */
export function useResetBudgets() {
  return useMutation({
    mutationFn: (body: z.input<typeof ResetBudgetsSchema>) =>
      apiSend<{ success: boolean }>("POST", "/api/budgets/reset", body),
  });
}
