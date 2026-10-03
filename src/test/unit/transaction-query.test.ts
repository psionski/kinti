import { describe, it, expect } from "vitest";
import {
  EMPTY_FILTERS,
  initialPageQuery,
  toListParams,
  type TransactionPageQuery,
} from "@/components/transactions/transaction-query";
import { ListTransactionsSchema } from "@/lib/validators/transactions";

function fromUrl(query: string) {
  const search = new URLSearchParams(query);
  return initialPageQuery((key) => search.get(key));
}

const FIRST_PAGE: TransactionPageQuery = {
  filters: EMPTY_FILTERS,
  sortBy: "date",
  sortOrder: "desc",
  limit: 50,
  offset: 0,
};

describe("initialPageQuery", () => {
  it("starts on the newest first page when the URL presets nothing", () => {
    expect(fromUrl("")).toEqual(FIRST_PAGE);
  });

  it("takes the filters a link can preset", () => {
    const q = fromUrl("categoryId=4&recurringId=9&dateFrom=2026-01-01&dateTo=2026-01-31");

    expect(q.filters).toEqual({
      ...EMPTY_FILTERS,
      categoryId: "4",
      recurringId: "9",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
    });
  });

  it("ignores parameters a link can't preset", () => {
    expect(fromUrl("search=coffee&offset=100")).toEqual(FIRST_PAGE);
  });
});

describe("toListParams", () => {
  it("sends only the paging and sort of an unfiltered page", () => {
    expect(toListParams(FIRST_PAGE)).toEqual({
      sortBy: "date",
      sortOrder: "desc",
      limit: 50,
      offset: 0,
      search: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      type: undefined,
      categoryId: undefined,
      amountMin: undefined,
      amountMax: undefined,
      recurringId: undefined,
    });
  });

  it("asks for uncategorized transactions with a null category", () => {
    const params = toListParams({
      ...FIRST_PAGE,
      filters: { ...EMPTY_FILTERS, categoryId: "uncategorized" },
    });

    expect(params.categoryId).toBeNull();
  });

  it("types the numeric filters", () => {
    const params = toListParams({
      ...FIRST_PAGE,
      filters: { ...EMPTY_FILTERS, categoryId: "4", recurringId: "9", amountMin: "10.5" },
    });

    expect(params).toMatchObject({ categoryId: 4, recurringId: 9, amountMin: 10.5 });
  });

  it("drops an amount that isn't a number rather than sending it", () => {
    const params = toListParams({
      ...FIRST_PAGE,
      filters: { ...EMPTY_FILTERS, amountMax: "abc" },
    });

    expect(params.amountMax).toBeUndefined();
  });

  it("produces params the API accepts", () => {
    const params = toListParams({
      filters: {
        search: "2024",
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
        categoryId: "uncategorized",
        type: "refund",
        amountMin: "1",
        amountMax: "100",
        recurringId: "2",
      },
      sortBy: "amount",
      sortOrder: "asc",
      limit: 25,
      offset: 25,
    });

    expect(ListTransactionsSchema.safeParse(params).success).toBe(true);
  });
});
