"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ValueChart } from "./value-chart";
import { PriceChart } from "./price-chart";
import { getBaseCurrency } from "@/lib/format";
import type { AssetHistoryResult } from "@/lib/validators/portfolio-reports";
import type { AssetType } from "@/lib/validators/assets";

const WINDOWS = ["3m", "6m", "12m", "all"] as const;
type Window = (typeof WINDOWS)[number];

/** Names the selected range, so "high" and "low" state what they span. */
function rangeLabel(w: Window): string {
  return w === "all" ? "All-time" : w.toUpperCase();
}

interface AssetDetailChartsProps {
  assetId: number;
  type: AssetType;
  currency: string;
  /** Whether the asset has a symbol map, i.e. whether a rate series can exist. */
  tracked: boolean;
}

export function AssetDetailCharts({
  assetId,
  type,
  currency,
  tracked,
}: AssetDetailChartsProps): React.ReactElement {
  const [window, setWindow] = useState<Window>("6m");
  const [history, setHistory] = useState<AssetHistoryResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/assets/${assetId}/history?window=${window}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          setHistory((await res.json()) as AssetHistoryResult);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        // A superseded request is aborted; its cleanup already started a fresh
        // load, so don't clear the loading state on its behalf.
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [assetId, window]);

  // What varies over time depends on the asset. A deposit's unit price is
  // pinned at 1 — one euro is one euro — so charting it draws a flat line that
  // says nothing. For a foreign deposit the series that *does* move is its
  // exchange rate, which is what turns the balance into base currency; for one
  // held in the base currency nothing moves at all, and the value chart alone
  // tells the whole story.
  const baseCurrency = getBaseCurrency();
  const isDeposit = type === "deposit";
  const mode: "price" | "rate" | "none" = !isDeposit
    ? "price"
    : currency !== baseCurrency
      ? "rate"
      : "none";

  const timeline = history?.timeline ?? [];
  const seriesData =
    mode === "rate"
      ? timeline
          .filter((p) => p.rate !== null)
          .map((p) => ({ pricePerUnit: p.rate!, recordedAt: p.date }))
      : timeline
          .filter((p) => p.price !== null)
          .map((p) => ({ pricePerUnit: p.price!, recordedAt: p.date }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {WINDOWS.map((w) => (
          <Button
            key={w}
            variant={window === w ? "default" : "outline"}
            size="sm"
            onClick={() => setWindow(w)}
          >
            {w.toUpperCase()}
          </Button>
        ))}
      </div>

      <div className={loading ? "pointer-events-none opacity-60" : ""}>
        <div className={`grid grid-cols-1 gap-6 ${mode === "none" ? "" : "lg:grid-cols-2"}`}>
          {mode === "price" && (
            <PriceChart data={seriesData} currency={currency} rangeLabel={rangeLabel(window)} />
          )}
          {mode === "rate" && (
            <PriceChart
              data={seriesData}
              // The rate is quoted in base — it is what one unit of the
              // account's currency is worth, not a price in that currency.
              currency={baseCurrency}
              rangeLabel={rangeLabel(window)}
              title="Exchange Rate"
              caption={`1 ${currency} in ${baseCurrency}`}
              // Today's rate is fetched for every foreign asset currency, so an
              // untracked account is valued correctly but has no *history* to
              // draw. Say which of the two is missing: one is fixed by adding a
              // symbol, the other only by waiting.
              emptyMessage={
                tracked
                  ? "Not enough exchange rate data yet."
                  : "Add exchange rate tracking below to chart this."
              }
            />
          )}
          {history && (
            <ValueChart data={history} currency={currency} rangeLabel={rangeLabel(window)} />
          )}
        </div>
      </div>
    </div>
  );
}
