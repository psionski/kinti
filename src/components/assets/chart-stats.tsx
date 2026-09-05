"use client";

export interface ChartStat {
  label: string;
  value: string;
}

export interface SeriesExtremes {
  current: number;
  high: number;
  low: number;
}

/**
 * Current, high and low of a plotted series. "Current" is the last point rather
 * than any stored figure, so the numbers under a chart always match where its
 * line ends.
 */
export function seriesExtremes(values: number[]): SeriesExtremes | null {
  const [first, ...rest] = values;
  if (first === undefined) return null;

  let high = first;
  let low = first;
  for (const v of rest) {
    if (v > high) high = v;
    if (v < low) low = v;
  }
  return { current: values[values.length - 1]!, high, low };
}

/** A row of labelled figures under a chart, spread across its full width. */
export function ChartStats({ stats }: { stats: ChartStat[] }): React.ReactElement {
  return (
    <div className="mt-4 flex justify-between gap-2 border-t pt-3 text-xs">
      {stats.map((stat) => (
        <div key={stat.label}>
          <p className="text-muted-foreground">{stat.label}</p>
          <p className="text-foreground">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
