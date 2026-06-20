import { Temporal } from "@js-temporal/polyfill";
import type { Window, Interval } from "@/lib/validators/portfolio-reports";

// ─── Timezone ─────────────────────────────────────────────────────────────────

// Stored on globalThis so the value survives Next.js re-bundling across
// server components, API routes, and instrumentation — same pattern as the
// DB singleton in lib/db/index.ts.
const g = globalThis as unknown as { __kintiTz?: string };

/** Returns the cached timezone. Defaults to UTC until setUserTimezone() is called. */
function tz(): string {
  return g.__kintiTz ?? "UTC";
}

/** Set the timezone used by all date functions. Called at server startup from settings DB. */
export function setUserTimezone(timezone: string): void {
  g.__kintiTz = timezone;
}

/** Clear the cached timezone so it's re-read on next access. */
export function clearTimezoneCache(): void {
  g.__kintiTz = undefined;
}

// ─── Timestamp Conversion ────────────────────────────────────────────────────

/**
 * Normalize a UTC timestamp string to something Temporal.Instant can parse.
 * Handles SQLite format ("YYYY-MM-DD HH:MM:SS") and strings missing a Z suffix.
 */
export function normalizeUtc(utcStr: string): string {
  let s = utcStr.includes("T") ? utcStr : utcStr.replace(" ", "T");
  if (!/[Zz]$|[+-]\d{2}(:\d{2})?$/.test(s)) s += "Z";
  return s;
}

/**
 * Convert a UTC timestamp string to a local-time ISO string in the user's timezone.
 * Handles both SQLite format ("YYYY-MM-DD HH:MM:SS") and JS ISO format ("YYYY-MM-DDTHH:MM:SS.mmmZ").
 * Returns "YYYY-MM-DDTHH:MM:SS" in the configured timezone.
 */
export function utcToLocal(utcStr: string): string {
  return Temporal.Instant.from(normalizeUtc(utcStr))
    .toZonedDateTimeISO(tz())
    .toPlainDateTime()
    .toString({ smallestUnit: "second" });
}

/**
 * Convert a local-time timestamp to a UTC ISO string for storage.
 * If the input already has timezone info (Z or ±HH:MM), it's parsed directly.
 * Otherwise it's interpreted as local time in the user's configured timezone.
 */
export function localToUtc(localStr: string): string {
  if (/[Zz]$|[+-]\d{2}(:\d{2})?$/.test(localStr)) {
    return Temporal.Instant.from(localStr).toString();
  }
  return Temporal.PlainDateTime.from(localStr).toZonedDateTime(tz()).toInstant().toString();
}

// ─── Today / Current Month ────────────────────────────────────────────────────

/** Today's date as YYYY-MM-DD in the user's configured timezone. */
export function isoToday(): string {
  return Temporal.Now.plainDateISO(tz()).toString();
}

export interface DateRange {
  dateFrom: string;
  dateTo: string;
}

export interface ComputedRange extends DateRange {
  compareDateFrom: string;
  compareDateTo: string;
  /** Approximate number of months the range spans (for trends API) */
  months: number;
}

export type Preset = "this-month" | "last-month" | "3m" | "6m" | "12m" | "ytd" | "custom";

export const DEFAULT_PRESET: Exclude<Preset, "custom"> = "6m";

export const PRESET_LABELS: Record<Preset, string> = {
  "this-month": "This Month",
  "last-month": "Last Month",
  "3m": "3 Months",
  "6m": "6 Months",
  "12m": "12 Months",
  ytd: "YTD",
  custom: "Custom",
};

/** Returns the current month as YYYY-MM in the user's configured timezone. */
export function getCurrentMonth(): string {
  return Temporal.Now.plainDateISO(tz()).toPlainYearMonth().toString();
}

export interface MonthInfo {
  currentMonth: string;
  monthStart: string;
  monthEnd: string;
  monthLabel: string;
}

/** Returns the current month string, start/end dates, and a human-readable label. */
export function getCurrentMonthInfo(): MonthInfo {
  const ym = Temporal.Now.plainDateISO(tz()).toPlainYearMonth();
  const currentMonth = ym.toString();
  const monthStart = ym.toPlainDate({ day: 1 }).toString();
  const monthEnd = ym.toPlainDate({ day: ym.daysInMonth }).toString();
  const monthLabel = ym
    .toPlainDate({ day: 1 })
    .toLocaleString("en", { month: "long", year: "numeric" });
  return { currentMonth, monthStart, monthEnd, monthLabel };
}

