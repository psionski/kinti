// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { FrankfurterProvider } from "@/lib/providers/frankfurter";
import { EcbProvider } from "@/lib/providers/ecb";
import { CoinGeckoProvider } from "@/lib/providers/coingecko";
import { AlphaVantageProvider } from "@/lib/providers/alpha-vantage";
import { OpenExchangeRatesProvider } from "@/lib/providers/open-exchange-rates";
import { ExchangeRateApiProvider } from "@/lib/providers/exchangerate-api";
import { TwelveDataProvider } from "@/lib/providers/twelve-data";
import { FinnhubProvider } from "@/lib/providers/finnhub";
import { CoinMarketCapProvider } from "@/lib/providers/coinmarketcap";

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Frankfurter ──────────────────────────────────────────────────────────────

describe("FrankfurterProvider", () => {
  const provider = new FrankfurterProvider();

  it("parses getPrice response correctly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          date: "2026-01-15",
          base: "USD",
          rates: { EUR: 0.92 },
        }),
      })
    );

    const result = await provider.getPrice("USD", "EUR", "2026-01-15");
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("USD");
    expect(result!.currency).toBe("EUR");
    expect(result!.price).toBeCloseTo(0.92);
    expect(result!.date).toBe("2026-01-15");
    expect(result!.provider).toBe("frankfurter");
  });

  it("returns null on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const result = await provider.getPrice("USD", "EUR");
    expect(result).toBeNull();
  });

  it("returns null when quote not in response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ date: "2026-01-15", base: "USD", rates: { GBP: 0.78 } }),
      })
    );
    const result = await provider.getPrice("USD", "EUR");
    expect(result).toBeNull();
  });

  it("getPrices returns all pairs for a base", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          date: "2026-01-15",
          base: "EUR",
          rates: { USD: 1.08, GBP: 0.86, JPY: 163.5 },
        }),
      })
    );

    const results = await provider.getPrices("EUR");
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.currency).sort()).toEqual(["GBP", "JPY", "USD"]);
    expect(results.every((r) => r.symbol === "EUR")).toBe(true);
  });

  it("supports arbitrary from/to without EUR pivot (USD→GBP direct)", async () => {
    // Kinti is no longer EUR-only — Frankfurter must accept any base. This
    // test guards against a regression where call sites accidentally pivot
    // through EUR (rate(USD→GBP) = rate(EUR→GBP) / rate(EUR→USD)).
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        date: "2026-01-15",
        base: "USD",
        rates: { GBP: 0.79 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider.getPrice("USD", "GBP", "2026-01-15");

    expect(result?.price).toBeCloseTo(0.79);
    expect(result?.symbol).toBe("USD");
    expect(result?.currency).toBe("GBP");

    // Verify the URL: ?from=USD&to=GBP — not reversed, not pivoting through EUR.
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("from=USD");
    expect(calledUrl).toContain("to=GBP");
    expect(calledUrl).not.toContain("EUR");
  });
});

// ─── ECB ─────────────────────────────────────────────────────────────────────

const ECB_DAILY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01"
                 xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube>
    <Cube time="2026-01-15">
      <Cube currency="USD" rate="1.0870"/>
      <Cube currency="GBP" rate="0.8600"/>
      <Cube currency="JPY" rate="163.50"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("EcbProvider", () => {
  const provider = new EcbProvider();

  it("parses EUR→USD rate correctly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => ECB_DAILY_XML,
      })
    );

    const result = await provider.getPrice("EUR", "USD");
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("EUR");
    expect(result!.currency).toBe("USD");
    expect(result!.price).toBeCloseTo(1.087);
  });

  it("converts non-EUR base correctly (USD→GBP)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => ECB_DAILY_XML,
      })
    );

    // USD→GBP: GBP_in_EUR / USD_in_EUR = 0.86 / 1.087 ≈ 0.7912
    const result = await provider.getPrice("USD", "GBP");
    expect(result).not.toBeNull();
    expect(result!.price).toBeCloseTo(0.86 / 1.087, 3);
  });

  it("returns null when base currency not in ECB rates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => ECB_DAILY_XML,
      })
    );

    // BTC is not in ECB data
    const result = await provider.getPrice("BTC", "EUR");
    expect(result).toBeNull();
  });

  it("returns empty array on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const results = await provider.getPrices("EUR");
    expect(results).toEqual([]);
  });
});

