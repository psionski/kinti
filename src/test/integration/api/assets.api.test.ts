import { describe, it, expect, beforeEach } from "vitest";
import { setupTestServices, makeJson, json } from "./helpers";
import { AssetService } from "@/lib/services/assets";
import type { ErrorResponse } from "@/lib/validators/common";

const { getDb } = setupTestServices();

describe("Asset price API route", () => {
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    const route = await import("@/app/api/assets/[id]/prices/route");
    POST = route.POST;
  });

  const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

  function record(id: number, pricePerUnit: number): Promise<Response> {
    return POST(makeJson("POST", `/api/assets/${id}/prices`, { pricePerUnit }), ctx(id));
  }

  it("records a mark on an investment", async () => {
    const asset = new AssetService(getDb()).create({
      name: "VWCE",
      type: "investment",
      currency: "EUR",
    });

    const res = await record(asset.id, 128.4);
    expect(res.status).toBe(201);
  });

  // A deposit's price is 1 by definition, so the service refuses the write.
  // That is the caller asking for something the domain forbids, not a server
  // fault: it has to arrive as a 400 with the reason intact, or an MCP client
  // reads "internal error" and retries a request that can never succeed.
  it("rejects a mark on a deposit as a 400, not a 500", async () => {
    const asset = new AssetService(getDb()).create({
      name: "USD Savings",
      type: "deposit",
      currency: "USD",
    });

    const res = await record(asset.id, 0.92);
    expect(res.status).toBe(400);

    const body = await json<ErrorResponse>(res);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toContain("always 1 USD");
  });

  // The pre-existing behaviour for genuine faults is unchanged.
  it("still reports an unknown asset as a server error", async () => {
    const res = await record(9999, 10);
    expect(res.status).toBe(500);
    expect((await json<ErrorResponse>(res)).code).toBe("INTERNAL_ERROR");
  });
});
