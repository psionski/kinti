/**
 * How the UI presents a transaction. A refund is stored as an expense with a negative
 * amount, so every sum over expenses nets it, but people enter and read it as a kind of
 * its own, with a positive amount.
 */
export type TransactionKind = "expense" | "income" | "refund" | "transfer";

/** The kinds a person enters by hand; transfers come from the asset flows. */
export type EntryKind = Exclude<TransactionKind, "transfer">;

export const KIND_LABELS: Record<TransactionKind, string> = {
  expense: "Expense",
  income: "Income",
  refund: "Refund",
  transfer: "Transfer",
};

export function kindOf(tx: { type: string; amount: number }): TransactionKind {
  if (tx.type === "income" || tx.type === "transfer") return tx.type;
  return tx.amount < 0 ? "refund" : "expense";
}

/** The stored type and signed amount for a kind entered with a positive amount. */
export function toStored(
  kind: EntryKind,
  amount: number
): { type: "income" | "expense"; amount: number } {
  return kind === "refund" ? { type: "expense", amount: -amount } : { type: kind, amount };
}

/** Money coming in, which the UI shows in emerald. */
export function isMoneyIn(kind: TransactionKind): boolean {
  return kind === "income" || kind === "refund";
}