/** Returns the start/end dates for the month before the given YYYY-MM. */
export function getPreviousMonthRange(currentMonth: string): {
  prevMonthStart: string;
  prevMonthEnd: string;
} {
  const ym = Temporal.PlainYearMonth.from(currentMonth).subtract({ months: 1 });
  return {
    prevMonthStart: ym.toPlainDate({ day: 1 }).toString(),
    prevMonthEnd: ym.toPlainDate({ day: ym.daysInMonth }).toString(),
  };
}

export function computePresetRange(preset: Exclude<Preset, "custom">): DateRange {
  const ym = Temporal.Now.plainDateISO(tz()).toPlainYearMonth();

  if (preset === "last-month") {
    const prev = ym.subtract({ months: 1 });
    return {
      dateFrom: prev.toPlainDate({ day: 1 }).toString(),
      dateTo: prev.toPlainDate({ day: prev.daysInMonth }).toString(),
    };
  }

  const dateTo = ym.toPlainDate({ day: ym.daysInMonth }).toString();
  let startYm: Temporal.PlainYearMonth;

  switch (preset) {
    case "this-month":
      startYm = ym;
      break;
    case "3m":
      startYm = ym.subtract({ months: 2 });
      break;
    case "6m":
      startYm = ym.subtract({ months: 5 });
      break;
    case "12m":
      startYm = ym.subtract({ months: 11 });
      break;
    case "ytd":
      startYm = Temporal.PlainYearMonth.from({ year: ym.year, month: 1 });
      break;
  }

  return { dateFrom: startYm.toPlainDate({ day: 1 }).toString(), dateTo };
}

// ─── Shared Date Utilities ────────────────────────────────────────────────────

/** Offset a YYYY-MM-DD date string by a number of days. */
export function offsetDate(date: string, days: number): string {
  const d = Temporal.PlainDate.from(date);
  return (days >= 0 ? d.add({ days }) : d.subtract({ days: -days })).toString();
}

/** Number of days between two YYYY-MM-DD dates (to - from). Same date returns 0. */
export function daysBetween(from: string, to: string): number {
  return Temporal.PlainDate.from(from)
    .until(Temporal.PlainDate.from(to), { largestUnit: "days" })
    .total("days");
}

/** Convert a Unix timestamp (milliseconds) to YYYY-MM-DD in UTC. */
export function isoDateFromMs(ms: number): string {
  return Temporal.Instant.fromEpochMilliseconds(ms)
    .toZonedDateTimeISO("UTC")
    .toPlainDate()
    .toString();
}

// ─── Portfolio Date Utilities ─────────────────────────────────────────────────

/** Convert a portfolio window preset to a concrete date range. */
export function windowToDateRange(window: Window): { from: string; to: string } {
  const to = isoToday();

  if (window === "all") return { from: "2000-01-01", to };
  if (window === "ytd") return { from: `${to.slice(0, 4)}-01-01`, to };

  const months = window === "3m" ? 3 : window === "6m" ? 6 : 12;
  return { from: Temporal.PlainDate.from(to).subtract({ months }).toString(), to };
}

/** Generate evenly-spaced date points between two dates at the given interval. */
export function generateDatePoints(from: string, to: string, interval: Interval): string[] {
  const points: string[] = [];
  let current = Temporal.PlainDate.from(from);
  const end = Temporal.PlainDate.from(to);

  while (Temporal.PlainDate.compare(current, end) <= 0) {
    points.push(current.toString());

    if (interval === "daily") {
      current = current.add({ days: 1 });
    } else if (interval === "weekly") {
      current = current.add({ weeks: 1 });
    } else {
      current = current.add({ months: 1 });
    }
  }

  // Always include the end date if not already there
  if (points.length === 0 || points[points.length - 1] !== to) {
    points.push(to);
  }

  return points;
}

// ─── Range Computation ────────────────────────────────────────────────────────

/** Compute the previous period of the same length (month-aligned) for comparison. */
export function computeCompareRange(range: DateRange): ComputedRange {
  const from = Temporal.PlainYearMonth.from(range.dateFrom.slice(0, 7));
  const to = Temporal.PlainYearMonth.from(range.dateTo.slice(0, 7));

  // Count months in range (first-of-month to last-of-month)
  const months = Math.max(1, (to.year - from.year) * 12 + (to.month - from.month) + 1);

  // Previous period: shift back by that many months, aligned to month boundaries
  const compareStartYm = from.subtract({ months });
  const compareEndYm = from.subtract({ months: 1 });

  return {
    ...range,
    compareDateFrom: compareStartYm.toPlainDate({ day: 1 }).toString(),
    compareDateTo: compareEndYm.toPlainDate({ day: compareEndYm.daysInMonth }).toString(),
    months,
  };
}
