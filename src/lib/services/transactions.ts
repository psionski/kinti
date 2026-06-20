import {
  and,
  eq,
  ne,
  gte,
  lte,
  like,
  inArray,
  isNull,
  desc,
  asc,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { transactions, categories } from "@/lib/db/schema";
import type { Transaction } from "@/lib/db/schema";
import { buildChildrenMap, getDescendantIds } from "./category-hierarchy";
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
  CreateTransactionsBatchInput,
  UpdateTransactionsBatchInput,
  ListTransactionsInput,
  TransactionResponse,
} from "@/lib/validators/transactions";
import type { PaginatedResponse } from "@/lib/validators/common";
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

function parseTransaction(row: Transaction): TransactionResponse {
  return {
    ...row,
    type: row.type as "income" | "expense" | "transfer",
    tags: parseTags(row.tags),
    createdAt: utcToLocal(row.createdAt),
    updatedAt: utcToLocal(row.updatedAt),
  };
}

export class TransactionService {
  constructor(
    private db: Db,
    private financialData?: FinancialDataService
  ) {}

  /**
   * Resolve the native amount + currency to a base-currency amount. When the
   * currency matches the base, the conversion is a no-op (no provider call).
   * Otherwise, the financial-data service is consulted; on failure the create
   * is rejected with a clear error so we never store an unconvertible amount.
   *
   * `financialData` is optional in the constructor so existing callers (and
   * tests that don't care about FX) keep working in the base-currency case.
   * Foreign-currency creates without an injected FinancialDataService throw.
   */
  private async resolveAmountBase(amount: number, currency: string, date: string): Promise<number> {
    const base = getBaseCurrency();
    if (currency === base) return roundToCurrency(amount, base);
    if (!this.financialData) {
      throw new Error(
        `Cannot create ${currency} transaction without FinancialDataService — ` +
          `inject one when constructing TransactionService for multi-currency support.`
      );
    }
    // Sign of the input amount must be preserved (transfers are signed).
    const sign = amount < 0 ? -1 : 1;
    const result = await this.financialData.convertToBase(Math.abs(amount), currency, date);
    if (result === null) {
      throw new Error(
        `Currency ${currency} isn't supported by any configured FX provider on ${date} — ` +
          `cannot convert to base ${base}.`
      );
    }
    return sign * result.amountBase;
  }

  async create(input: CreateTransactionInput): Promise<TransactionResponse> {
    const date = input.date ?? isoToday();
    const currency = input.currency ?? getBaseCurrency();
    const amountBase = await this.resolveAmountBase(input.amount, currency, date);

    const [row] = this.db
      .insert(transactions)
      .values({
        amount: input.amount,
        currency,
        amountBase,
        type: input.type,
        description: input.description,
        merchant: input.merchant,
        categoryId: input.categoryId,
        date,
        receiptId: input.receiptId,
        recurringId: input.recurringId,
        notes: input.notes,
        tags: input.tags ? JSON.stringify(input.tags) : null,
      })
      .returning()
      .all();
    return parseTransaction(row);
  }

  async createBatch(input: CreateTransactionsBatchInput): Promise<TransactionResponse[]> {
    // Resolve FX for every line item before opening a write transaction so
    // any failure aborts the whole batch cleanly. Sequential to keep provider
    // load low — batches are typically small (single receipts).
    const resolved = await Promise.all(
      input.transactions.map(async (tx) => {
        const date = tx.date ?? isoToday();
        const currency = tx.currency ?? getBaseCurrency();
        const amountBase = await this.resolveAmountBase(tx.amount, currency, date);
        return {
          amount: tx.amount,
          currency,
          amountBase,
          type: tx.type,
          description: tx.description,
          merchant: tx.merchant,
          categoryId: tx.categoryId,
          date,
          receiptId: tx.receiptId ?? input.receiptId,
          recurringId: tx.recurringId,
          notes: tx.notes,
          tags: tx.tags ? JSON.stringify(tx.tags) : null,
        };
      })
    );

    return this.db.insert(transactions).values(resolved).returning().all().map(parseTransaction);
  }

  getById(id: number): TransactionResponse | null {
    const [row] = this.db.select().from(transactions).where(eq(transactions.id, id)).all();
    return row ? parseTransaction(row) : null;
  }

