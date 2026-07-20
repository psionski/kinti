// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let mockHasSampleData: boolean;

beforeEach(() => {
  mockHasSampleData = false;

  vi.doMock("@/lib/services/sample-data", () => ({
    hasSampleData: () => mockHasSampleData,
    clearSampleData: vi.fn(),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/sample-data", () => {
  it("returns hasSampleData: false when no sample data", async () => {
    const { GET } = await import("@/app/api/sample-data/route");
    const res = GET();
    const body = (await res.json()) as { hasSampleData: boolean };
    expect(res.status).toBe(200);
    expect(body.hasSampleData).toBe(false);
  });

  it("returns hasSampleData: true when sample data is present", async () => {
    mockHasSampleData = true;
    const { GET } = await import("@/app/api/sample-data/route");
    const res = GET();
    const body = (await res.json()) as { hasSampleData: boolean };
    expect(res.status).toBe(200);
    expect(body.hasSampleData).toBe(true);
  });
});

describe("DELETE /api/sample-data", () => {
  it("clears sample data and returns success", async () => {
    const { DELETE } = await import("@/app/api/sample-data/route");
    const res = DELETE();
    const body = (await res.json()) as { cleared: boolean };
    expect(res.status).toBe(200);
    expect(body.cleared).toBe(true);
  });
});
