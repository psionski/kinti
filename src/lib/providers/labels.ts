import type { ProviderName } from "./types";

/** Human-readable display labels for each provider (client-bundle safe). */
export const PROVIDER_LABELS: Record<ProviderName, string> = {
  frankfurter: "Frankfurter",
  fawazahmed: "fawazahmed0/exchange-api",
  ecb: "ECB",
  coingecko: "CoinGecko",
  "open-exchange-rates": "Open Exchange Rates",
  "alpha-vantage": "Alpha Vantage",
  "exchangerate-api": "ExchangeRate-API",
  "twelve-data": "Twelve Data",
  finnhub: "Finnhub",
  coinmarketcap: "CoinMarketCap",
};