// ─── CoinGecko ────────────────────────────────────────────────────────────────

describe("CoinGeckoProvider", () => {
  const provider = new CoinGeckoProvider();

  it("parses current price correctly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ bitcoin: { eur: 85432.5 } }),
      })
    );

    const result = await provider.getPrice("bitcoin", "EUR");
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("bitcoin");
    expect(result!.price).toBeCloseTo(85432.5);
    expect(result!.currency).toBe("EUR");
    expect(result!.provider).toBe("coingecko");
  });

  it("returns null on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const result = await provider.getPrice("bitcoin", "EUR");
    expect(result).toBeNull();
  });

  it("returns null when symbol not in response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ethereum: { eur: 3000 } }),
      })
    );
    const result = await provider.getPrice("bitcoin", "EUR");
    expect(result).toBeNull();
  });

  it("getPrices returns all currency pairs for a symbol", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ bitcoin: { eur: 85000, usd: 92000, gbp: 73000 } }),
      })
    );

    const results = await provider.getPrices("bitcoin");
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.find((r) => r.currency === "EUR")?.price).toBeCloseTo(85000);
    expect(results.find((r) => r.currency === "USD")?.price).toBeCloseTo(92000);
    expect(results.every((r) => r.symbol === "bitcoin")).toBe(true);
  });

  it("getPrices returns empty array on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const results = await provider.getPrices("bitcoin");
    expect(results).toEqual([]);
  });
});

// ─── Alpha Vantage ────────────────────────────────────────────────────────────

describe("AlphaVantageProvider", () => {
  const provider = new AlphaVantageProvider("test-key");

  it("parses current price correctly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          "Global Quote": { "05. price": "150.25" },
        }),
      })
    );

    const result = await provider.getPrice("AAPL", "USD");
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("AAPL");
    expect(result!.price).toBeCloseTo(150.25);
    expect(result!.currency).toBe("USD");
    expect(result!.provider).toBe("alpha-vantage");
  });

  it("returns null on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const result = await provider.getPrice("AAPL", "USD");
    expect(result).toBeNull();
  });

  it("getPriceRange returns daily prices in date range", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          "Time Series (Daily)": {
            "2026-01-15": { "4. close": "150.00" },
            "2026-01-14": { "4. close": "149.50" },
            "2026-01-13": { "4. close": "148.00" },
            "2026-01-10": { "4. close": "147.00" },
          },
        }),
      })
    );

    const results = await provider.getPriceRange("AAPL", "USD", "2026-01-13", "2026-01-15");
    expect(results).toHaveLength(3);
    expect(results[0].date).toBe("2026-01-13");
    expect(results[2].date).toBe("2026-01-15");
    expect(results[0].price).toBeCloseTo(148.0);
    expect(results.every((r) => r.provider === "alpha-vantage")).toBe(true);
  });

  it("getPriceRange excludes dates outside range", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          "Time Series (Daily)": {
            "2026-01-16": { "4. close": "151.00" },
            "2026-01-15": { "4. close": "150.00" },
            "2026-01-12": { "4. close": "146.00" },
          },
        }),
      })
    );

    const results = await provider.getPriceRange("AAPL", "USD", "2026-01-13", "2026-01-15");
    expect(results).toHaveLength(1);
    expect(results[0].date).toBe("2026-01-15");
  });

  it("getPriceRange returns empty on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const results = await provider.getPriceRange("AAPL", "USD", "2026-01-13", "2026-01-15");
    expect(results).toEqual([]);
  });

  it("searchSymbol returns matching results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          bestMatches: [
            { "1. symbol": "AAPL", "2. name": "Apple Inc", "3. type": "Equity" },
            { "1. symbol": "AAPLX", "2. name": "Apple Fund", "3. type": "ETF" },
          ],
        }),
      })
    );

    const results = await provider.searchSymbol("apple");
    expect(results).toHaveLength(2);
    expect(results[0].symbol).toBe("AAPL");
    expect(results[0].type).toBe("equity");
  });
});

// ─── ECB Extended ─────────────────────────────────────────────────────────────

