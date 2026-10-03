import { queryOptions, useMutation } from "@tanstack/react-query";
import type { z } from "zod";
import { apiGet, apiSend } from "@/lib/api-client";
import type { MergeResult } from "@/lib/services/categories";
import type {
  CategoryResponse,
  CategoryWithCountResponse,
  CreateCategorySchema,
  MergeCategoriesSchema,
  UpdateCategorySchema,
} from "@/lib/validators/categories";

export const categoryKeys = {
  all: ["categories"] as const,
  list: () => [...categoryKeys.all, "list"] as const,
};

/** Every category with its transaction count — `GET /api/categories`. */
export function categoryListQuery() {
  return queryOptions({
    queryKey: categoryKeys.list(),
    queryFn: ({ signal }) => apiGet<CategoryWithCountResponse[]>("/api/categories", {}, { signal }),
  });
}

export function useCreateCategory() {
  return useMutation({
    mutationFn: (body: z.input<typeof CreateCategorySchema>) =>
      apiSend<CategoryResponse>("POST", "/api/categories", body),
  });
}

export function useUpdateCategory() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & z.input<typeof UpdateCategorySchema>) =>
      apiSend<CategoryResponse>("PATCH", `/api/categories/${id}`, body),
  });
}

/** Move every transaction of the source category to the target, then delete the source. */
export function useMergeCategories() {
  return useMutation({
    mutationFn: (body: z.input<typeof MergeCategoriesSchema>) =>
      apiSend<MergeResult>("POST", "/api/categories/merge", body),
  });
}

export function useDeleteCategory() {
  return useMutation({
    mutationFn: (id: number) => apiSend<{ success: boolean }>("DELETE", `/api/categories/${id}`),
  });
}
