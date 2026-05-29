"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/format";
import type { DailySpendPoint } from "@/lib/validators/reports";

interface SpendingHeatmapProps {
  points: DailySpendPoint[];
  /** Today's date as YYYY-MM-DD in the user's timezone (passed from server). */
  today: string;
}

interface Cell {
  date: string;
  total: number;
  count: number;
  bucket: number; // 0..5
}

const CELL_GAP = 3;
const ROWS = 7;
// Day-of-week label column width — narrow enough to leave most space for the
// grid, wide enough that "Mon"/"Wed"/"Fri" don't clip.
const DAY_LABEL_W = 24;
// Fixed size for the legend swatches (they're a key, not data — should stay
// constant regardless of container width).
const LEGEND_CELL_SIZE = 12;

// 6-step quantile ramp: bucket 0 = no spend, 5 = top quintile of spending days.
// Uses bg-primary opacity steps so the ramp adapts to light/dark mode and to
// any future brand-color change in globals.css.
const BUCKET_CLASSES = [
  "bg-muted",
  "bg-primary/15",
  "bg-primary/35",
  "bg-primary/55",
  "bg-primary/75",
  "bg-primary",
];

// Monday-first week. Show every other label to keep the column compact.
const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

function bucketize(points: DailySpendPoint[]): Map<string, Cell> {
  // Quantile thresholds from positive totals only — zero days are bucket 0.
  const positives = points
    .filter((p) => p.total > 0)
    .map((p) => p.total)
    .sort((a, b) => a - b);

  const q = (frac: number): number => {
    if (positives.length === 0) return 0;
    const idx = Math.min(Math.floor(positives.length * frac), positives.length - 1);
    return positives[idx] ?? 0;
  };
  const t1 = q(0.2);
  const t2 = q(0.4);
  const t3 = q(0.6);
  const t4 = q(0.8);

  const cells = new Map<string, Cell>();
  for (const p of points) {
    let bucket: number;
    if (p.total <= 0) bucket = 0;
    else if (p.total <= t1) bucket = 1;
    else if (p.total <= t2) bucket = 2;
    else if (p.total <= t3) bucket = 3;
    else if (p.total <= t4) bucket = 4;
    else bucket = 5;
    cells.set(p.date, { date: p.date, total: p.total, count: p.count, bucket });
  }
  return cells;
}

/** Convert Temporal's 1=Mon..7=Sun to Monday-first 0=Mon..6=Sun. */
function mondayDow(date: Temporal.PlainDate): number {
  return date.dayOfWeek - 1;
}

interface Grid {
  weeks: (Cell | null)[][];
  monthLabels: { col: number; label: string }[];
}

function buildGrid(points: DailySpendPoint[]): Grid | null {
  if (points.length === 0) return null;

  const cells = bucketize(points);
  const firstDate = Temporal.PlainDate.from(points[0].date);
  const lastDate = Temporal.PlainDate.from(points[points.length - 1].date);

  // Pad the grid to start on a Monday and end on a Sunday so every column
  // is a full 7-day stack.
  const gridStart = firstDate.subtract({ days: mondayDow(firstDate) });
  const gridEnd = lastDate.add({ days: 6 - mondayDow(lastDate) });

  const totalDays = gridStart.until(gridEnd, { largestUnit: "days" }).days + 1;
  const numWeeks = totalDays / ROWS;

  const weeks: (Cell | null)[][] = [];
  let cursor = gridStart;
  for (let w = 0; w < numWeeks; w++) {
    const week: (Cell | null)[] = [];
    for (let d = 0; d < ROWS; d++) {
      const dateStr = cursor.toString();
      const inWindow =
        Temporal.PlainDate.compare(cursor, firstDate) >= 0 &&
        Temporal.PlainDate.compare(cursor, lastDate) <= 0;
      week.push(
        inWindow ? (cells.get(dateStr) ?? { date: dateStr, total: 0, count: 0, bucket: 0 }) : null
      );
      cursor = cursor.add({ days: 1 });
    }
    weeks.push(week);
  }

  // Month labels: place above the first column whose first in-window day falls
  // in the first week of a new month. This avoids labels drifting onto the
  // wrong column for short months.
  const monthLabels: { col: number; label: string }[] = [];
  let prevMonth = "";
  for (let w = 0; w < weeks.length; w++) {
    const firstInWindow = weeks[w].find((c): c is Cell => c !== null);
    if (!firstInWindow) continue;
    const month = firstInWindow.date.slice(0, 7);
    if (month !== prevMonth) {
      const day = Temporal.PlainDate.from(firstInWindow.date).day;
      if (day <= 7) {
        monthLabels.push({
          col: w,
          label: Temporal.PlainDate.from(firstInWindow.date).toLocaleString("en-US", {
            month: "short",
          }),
        });
      }
      prevMonth = month;
    }
  }

  return { weeks, monthLabels };
}

