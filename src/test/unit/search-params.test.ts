import { describe, it, expect } from "vitest";
import { z } from "zod";
import { searchParamsToObject, toSearchParams } from "@/lib/api/search-params";
import { ListTransactionsSchema, SuggestSchema } from "@/lib/validators/transactions";

/** What the API's GET handler validates after a client sends `params`. */
function throughTheWire(schema: z.ZodType, params: Parameters<typeof toSearchParams>[0]) {
  return schema.safeParse(searchParamsToObject(toSearchParams(params), schema));
}

describe("toSearchParams", () => {
  it("leaves out undefined, sends null as text and arrays as repeated keys", () => {
    const search = toSearchParams({
      a: "x",
      b: undefined,
      c: null,
      d: 3,
      e: false,
      tags: ["one", "two"],
    });

    expect(search.toString()).toBe("a=x&c=null&d=3&e=false&tags=one&tags=two");
  });
});

describe("searchParamsToObject", () => {
  it("keeps numeric-looking text in a text field", () => {
    const decoded = searchParamsToObject(
      new URLSearchParams("search=2024"),
      ListTransactionsSchema
    );

    expect(decoded).toEqual({ search: "2024" });
  });

  it("keeps true/false/null as text in a text field", () => {
    const decoded = searchParamsToObject(
      new URLSearchParams("search=true&merchant=null"),
      ListTransactionsSchema
    );

    expect(decoded).toEqual({ search: "true", merchant: "null" });
  });

  it("reads numbers and booleans in fields of those types", () => {
    const schema = z.object({ n: z.number(), b: z.boolean() });

    expect(searchParamsToObject(new URLSearchParams("n=1.5&b=false"), schema)).toEqual({
      n: 1.5,
      b: false,
    });
  });

  it("reads null only where the field is nullable", () => {
    expect(
      searchParamsToObject(new URLSearchParams("categoryId=null"), ListTransactionsSchema)
    ).toEqual({ categoryId: null });
  });

  it("collects a single value of an array field into an array", () => {
    expect(searchParamsToObject(new URLSearchParams("tags=a"), ListTransactionsSchema)).toEqual({
      tags: ["a"],
    });
  });

  it("leaves a non-number in a number field for validation to reject", () => {
    const result = ListTransactionsSchema.safeParse(
      searchParamsToObject(new URLSearchParams("limit=lots"), ListTransactionsSchema)
    );

    expect(result.success).toBe(false);
  });

  it("guesses for keys the schema doesn't describe", () => {
    const decoded = searchParamsToObject(
      new URLSearchParams("x=1&y=true&z=null&w=text"),
      z.object({})
    );

    expect(decoded).toEqual({ x: 1, y: true, z: null, w: "text" });
  });
});

describe("a round trip through the query string", () => {
  it.each([
    { label: "an empty query", params: {} },
    {
      label: "every filter",
      params: {
        limit: 25,
        offset: 50,
        sortBy: "amount",
        sortOrder: "asc",
        search: "2024",
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
        categoryId: 7,
        amountMin: 10.5,
        amountMax: 99,
        type: "refund",
        recurringId: 3,
        tags: ["groceries"],
      },
    },
    { label: "uncategorized", params: { categoryId: null } },
  ] as const)("validates $label exactly as sending the params directly would", ({ params }) => {
    const wire = throughTheWire(ListTransactionsSchema, params);
    const direct = ListTransactionsSchema.safeParse(params);

    expect(wire.success).toBe(true);
    expect(wire.data).toEqual(direct.data);
  });

  it("keeps a numeric suggestion query as text", () => {
    const wire = throughTheWire(SuggestSchema, { field: "merchant", q: "7" });

    expect(wire.data).toEqual({ field: "merchant", q: "7", limit: 10 });
  });
});