  list(input: ListTransactionsInput): PaginatedResponse<TransactionResponse> {
    const filters: SQL[] = [];

    if (input.dateFrom !== undefined) filters.push(gte(transactions.date, input.dateFrom));
    if (input.dateTo !== undefined) filters.push(lte(transactions.date, input.dateTo));
    if (input.categoryId !== undefined) {
      if (input.categoryId === null) {
        filters.push(isNull(transactions.categoryId));
      } else {
        // Include the category itself and all descendants
        const descendantIds = this.getDescendantCategoryIds(input.categoryId);
        const allIds = [input.categoryId, ...descendantIds];
        filters.push(inArray(transactions.categoryId, allIds));
      }
    }
    if (input.amountMin !== undefined) filters.push(gte(transactions.amount, input.amountMin));
    if (input.amountMax !== undefined) filters.push(lte(transactions.amount, input.amountMax));
    if (input.merchant !== undefined)
      filters.push(like(transactions.merchant, `%${input.merchant}%`));
    if (input.type !== undefined) filters.push(eq(transactions.type, input.type));
    else filters.push(ne(transactions.type, "transfer"));
    if (input.receiptId !== undefined) filters.push(eq(transactions.receiptId, input.receiptId));
    if (input.recurringId !== undefined)
      filters.push(eq(transactions.recurringId, input.recurringId));

    if (input.search !== undefined) {
      const clean = input.search.replace(/[^\p{L}\p{N}\s_]/gu, "").trim();
      if (clean) {
        const ftsQuery = `"${clean}"*`;
        filters.push(
          sql`${transactions.id} IN (SELECT rowid FROM transactions_fts WHERE transactions_fts MATCH ${ftsQuery})`
        );
      } else {
        filters.push(sql`0`);
      }
    }

    if (input.tags !== undefined && input.tags.length > 0) {
      const tagConditions = input.tags.map(
        (tag) => sql`EXISTS (SELECT 1 FROM json_each(${transactions.tags}) WHERE value = ${tag})`
      );
      filters.push(or(...tagConditions)!);
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    const sortColumnMap = {
      date: transactions.date,
      amount: transactions.amount,
      merchant: transactions.merchant,
      createdAt: transactions.createdAt,
    } as const;
    const sortCol = sortColumnMap[input.sortBy];
    const orderBy = input.sortOrder === "asc" ? asc(sortCol) : desc(sortCol);

    const [{ total }] = this.db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(transactions)
      .where(where)
      .all();

    const data = this.db
      .select()
      .from(transactions)
      .where(where)
      .orderBy(orderBy)
      .limit(input.limit)
      .offset(input.offset)
      .all()
      .map(parseTransaction);

    return {
      data,
      total,
      limit: input.limit,
      offset: input.offset,
      hasMore: input.offset + data.length < total,
    };
  }

  async update(id: number, input: UpdateTransactionInput): Promise<TransactionResponse | null> {
    // If amount, currency, or date changes, we need to recompute amount_base.
    // Read the existing row first so we can fall back to its values for any
    // field the caller didn't touch.
    const fxFieldsTouched =
      input.amount !== undefined || input.currency !== undefined || input.date !== undefined;

    let amountBase: number | undefined;
    if (fxFieldsTouched) {
      const existing = this.db.select().from(transactions).where(eq(transactions.id, id)).get();
      if (!existing) return null;
      const newAmount = input.amount ?? existing.amount;
      const newCurrency = input.currency ?? existing.currency;
      const newDate = input.date ?? existing.date;
      amountBase = await this.resolveAmountBase(newAmount, newCurrency, newDate);
    }

    return this.applyUpdate(id, input, amountBase);
  }

  /** Sync update used by both update() and updateBatch() after async FX work. */
  private applyUpdate(
    id: number,
    input: UpdateTransactionInput,
    amountBase: number | undefined
  ): TransactionResponse | null {
    const rows = this.db
      .update(transactions)
      .set({
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(amountBase !== undefined ? { amountBase } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.merchant !== undefined ? { merchant: input.merchant } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.date !== undefined ? { date: input.date } : {}),
        ...(input.receiptId !== undefined ? { receiptId: input.receiptId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.tags !== undefined
          ? { tags: input.tags !== null ? JSON.stringify(input.tags) : null }
          : {}),
        updatedAt: sql`(datetime('now'))`,
      })
      .where(eq(transactions.id, id))
      .returning()
      .all();

    return rows.length > 0 ? parseTransaction(rows[0]) : null;
  }

  async updateBatch(input: UpdateTransactionsBatchInput): Promise<TransactionResponse[]> {
    // Pre-compute amount_base for any update that touches amount/currency/date.
    // This async work happens before the SQLite transaction so the eventual
    // batch is still atomic (all updates commit together or none do).
    const resolved: Array<{
      id: number;
      fields: UpdateTransactionInput;
      amountBase?: number;
    }> = [];
    for (const { id, ...fields } of input.updates) {
      const fxFieldsTouched =
        fields.amount !== undefined || fields.currency !== undefined || fields.date !== undefined;
      let amountBase: number | undefined;
      if (fxFieldsTouched) {
        const existing = this.db.select().from(transactions).where(eq(transactions.id, id)).get();
        if (!existing) {
          resolved.push({ id, fields }); // will silently no-op below
          continue;
        }
        amountBase = await this.resolveAmountBase(
          fields.amount ?? existing.amount,
          fields.currency ?? existing.currency,
          fields.date ?? existing.date
        );
      }
      resolved.push({ id, fields, amountBase });
    }

    return this.db.transaction(() =>
      resolved.flatMap(({ id, fields, amountBase }) => {
        const result = this.applyUpdate(id, fields, amountBase);
        return result ? [result] : [];
      })
    );
  }

  delete(id: number): boolean {
    const result = this.db.delete(transactions).where(eq(transactions.id, id)).returning().all();
    return result.length > 0;
  }

  deleteBatch(ids: number[]): number {
    return this.db.delete(transactions).where(inArray(transactions.id, ids)).returning().all()
      .length;
  }

  /** Returns all descendant category IDs for a given category (children, grandchildren, etc). */
  private getDescendantCategoryIds(categoryId: number): number[] {
    const allCats = this.db
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories)
      .all();
    return getDescendantIds(categoryId, buildChildrenMap(allCats));
  }

  /** Returns all distinct tags across all transactions, sorted alphabetically. */
  listTags(): string[] {
    const rows = this.db.all<{ tag: string }>(
      sql`SELECT DISTINCT j.value AS tag
          FROM ${transactions}, json_each(${transactions.tags}) AS j
          WHERE ${transactions.tags} IS NOT NULL
          ORDER BY j.value`
    );
    return rows.map((r) => r.tag);
  }
}