const ECB_HIST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01"
                 xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube>
    <Cube time="2026-01-15">
      <Cube currency="USD" rate="1.0870"/>
      <Cube currency="GBP" rate="0.8600"/>
    </Cube>
    <Cube time="2026-01-14">
      <Cube currency="USD" rate="1.0850"/>
      <Cube currency="GBP" rate="0.8580"/>
    </Cube>
    <Cube time="2026-01-13">
      <Cube currency="USD" rate="1.0830"/>
      <Cube currency="GBP" rate="0.8560"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("EcbProvider — extended", () => {
  const provider = new EcbProvider();

  it("getPriceRange returns rates for date range", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => ECB_HIST_XML,
      })
    );

    const results = await provider.getPriceRange("EUR", "USD", "2026-01-13", "2026-01-15");
    expect(results).toHaveLength(3);
    expect(results[0].date).toBe("2026-01-13");
    expect(results[0].price).toBeCloseTo(1.083);
    expect(results[2].date).toBe("2026-01-15");
    expect(results[2].price).toBeCloseTo(1.087);
  });

  it("getPriceRange handles non-EUR base (USD→GBP)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => ECB_HIST_XML,
      })
    );

    const results = await provider.getPriceRange("USD", "GBP", "2026-01-14", "2026-01-15");
    expect(results).toHaveLength(2);
    // USD→GBP on 2026-01-15: 0.86 / 1.087
    expect(results[1].price).toBeCloseTo(0.86 / 1.087, 3);
  });

  it("getPriceRange returns empty on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const results = await provider.getPriceRange("EUR", "USD", "2026-01-13", "2026-01-15");
    expect(results).toEqual([]);
  });

  it("searchSymbol finds currencies by code and name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => ECB_DAILY_XML,
      })
    );

    const results = await provider.searchSymbol("USD");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.find((r) => r.symbol === "USD")).toBeTruthy();
    expect(results[0].type).toBe("currency");
  });

  it("searchSymbol returns empty on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const results = await provider.searchSymbol("USD");
    expect(results).toEqual([]);
  });
});

// ─── Open Exchange Rates ─────────────────────────────────────────────────────

describe("OpenExchangeRatesProvider", () => {
  const provider = new OpenExchangeRatesProvider("test-key");

  it("parses getPrice response correctly via getPrices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          timestamp: 1737000000,
          base: "USD",
          rates: { EUR: 0.92, GBP: 0.78, USD: 1 },
        }),
      })
    );

    const result = await provider.getPrice("EUR", "GBP");
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("EUR");
    expect(result!.currency).toBe("GBP");
    // EUR→GBP via USD pivot: GBP_rate / EUR_rate = 0.78 / 0.92
    expect(result!.price).toBeCloseTo(0.78 / 0.92, 3);
  });

  it("searchSymbol finds currencies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          EUR: "Euro",
          USD: "United States Dollar",
          GBP: "British Pound Sterling",
        }),
      })
    );

    const results = await provider.searchSymbol("euro");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.find((r) => r.symbol === "EUR")).toBeTruthy();
    expect(results[0].type).toBe("currency");
  });

  it("searchSymbol returns empty on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const results = await provider.searchSymbol("USD");
    expect(results).toEqual([]);
  });

  it("getPriceRange fetches historical rates day by day", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        timestamp: 1737000000,
        base: "USD",
        rates: { EUR: 0.92, GBP: 0.78, USD: 1 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await provider.getPriceRange("EUR", "GBP", "2026-01-13", "2026-01-15");
    expect(results).toHaveLength(3);
    expect(results[0].date).toBe("2026-01-13");
    expect(results[2].date).toBe("2026-01-15");
    expect(results[0].price).toBeCloseTo(0.78 / 0.92, 3);
    // Should have made 3 fetch calls (one per day)
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

// ─── ExchangeRate-API ────────────────────────────────────────────────────────

describe("ExchangeRateApiProvider", () => {
  const provider = new ExchangeRateApiProvider("test-key");

  it("parses pair conversion response correctly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: "success",
          conversion_rate: 0.92,
          time_last_update_utc: "Mon, 06 Jan 2026 00:00:01 +0000",
        }),
      })
    );

    const result = await provider.getPrice("USD", "EUR");
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("USD");
    expect(result!.currency).toBe("EUR");
    expect(result!.price).toBeCloseTo(0.92);
    expect(result!.provider).toBe("exchangerate-api");
  });

  it("returns null on API error result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: "error" }),
      })
    );
    const result = await provider.getPrice("USD", "EUR");
    expect(result).toBeNull();
  });

  it("returns null on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const result = await provider.getPrice("USD", "EUR");
    expect(result).toBeNull();
  });

  it("getPrices returns all currency pairs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: "success",
          conversion_rates: { USD: 1, EUR: 0.92, GBP: 0.78 },
          time_last_update_utc: "Mon, 06 Jan 2026 00:00:01 +0000",
        }),
      })
    );

    const results = await provider.getPrices("USD");
    expect(results).toHaveLength(2); // excludes USD itself
    expect(results.find((r) => r.currency === "EUR")?.price).toBeCloseTo(0.92);
    expect(results.find((r) => r.currency === "GBP")?.price).toBeCloseTo(0.78);
  });

  it("searchSymbol finds currencies by code and name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: "success",
          supported_codes: [
            ["EUR", "Euro"],
            ["USD", "United States Dollar"],
            ["GBP", "Pound Sterling"],
          ],
        }),
      })
    );

    const results = await provider.searchSymbol("euro");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.find((r) => r.symbol === "EUR")).toBeTruthy();
    expect(results[0].type).toBe("currency");
  });
});

