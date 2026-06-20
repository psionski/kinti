import { Temporal } from "@js-temporal/polyfill";
import { eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { recurringTransactions, transactions } from "@/lib/db/schema";
import type { RecurringTransaction } from "@/lib/db/schema";
import type {
  CreateRecurringInput,
  UpdateRecurringInput,
  RecurringResponse,
} from "@/lib/validators/recurring";
import { isoToday, utcToLocal } from "@/lib/date-ranges";
import { getBaseCurrency, roundToCurrency } from "@/lib/format";
import type { FinancialDataService } from "./financial-data";

type Db = BetterSQLite3Database<typeof schema>;

function parseTags(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

// ─── Date math helpers ────────────────────────────────────────────────────────

/** Convert Temporal dayOfWeek (1=Mon..7=Sun) to JS convention (0=Sun..6=Sat). */
function toJsDow(temporalDow: number): number {
  return temporalDow % 7;
}

/**
 * Compute the next occurrence of a recurring template after `afterDate` (YYYY-MM-DD).
 * Returns null if the template is inactive, has ended, or has no future occurrences.
 */
export function computeNextOccurrence(r: RecurringTransaction, afterDate: string): string | null {
  if (!r.isActive) return null;

  const after = Temporal.PlainDate.from(afterDate);
  if (r.endDate && Temporal.PlainDate.compare(Temporal.PlainDate.from(r.endDate), after) <= 0) {
    return null;
  }

  const start = Temporal.PlainDate.from(r.startDate);
  const cursor = after.add({ days: 1 });
  const base = Temporal.PlainDate.compare(cursor, start) < 0 ? start : cursor;

  let candidate: Temporal.PlainDate;

  switch (r.frequency) {
    case "daily": {
      candidate = base;
      break;
    }
    case "weekly": {
      // r.dayOfWeek uses JS convention (0=Sun..6=Sat), Temporal uses 1=Mon..7=Sun
      const targetDow = r.dayOfWeek ?? toJsDow(start.dayOfWeek);
      const baseDow = toJsDow(base.dayOfWeek);
      const diff = (((targetDow - baseDow) % 7) + 7) % 7;
      candidate = base.add({ days: diff });
      break;
    }
    case "monthly": {
      const targetDay = r.dayOfMonth ?? start.day;
      // Try the target day in the base's month (constrain clips to last day if needed)
      candidate = base.with({ day: targetDay });
      // If that's before base, advance one month
      if (Temporal.PlainDate.compare(candidate, base) < 0) {
        candidate = base.add({ months: 1 }).with({ day: 1 }).with({ day: targetDay });
      }
      break;
    }
    case "yearly": {
      candidate = Temporal.PlainDate.from({ year: base.year, month: start.month, day: start.day });
      if (Temporal.PlainDate.compare(candidate, base) < 0) {
        candidate = candidate.add({ years: 1 });
      }
      break;
    }
    default:
      return null;
  }

  if (r.endDate && Temporal.PlainDate.compare(candidate, Temporal.PlainDate.from(r.endDate)) > 0) {
    return null;
  }
  return candidate.toString();
}

/**
 * Enumerate all occurrence dates for a recurring template between `fromDate` (exclusive)
 * and `upToDate` (inclusive). Both are YYYY-MM-DD strings.
 */
function occurrencesBetween(r: RecurringTransaction, fromDate: string, upToDate: string): string[] {
  const results: string[] = [];
  const end = Temporal.PlainDate.from(upToDate);
  let cursor = fromDate;

  while (true) {
    const next = computeNextOccurrence(r, cursor);
    if (!next) break;
    if (Temporal.PlainDate.compare(Temporal.PlainDate.from(next), end) > 0) break;
    results.push(next);
    cursor = next;
  }

  return results;
}

function parseRecurring(row: RecurringTransaction, afterDateStr: string): RecurringResponse {
  return {
    ...row,
    type: row.type as "income" | "expense",
    frequency: row.frequency as "daily" | "weekly" | "monthly" | "yearly",
    tags: parseTags(row.tags),
    nextOccurrence: computeNextOccurrence(row, afterDateStr),
    createdAt: utcToLocal(row.createdAt),
    updatedAt: utcToLocal(row.updatedAt),
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class RecurringService {
  constructor(
    private db: Db,
    private financialData?: FinancialDataService
  ) {}

  async create(input: CreateRecurringInput): Promise<RecurringResponse> {
    const [row] = this.db
      .insert(recurringTransactions)
      .values({
        amount: input.amount,
        currency: input.currency ?? getBaseCurrency(),
        type: input.type,
        description: input.description,
        merchant: input.merchant,
        categoryId: input.categoryId,
        frequency: input.frequency,
        dayOfMonth: input.dayOfMonth ?? null,
        dayOfWeek: input.dayOfWeek ?? null,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        notes: input.notes,
        tags: input.tags ? JSON.stringify(input.tags) : null,
      })
      .returning()
      .all();

    const today = isoToday();
    await this.generateForTemplate(row, today);
    // Re-read to pick up lastGenerated updated by generateForTemplate
    const fresh = this.db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.id, row.id))
      .get()!;
    return parseRecurring(fresh, today);
  }

  list(): RecurringResponse[] {
    const today = isoToday();
    return this.db
      .select()
      .from(recurringTransactions)
      .orderBy(recurringTransactions.description)
      .all()
      .map((r) => parseRecurring(r, today));
  }

  getById(id: number): RecurringResponse | null {
    const [row] = this.db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.id, id))
      .all();
    return row ? parseRecurring(row, isoToday()) : null;
  }

  update(id: number, input: UpdateRecurringInput): RecurringResponse | null {
    const rows = this.db
      .update(recurringTransactions)
      .set({
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.merchant !== undefined ? { merchant: input.merchant } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
        ...(input.dayOfMonth !== undefined ? { dayOfMonth: input.dayOfMonth } : {}),
        ...(input.dayOfWeek !== undefined ? { dayOfWeek: input.dayOfWeek } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive ? 1 : 0 } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.tags !== undefined
          ? { tags: input.tags !== null ? JSON.stringify(input.tags) : null }
          : {}),
        updatedAt: sql`(datetime('now'))`,
      })
      .where(eq(recurringTransactions.id, id))
      .returning()
      .all();

    return rows.length > 0 ? parseRecurring(rows[0], isoToday()) : null;
  }

  delete(id: number): boolean {
    const result = this.db
      .delete(recurringTransactions)
      .where(eq(recurringTransactions.id, id))
      .returning()
      .all();
    return result.length > 0;
  }

  /**
   * Generate pending transactions for a single recurring template up to `upToDate`.
   * Creates transactions for dates after `lastGenerated` (or `startDate`) up to
   * and including `upToDate`. Returns the number of transactions created.
   *
   * Each generated row stores `amount_base` computed at generation time using
   * the FX rate for that day — so a EUR-base instance generating a USD rent
   * payment correctly captures the rate fluctuation across months.
   */
  private async generateForTemplate(r: RecurringTransaction, upToDate: string): Promise<number> {
    const fromStr = r.lastGenerated
      ? r.lastGenerated
      : Temporal.PlainDate.from(r.startDate).subtract({ days: 1 }).toString();

    if (
      r.endDate &&
      Temporal.PlainDate.compare(
        Temporal.PlainDate.from(r.endDate),
        Temporal.PlainDate.from(fromStr)
      ) < 0
    ) {
      return 0;
    }

    const dates = occurrencesBetween(r, fromStr, upToDate);
    if (dates.length === 0) return 0;

    const base = getBaseCurrency();
    const rowsToInsert: Array<typeof transactions.$inferInsert> = [];

    for (const date of dates) {
      let amountBase = roundToCurrency(r.amount, base);
      if (r.currency !== base) {
        if (!this.financialData) {
          throw new Error(
            `Recurring template ${r.id} is in ${r.currency} but recurring service has no ` +
              `FinancialDataService injected — cannot compute amount_base for generated rows.`
          );
        }
        const result = await this.financialData.convertToBase(r.amount, r.currency, date);
        if (result === null) {
          throw new Error(
            `Cannot convert ${r.currency} → ${base} on ${date} for recurring template ${r.id}.`
          );
        }
        amountBase = result.amountBase;
      }

      rowsToInsert.push({
        amount: r.amount,
        currency: r.currency,
        amountBase,
        type: r.type,
        description: r.description,
        merchant: r.merchant,
        categoryId: r.categoryId,
        date,
        recurringId: r.id,
        notes: r.notes,
        tags: r.tags,
      });
    }

    this.db.insert(transactions).values(rowsToInsert).run();

    this.db
      .update(recurringTransactions)
      .set({
        lastGenerated: dates[dates.length - 1],
        updatedAt: sql`(datetime('now'))`,
      })
      .where(eq(recurringTransactions.id, r.id))
      .run();

    return dates.length;
  }

  /**
   * Generate all pending transactions for active recurring templates up to today.
   * Returns the total number of transactions created.
   */
  async generatePending(upTo?: string): Promise<number> {
    const upToStr = upTo ?? isoToday();
    const active = this.db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.isActive, 1))
      .all();

    let created = 0;
    for (const r of active) {
      created += await this.generateForTemplate(r, upToStr);
    }

    return created;
  }
}
