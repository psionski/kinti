import type { TransactionListParams } from "@/lib/queries/transactions";

// Shared by the transactions page's server component (which seeds the first
// page) and its client component (which fetches the rest), so both derive the
// same query — and so the same cache key — from the same URL.

export interface TransactionFilters {
  search: string;
  dateFrom: string;
  dateTo: string;
  categoryId: string; // "" = all, "uncategorized" = null, number string = specific
  type: string; // "" = all, "income", "expense" (refunds included), "refund"
  amountMin: string;
  amountMax: string;
  recurringId: string; // "" = all, number string = specific
}

export const EMPTY_FILTERS: TransactionFilters = {
  search: "",
  dateFrom: "",
  dateTo: "",
  categoryId: "",
  type: "",
  amountMin: "",
  amountMax: "",
  recurringId: "",
};

export type SortField = "date" | "amount" | "merchant" | "createdAt";
export type SortOrder = "asc" | "desc";

/** Everything that decides which transactions the page shows. */
export interface TransactionPageQuery {
  filters: TransactionFilters;
  sortBy: SortField;
  sortOrder: SortOrder;
  limit: number;
  offset: number;
}

/** The filters a link into the page can preset: `?categoryId=…&recurringId=…&dateFrom=…&dateTo=…`. */
const LINKABLE_FILTERS = ["categoryId", "recurringId", "dateFrom", "dateTo"] as const;

/** The page a visit starts on, given its URL's search params. */
export function initialPageQuery(get: (key: string) => string | null): TransactionPageQuery {
  const filters = { ...EMPTY_FILTERS };
  for (const key of LINKABLE_FILTERS) {
    const value = get(key);
    if (value) filters[key] = value;
  }
  return { filters, sortBy: "date", sortOrder: "desc", limit: 50, offset: 0 };
}

/** A typed amount, or nothing when the field is empty or not a number. */
function amount(value: string): number | undefined {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : undefined;
}

/** The `GET /api/transactions` parameters for a page of the table. */
export function toListParams(q: TransactionPageQuery): TransactionListParams {
  const { filters } = q;
  return {
    sortBy: q.sortBy,
    sortOrder: q.sortOrder,
    limit: q.limit,
    offset: q.offset,
    search: filters.search || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    type: (filters.type || undefined) as TransactionListParams["type"],
    categoryId:
      filters.categoryId === "uncategorized"
        ? null
        : filters.categoryId
          ? Number(filters.categoryId)
          : undefined,
    amountMin: amount(filters.amountMin),
    amountMax: amount(filters.amountMax),
    recurringId: filters.recurringId ? Number(filters.recurringId) : undefined,
  };
}
