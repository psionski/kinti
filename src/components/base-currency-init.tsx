"use client";

import { setBaseCurrencyCache } from "@/lib/format";

/**
 * Receives the app base currency from the server layout and sets it
 * in the client-side format module before any other component renders.
 * Mirrors TimezoneInit — both are app-immutable settings.
 */
export function BaseCurrencyInit({ currency }: { currency: string }): null {
  setBaseCurrencyCache(currency);
  return null;
}
