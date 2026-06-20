import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { budgets } from "@/lib/db/schema";
import type {
  SetBudgetInput,
  GetBudgetStatusInput,
  BudgetResponse,
  BudgetStatusResponse,
  BudgetHistoryPoint,
} from "@/lib/validators/budgets";
import type { ReportService } from "./reports";
import { ensureOwnRows, monthHasOwnRows } from "./budget-inheritance";
import { getCurrentMonth } from "@/lib/date-ranges";

type Db = BetterSQLite3Database<typeof schema>;

export class BudgetService {
  constructor(
    private db: Db,
    private reportService: ReportService
  ) {}

  /**
   * Upsert a budget for a category + month.
   * If the month has no own rows yet, materializes inherited budgets first (copy-on-write).
   * Re-adding a previously soft-deleted budget un-deletes it.
   */
  set(input: SetBudgetInput): BudgetResponse {
    ensureOwnRows(this.db, input.month);

    const existing = this.db
      .select()
      .from(budgets)
      .where(and(eq(budgets.categoryId, input.categoryId), eq(budgets.month, input.month)))
      .all();

    if (existing.length > 0) {
      const [row] = this.db
        .update(budgets)
        .set({ amount: input.amount, deleted: 0 })
        .where(and(eq(budgets.categoryId, input.categoryId), eq(budgets.month, input.month)))
        .returning()
        .all();
      return row;
    } else {
      const [row] = this.db
        .insert(budgets)
        .values({
          categoryId: input.categoryId,
          month: input.month,
          amount: input.amount,
          deleted: 0,
        })
        .returning()
        .all();
      return row;
    }
  }

  /**
   * Returns budget status for every category that has an effective budget in the given month,
   * enriched with actual spend from transactions (including child category rollup).
   * Returns `inheritedFrom` so the UI can show the source month.
   */
  getForMonth(input: GetBudgetStatusInput): BudgetStatusResponse {
    const {
      items: allStats,
      inheritedFrom,
      currency,
    } = this.reportService.getBudgetStats({
      month: input.month,
      type: "expense",
      includeZeroSpend: true,
      includeUncategorized: false,
    });

    const items = allStats
      .filter((s) => s.budgetAmount !== null)
      .map((s) => {
        const budgetAmount = s.budgetAmount!;
        const spentAmount = s.rollupTotal;
        const remaining = budgetAmount - spentAmount;
        const percentUsed =
          budgetAmount > 0
            ? Math.round((spentAmount / budgetAmount) * 10000) / 100
            : spentAmount > 0
              ? Infinity
              : 0;
        return {
          categoryId: s.categoryId!,
          categoryName: s.categoryName!,
          budgetAmount,
          spentAmount,
          remainingAmount: remaining,
          percentUsed,
          isOver: spentAmount > budgetAmount,
        };
      });

    return { items, inheritedFrom, currency };
  }

  /**
   * Soft-delete a budget row for a category + month.
   * If the month has no own rows yet, materializes inherited budgets first (copy-on-write).
   * Returns true if a row was affected.
   */
  delete(categoryId: number, month: string): boolean {
    ensureOwnRows(this.db, month);

    const existing = this.db
      .select({ id: budgets.id })
      .from(budgets)
      .where(and(eq(budgets.categoryId, categoryId), eq(budgets.month, month)))
      .all();

    if (existing.length === 0) return false;

    this.db
      .update(budgets)
      .set({ deleted: 1 })
      .where(and(eq(budgets.categoryId, categoryId), eq(budgets.month, month)))
      .run();
    return true;
  }

  /**
   * Hard-delete ALL budget rows for a month, making it fall back to inheritance.
   * This is the "Reset to inherited" action.
   */
  resetToInherited(month: string): void {
    this.db.delete(budgets).where(eq(budgets.month, month)).run();
  }

  /** Returns all budget rows for a given category, sorted by month. */
  listForCategory(categoryId: number): BudgetResponse[] {
    return this.db
      .select()
      .from(budgets)
      .where(and(eq(budgets.categoryId, categoryId), eq(budgets.deleted, 0)))
      .orderBy(budgets.month)
      .all();
  }

  /** Returns true if the month has its own explicit budget rows (not inherited). */
  hasOwnRows(month: string): boolean {
    return monthHasOwnRows(this.db, month);
  }

  /** Returns budget totals for each of the last N months. */
  getHistory(months: number): BudgetHistoryPoint[] {
    const current = getCurrentMonth();
    const [curYear, curMonth] = current.split("-").map(Number);
    const points: BudgetHistoryPoint[] = [];

    for (let i = months - 1; i >= 0; i--) {
      // Pure arithmetic: shift month backwards by i
      const totalMonths = curYear * 12 + (curMonth - 1) - i;
      const y = Math.floor(totalMonths / 12);
      const m = (totalMonths % 12) + 1;
      const month = `${y}-${String(m).padStart(2, "0")}`;
      const { items: status } = this.getForMonth({ month });

      const totalBudget = status.reduce((sum, b) => sum + b.budgetAmount, 0);
      const totalSpent = status.reduce((sum, b) => sum + b.spentAmount, 0);
      const percentUsed =
        totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 10000) / 100 : 0;

      points.push({ month, totalBudget, totalSpent, percentUsed });
    }

    return points;
  }
}
