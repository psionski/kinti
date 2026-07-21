"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ValueChart } from "./value-chart";
import { PriceChart } from "./price-chart";
import type { AssetHistoryResult } from "@/lib/validators/portfolio-reports";

const WINDOWS = ["3m", "6m", "12m", "all"] as const;
type Window = (typeof WINDOWS)[number];

interface AssetDetailChartsProps {
  assetId: number;
  currency: string;
}

export function AssetDetailCharts({
  assetId,
  currency,
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

  // Derive price chart data from the history timeline (uses the unified price resolver)
  const priceData = history
    ? history.timeline
        .filter((p) => p.price !== null)
        .map((p) => ({ pricePerUnit: p.price!, recordedAt: p.date }))
    : [];

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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {history && <ValueChart data={history} currency={currency} />}
          <PriceChart data={priceData} currency={currency} />
        </div>
      </div>
    </div>
  );
}
