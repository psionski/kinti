import { CHILD_CATEGORIES } from "./data";
import type { TxInput } from "./transactions";

export interface BudgetRow {
  categoryId: number;
  month: string;
  amount: number;
}

/** Round EUR amount up to the nearest €25. */
function roundTo25(amount: number): number {
  return Math.ceil(amount / 25) * 25;
}

/**
 * Generate realistic budgets based on actual generated spend.
 *
 * Budgeted categories (with sub-budgets where natural):
 * - Food & Drink (parent) + Dining (child) + Coffee (child)
 * - Entertainment (parent) + Subscriptions (child)
 * - Shopping
 */
export function generateBudgets(
  allTxs: TxInput[],
  catIds: Record<string, number>,
  months: Array<{ year: number; month: number }>
): BudgetRow[] {
  // Build parent → children map for rollup
  const childrenOf: Record<string, string[]> = {};
  for (const child of CHILD_CATEGORIES) {
    const siblings = childrenOf[child.parentName] ?? [];
    siblings.push(child.name);
    childrenOf[child.parentName] = siblings;
  }

  // Sum expense spend per category name per YYYY-MM. Sums `amountBase`,
  // not `amount`, so foreign-currency expenses contribute their
  // base-currency-equivalent value (matches how `BudgetService.getForMonth`
  // rolls up at runtime).
  const spendByCatMonth = new Map<string, number>();
  for (const tx of allTxs) {
    if (tx.type !== "expense") continue;
    const month = tx.date.slice(0, 7); // YYYY-MM
    const catName = Object.entries(catIds).find(([, id]) => id === tx.categoryId)?.[0];
    if (!catName) continue;
    const key = `${catName}|${month}`;
    spendByCatMonth.set(key, (spendByCatMonth.get(key) ?? 0) + tx.amountBase);
  }

  // Compute rollup spend: parent includes own + all children
  function rollupSpend(catName: string, month: string): number {
    let total = spendByCatMonth.get(`${catName}|${month}`) ?? 0;
    const children = childrenOf[catName];
    if (children) {
      for (const child of children) {
        total += spendByCatMonth.get(`${child}|${month}`) ?? 0;
      }
    }
    return total;
  }

  const budgetedCategories: Array<{ name: string; rollup: boolean }> = [
    { name: "Food & Drink", rollup: true },
    { name: "Dining", rollup: false },
    { name: "Coffee", rollup: false },
    { name: "Entertainment", rollup: true },
    { name: "Subscriptions", rollup: false },
    { name: "Shopping", rollup: false },
  ];

  const rows: BudgetRow[] = [];
  const monthStrs = months.map((m) => `${m.year}-${String(m.month).padStart(2, "0")}`);

  for (const { name, rollup } of budgetedCategories) {
    const monthlySpend = monthStrs.map((m) =>
      rollup ? rollupSpend(name, m) : (spendByCatMonth.get(`${name}|${m}`) ?? 0)
    );

    const avg = monthlySpend.reduce((a, b) => a + b, 0) / monthlySpend.length;
    const baseBudget = roundTo25(avg);

    for (const monthStr of monthStrs) {
      // December gets a ~20% uplift for Food & Drink and Entertainment (holiday season)
      const isDecember = monthStr.endsWith("-12");
      const isHolidayCategory =
        name === "Food & Drink" || name === "Dining" || name === "Entertainment";
      const amount = isDecember && isHolidayCategory ? roundTo25(baseBudget * 1.2) : baseBudget;

      rows.push({
        categoryId: catIds[name],
        month: monthStr,
        amount,
      });
    }
  }

  return rows;
}
