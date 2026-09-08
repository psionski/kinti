// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { providerFetch } from "@/lib/providers/rate-limit";

// Vitest sets the interval to 0 globally so the rest of the suite never sleeps
// (see vitest.config.ts). These tests are about the spacing itself, so they set
// a small real interval and restore it afterwards.
const TEST_INTERVAL_MS = 60;
const original = process.env.PROVIDER_MIN_INTERVAL_MS;

/** Timestamps at which fetch was actually invoked, in call order. */
let sentAt: number[];

beforeEach(() => {
  process.env.PROVIDER_MIN_INTERVAL_MS = String(TEST_INTERVAL_MS);
  sentAt = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      sentAt.push(Date.now());
      return { ok: true, json: async () => ({}) } as unknown as Response;
    })
  );
});

afterEach(() => {
  process.env.PROVIDER_MIN_INTERVAL_MS = original;
  vi.restoreAllMocks();
});

describe("providerFetch", () => {
  it("spaces consecutive requests to the same provider", async () => {
    await providerFetch("finnhub", "https://example.test/1");
    await providerFetch("finnhub", "https://example.test/2");
    await providerFetch("finnhub", "https://example.test/3");

    expect(sentAt).toHaveLength(3);
    expect(sentAt[1]! - sentAt[0]!).toBeGreaterThanOrEqual(TEST_INTERVAL_MS);
    expect(sentAt[2]! - sentAt[1]!).toBeGreaterThanOrEqual(TEST_INTERVAL_MS);
  });

  it("spaces concurrent requests to the same provider", async () => {
    // The burst that caused the bug: several assets refreshed without awaiting
    // each other. Queueing has to happen inside the gate, not at the call site.
    await Promise.all([
      providerFetch("alpha-vantage", "https://example.test/a"),
      providerFetch("alpha-vantage", "https://example.test/b"),
      providerFetch("alpha-vantage", "https://example.test/c"),
    ]);

    expect(sentAt).toHaveLength(3);
    expect(sentAt[1]! - sentAt[0]!).toBeGreaterThanOrEqual(TEST_INTERVAL_MS);
    expect(sentAt[2]! - sentAt[1]!).toBeGreaterThanOrEqual(TEST_INTERVAL_MS);
  });

  it("does not make one provider wait on another", async () => {
    const started = Date.now();
    await Promise.all([
      providerFetch("frankfurter", "https://example.test/fx"),
      providerFetch("coingecko", "https://example.test/crypto"),
      providerFetch("twelve-data", "https://example.test/stock"),
    ]);

    expect(sentAt).toHaveLength(3);
    expect(Date.now() - started).toBeLessThan(TEST_INTERVAL_MS);
  });

  it("keeps pacing after a failed request", async () => {
    // A rejected fetch must not leave the lane holding the queue open, or one
    // network blip would strand every later refresh.
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("network down"))
        .mockImplementation(async () => {
          sentAt.push(Date.now());
          return { ok: true, json: async () => ({}) } as unknown as Response;
        })
    );

    await expect(providerFetch("ecb", "https://example.test/boom")).rejects.toThrow("network down");
    await providerFetch("ecb", "https://example.test/ok");

    expect(sentAt).toHaveLength(1);
  });

  it("issues requests immediately when pacing is disabled", async () => {
    process.env.PROVIDER_MIN_INTERVAL_MS = "0";
    const started = Date.now();
    await providerFetch("fawazahmed", "https://example.test/1");
    await providerFetch("fawazahmed", "https://example.test/2");

    expect(sentAt).toHaveLength(2);
    expect(Date.now() - started).toBeLessThan(TEST_INTERVAL_MS);
  });
});