// ─── Twelve Data ─────────────────────────────────────────────────────────────

describe("TwelveDataProvider", () => {
  const provider = new TwelveDataProvider("test-key");

  it("parses current price correctly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          symbol: "AAPL",
          name: "Apple Inc",
          currency: "USD",
          datetime: "2026-01-15",
          close: "150.25",
        }),
      })
    );

    const result = await provider.getPrice("AAPL", "USD");
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("AAPL");
    expect(result!.price).toBeCloseTo(150.25);
    expect(result!.currency).toBe("USD");
    expect(result!.provider).toBe("twelve-data");
  });

  it("returns null on error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "error",
          message: "Invalid symbol",
        }),
      })
    );
    const result = await provider.getPrice("INVALID", "USD");
    expect(result).toBeNull();
  });

  it("returns null on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const result = await provider.getPrice("AAPL", "USD");
    expect(result).toBeNull();
  });

  it("getPriceRange returns daily prices in date range", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          meta: { symbol: "AAPL", currency: "USD" },
          values: [
            {
              datetime: "2026-01-15",
              open: "150.00",
              high: "151.00",
              low: "149.00",
              close: "150.50",
            },
            {
              datetime: "2026-01-14",
              open: "149.00",
              high: "150.50",
              low: "148.50",
              close: "149.75",
            },
            {
              datetime: "2026-01-13",
              open: "148.00",
              high: "149.00",
              low: "147.50",
              close: "148.25",
            },
          ],
          status: "ok",
        }),
      })
    );

    const results = await provider.getPriceRange("AAPL", "USD", "2026-01-13", "2026-01-15");
    expect(results).toHaveLength(3);
    expect(results[0].date).toBe("2026-01-13");
    expect(results[2].date).toBe("2026-01-15");
    expect(results[0].price).toBeCloseTo(148.25);
    expect(results.every((r) => r.provider === "twelve-data")).toBe(true);
  });

  it("searchSymbol returns matching results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              symbol: "AAPL",
              instrument_name: "Apple Inc",
              exchange: "NASDAQ",
              instrument_type: "Common Stock",
            },
            {
              symbol: "AMZN",
              instrument_name: "Amazon.com Inc",
              exchange: "NASDAQ",
              instrument_type: "Common Stock",
            },
          ],
          status: "ok",
        }),
      })
    );

    const results = await provider.searchSymbol("apple");
    expect(results).toHaveLength(2);
    expect(results[0].symbol).toBe("AAPL");
    expect(results[0].type).toBe("stock");
  });
});

// ─── Finnhub ─────────────────────────────────────────────────────────────────

