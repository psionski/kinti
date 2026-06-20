import { isoDate } from "./rng";

type MonthSpec = { year: number; month: number; lastDay: number };

export interface RecurringTemplate {
  amount: number;
  /** ISO 4217. Defaults to the configured base ("EUR" for the seed). */
  currency?: string;
  type: "income" | "expense";
  description: string;
  merchant: string;
  categoryId: number;
  frequency: "monthly";
  dayOfMonth: number;
  startDate: string;
  lastGenerated: string;
  /** Optional tags. Propagated by the recurring service to every generated row. */
  tags?: string[];
}

/**
 * Build recurring transaction template definitions.
 *
 * Each template carries everything `generateMonth` needs to emit its own
 * occurrences — `generateMonth` no longer hardcodes any of these. Adding
 * a new monthly template here is enough to surface it in both the
 * recurring page and the generated transaction history.
 *
 * Templates may have their own start date so foreign-currency or
 * shorter-history templates (e.g. "London co-working", which only spans
 * the most recent 6 months) coexist with the full-year ones.
 */
export function generateRecurringTemplates(
  catIds: Record<string, number>,
  months: MonthSpec[],
  todayStr: string
): RecurringTemplate[] {
  const firstMonth = months[0];
  const fullStartDate = isoDate(firstMonth.year, firstMonth.month, 1);

  // London co-working starts ~6 months in to demo a "newer" recurring
  // pattern with shorter history than the rest.
  const londonStartMonth = months[Math.max(0, months.length - 6)];
  const londonStartDate = isoDate(londonStartMonth.year, londonStartMonth.month, 1);

  return [
    {
      amount: 750,
      type: "expense",
      description: "Monthly rent",
      merchant: "Landlord",
      categoryId: catIds.Rent,
      frequency: "monthly",
      dayOfMonth: 1,
      startDate: fullStartDate,
      lastGenerated: todayStr,
      tags: ["housing", "rent"],
    },
    {
      amount: 15.99,
      type: "expense",
      description: "Netflix Standard",
      merchant: "Netflix",
      categoryId: catIds.Subscriptions,
      frequency: "monthly",
      dayOfMonth: 1,
      startDate: fullStartDate,
      lastGenerated: todayStr,
      tags: ["subscription", "streaming"],
    },
    {
      amount: 8.99,
      type: "expense",
      description: "Amazon Prime",
      merchant: "Amazon",
      categoryId: catIds.Subscriptions,
      frequency: "monthly",
      dayOfMonth: 1,
      startDate: fullStartDate,
      lastGenerated: todayStr,
      tags: ["subscription"],
    },
    {
      amount: 9.99,
      type: "expense",
      description: "Spotify Premium",
      merchant: "Spotify",
      categoryId: catIds.Subscriptions,
      frequency: "monthly",
      dayOfMonth: 5,
      startDate: fullStartDate,
      lastGenerated: todayStr,
      tags: ["subscription", "music"],
    },
    {
      amount: 0.99,
      type: "expense",
      description: "iCloud+ 50GB",
      merchant: "Apple",
      categoryId: catIds.Subscriptions,
      frequency: "monthly",
      dayOfMonth: 10,
      startDate: fullStartDate,
      lastGenerated: todayStr,
      tags: ["subscription"],
    },
    {
      amount: 29.99,
      type: "expense",
      description: "Internet bill",
      merchant: "Telekom",
      categoryId: catIds.Utilities,
      frequency: "monthly",
      dayOfMonth: 15,
      startDate: fullStartDate,
      lastGenerated: todayStr,
      tags: ["bills", "internet"],
    },
    {
      amount: 2800,
      type: "income",
      description: "Monthly salary",
      merchant: "Employer",
      categoryId: catIds.Income,
      frequency: "monthly",
      dayOfMonth: 25,
      startDate: fullStartDate,
      lastGenerated: todayStr,
      tags: ["salary"],
    },
    // ── London co-working (GBP) ────────────────────────────────────────
    // Foreign-currency recurring template with month-by-month FX drift.
    // Each generated occurrence has its own amount_base computed by
    // generateMonth via the FX lookup, exactly as the runtime recurring
    // engine would do.
    {
      amount: 150,
      currency: "GBP",
      type: "expense",
      description: "London co-working",
      merchant: "Workspace London",
      categoryId: catIds.Subscriptions,
      frequency: "monthly",
      dayOfMonth: 1,
      startDate: londonStartDate,
      lastGenerated: todayStr,
      tags: ["work", "travel"],
    },
  ];
}