function formatCellDate(date: string): string {
  return Temporal.PlainDate.from(date).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SpendingHeatmap({ points, today }: SpendingHeatmapProps): React.ReactElement {
  const grid = useMemo(() => buildGrid(points), [points]);
  const totalSpend = useMemo(() => points.reduce((sum, p) => sum + p.total, 0), [points]);
  const activeDays = useMemo(() => points.filter((p) => p.total > 0).length, [points]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending Activity</CardTitle>
        {grid && (
          <p className="text-muted-foreground text-sm">
            {formatCurrency(totalSpend)} across {activeDays} {activeDays === 1 ? "day" : "days"} in
            the last year
          </p>
        )}
      </CardHeader>
      <CardContent>
        {!grid ? (
          <EmptyState message="No spending yet." />
        ) : (
          <div className="flex flex-col">
            {/* Month labels row, aligned with the cell columns. Padded on the
                left so it sits flush above the cell grid (after the day-label
                column + the gap between the two). */}
            <div
              className="text-muted-foreground mb-1 grid text-[10px] leading-tight"
              style={{
                paddingLeft: `${DAY_LABEL_W + CELL_GAP}px`,
                gridTemplateColumns: `repeat(${grid.weeks.length}, minmax(0, 1fr))`,
                columnGap: `${CELL_GAP}px`,
              }}
            >
              {grid.weeks.map((_, col) => {
                const label = grid.monthLabels.find((m) => m.col === col)?.label ?? "";
                return (
                  <div key={col} className="overflow-visible whitespace-nowrap">
                    {label}
                  </div>
                );
              })}
            </div>

            {/* Day labels + cell grid. The grid container stretches to fill
                its parent's width; aspect-ratio fixes its height so that
                1fr × 1fr cells stay square. The day-label column is fixed
                width and stretches to the same height via flex. */}
            <div className="flex items-stretch" style={{ gap: `${CELL_GAP}px` }}>
              <div
                className="text-muted-foreground flex shrink-0 flex-col text-[10px]"
                style={{ width: `${DAY_LABEL_W}px`, rowGap: `${CELL_GAP}px` }}
              >
                {DAY_LABELS.map((label, i) => (
                  <div key={i} className="flex flex-1 items-center">
                    {label}
                  </div>
                ))}
              </div>
              <div
                className="grid min-w-0 flex-1 grid-flow-col"
                style={{
                  gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
                  gridTemplateColumns: `repeat(${grid.weeks.length}, minmax(0, 1fr))`,
                  gap: `${CELL_GAP}px`,
                  aspectRatio: `${grid.weeks.length} / ${ROWS}`,
                }}
              >
                {grid.weeks.flatMap((week, wi) =>
                  week.map((cell, di) => {
                    const key = `${wi}-${di}`;
                    if (!cell) {
                      return <div key={key} />;
                    }
                    const isToday = cell.date === today;
                    const baseClass = `size-full rounded-sm ${BUCKET_CLASSES[cell.bucket]} ${
                      isToday ? "ring-foreground/70 ring-1" : ""
                    }`;
                    const tooltipContent = (
                      <TooltipContent side="top">
                        <div className="text-xs">
                          <div className="font-medium">{formatCellDate(cell.date)}</div>
                          <div>
                            {formatCurrency(cell.total)} · {cell.count}{" "}
                            {cell.count === 1 ? "transaction" : "transactions"}
                          </div>
                        </div>
                      </TooltipContent>
                    );
                    if (cell.total > 0) {
                      return (
                        <Tooltip key={key}>
                          <TooltipTrigger asChild>
                            <Link
                              href={`/transactions?dateFrom=${cell.date}&dateTo=${cell.date}`}
                              className={`${baseClass} hover:ring-foreground/40 transition-shadow hover:ring-1`}
                              aria-label={`${formatCellDate(cell.date)}: ${formatCurrency(
                                cell.total
                              )}, ${cell.count} ${cell.count === 1 ? "transaction" : "transactions"}`}
                            />
                          </TooltipTrigger>
                          {tooltipContent}
                        </Tooltip>
                      );
                    }
                    return (
                      <Tooltip key={key}>
                        <TooltipTrigger asChild>
                          <div className={baseClass} />
                        </TooltipTrigger>
                        {tooltipContent}
                      </Tooltip>
                    );
                  })
                )}
              </div>
            </div>

            {/* Legend — fixed-size swatches, right-aligned. */}
            <div className="text-muted-foreground mt-3 flex items-center justify-end gap-1.5 text-[10px]">
              <span>Less</span>
              {BUCKET_CLASSES.map((cls, i) => (
                <div
                  key={i}
                  className={`rounded-sm ${cls}`}
                  style={{ width: `${LEGEND_CELL_SIZE}px`, height: `${LEGEND_CELL_SIZE}px` }}
                />
              ))}
              <span>More</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