describe("FinnhubProvider", () => {
  const provider = new FinnhubProvider("test-key");

  it("parses current quote correctly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          c: 150.25,
          d: 1.5,
          dp: 1.01,
          h: 151.0,
          l: 149.0,
          o: 149.5,
          pc: 148.75,
        }),
      })
    );

    const result = await provider.getPrice("AAPL", "USD");
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("AAPL");
    expect(result!.price).toBeCloseTo(150.25);
    expect(result!.currency).toBe("USD");
    expect(result!.provider).toBe("finnhub");
  });

  it("returns null when price is 0 (no data)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0 }),
      })
    );
    const result = await provider.getPrice("INVALID", "USD");
    expect(result).toBeNull();
  });

  it("returns null on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const result = await provider.getPrice("AAPL", "USD");
    expect(result).toBeNull();
  });

  it("getPriceRange returns daily candle prices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          c: [148.0, 149.5, 150.0],
          h: [149.0, 150.5, 151.0],
          l: [147.0, 148.5, 149.0],
          o: [147.5, 149.0, 149.5],
          t: [1736726400, 1736812800, 1736899200], // 2025-01-13, 14, 15
          v: [1000000, 1100000, 1200000],
          s: "ok",
        }),
      })
    );

    const results = await provider.getPriceRange("AAPL", "USD", "2025-01-13", "2025-01-15");
    expect(results).toHaveLength(3);
    expect(results[0].price).toBeCloseTo(148.0);
    expect(results[2].price).toBeCloseTo(150.0);
    expect(results.every((r) => r.provider === "finnhub")).toBe(true);
  });

  it("getPriceRange returns empty when status is no_data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ s: "no_data" }),
      })
    );
    const results = await provider.getPriceRange("AAPL", "USD", "2026-01-13", "2026-01-15");
    expect(results).toEqual([]);
  });

  it("searchSymbol returns matching results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          count: 2,
          result: [
            {
              description: "Apple Inc",
              displaySymbol: "AAPL",
              symbol: "AAPL",
              type: "Common Stock",
            },
            {
              description: "Apple Hospitality REIT",
              displaySymbol: "APLE",
              symbol: "APLE",
              type: "REIT",
            },
          ],
        }),
      })
    );

    const results = await provider.searchSymbol("apple");
    expect(results).toHaveLength(2);
    expect(results[0].symbol).toBe("AAPL");
    expect(results[0].type).toBe("stock");
    expect(results[1].type).toBe("reit");
  });
});

// ─── CoinMarketCap ───────────────────────────────────────────────────────────

describe("CoinMarketCapProvider", () => {
  const provider = new CoinMarketCapProvider("test-key");

  it("parses current price correctly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: { error_code: 0 },
          data: {
            "1": {
              id: 1,
              name: "Bitcoin",
              symbol: "BTC",
              slug: "bitcoin",
              quote: {
                EUR: { price: 85432.5, last_updated: "2026-01-15T12:00:00.000Z" },
              },
            },
          },
        }),
      })
    );

    const result = await provider.getPrice("bitcoin", "EUR");
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("bitcoin");
    expect(result!.price).toBeCloseTo(85432.5);
    expect(result!.currency).toBe("EUR");
    expect(result!.provider).toBe("coinmarketcap");
  });

  it("returns null on API error code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: { error_code: 400, error_message: "Invalid slug" },
          data: {},
        }),
      })
    );
    const result = await provider.getPrice("invalid-coin", "EUR");
    expect(result).toBeNull();
  });

  it("returns null on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const result = await provider.getPrice("bitcoin", "EUR");
    expect(result).toBeNull();
  });

  it("getPrices returns multiple currency quotes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: { error_code: 0 },
          data: {
            "1": {
              id: 1,
              name: "Bitcoin",
              symbol: "BTC",
              slug: "bitcoin",
              quote: {
                EUR: { price: 85000, last_updated: "2026-01-15T12:00:00.000Z" },
                USD: { price: 92000, last_updated: "2026-01-15T12:00:00.000Z" },
                GBP: { price: 73000, last_updated: "2026-01-15T12:00:00.000Z" },
              },
            },
          },
        }),
      })
    );

    const results = await provider.getPrices("bitcoin");
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.find((r) => r.currency === "EUR")?.price).toBeCloseTo(85000);
    expect(results.find((r) => r.currency === "USD")?.price).toBeCloseTo(92000);
    expect(results.every((r) => r.symbol === "bitcoin")).toBe(true);
  });

  it("searchSymbol finds coins by name and symbol", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: { error_code: 0 },
          data: [
            { id: 1, name: "Bitcoin", symbol: "BTC", slug: "bitcoin" },
            { id: 4023, name: "Bitcoin Cash", symbol: "BCH", slug: "bitcoin-cash" },
            { id: 2, name: "Litecoin", symbol: "LTC", slug: "litecoin" },
          ],
        }),
      })
    );

    const results = await provider.searchSymbol("bitcoin");
    expect(results).toHaveLength(2);
    expect(results[0].symbol).toBe("bitcoin");
    expect(results[1].symbol).toBe("bitcoin-cash");
    expect(results[0].type).toBe("crypto");
  });
});
