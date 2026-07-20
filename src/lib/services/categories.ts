import { and, eq, gte, lte, like, sql, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { categories, transactions, budgets } from "@/lib/db/schema";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  RecategorizeInput,
  MergeCategoriesInput,
  CategoryResponse,
  CategoryWithCountResponse,
} from "@/lib/validators/categories";
import { utcToLocal } from "@/lib/date-ranges";
import { requireRow } from "@/lib/db/rows";

type Db = BetterSQLite3Database<typeof schema>;

function parseCategory(row: schema.Category): CategoryResponse {
  return {
    ...row,
    createdAt: utcToLocal(row.createdAt),
    updatedAt: utcToLocal(row.updatedAt),
  };
}

export interface MergeResult {
  merged: true;
  sourceCategoryName: string;
  targetCategoryName: string;
  transactionsMoved: number;
  budgetsTransferred: number;
}

export class CategoryService {
  constructor(private db: Db) {}

  create(input: CreateCategoryInput): CategoryResponse {
    const row = requireRow(
      this.db
        .insert(categories)
        .values({
          name: input.name,
          parentId: input.parentId ?? null,
          icon: input.icon,
          color: input.color,
        })
        .returning()
        .all(),
      "category"
    );
    return parseCategory(row);
  }

  /** Returns all categories with transaction counts. Parent/child hierarchy is represented via `parentId`. */
  getAll(): CategoryWithCountResponse[] {
    const allCategories = this.db.select().from(categories).all();

    const counts = this.db
      .select({
        categoryId: transactions.categoryId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(transactions)
      .groupBy(transactions.categoryId)
      .all();

    const countMap = new Map<number, number>();
    for (const { categoryId, count } of counts) {
      if (categoryId !== null) countMap.set(categoryId, count);
    }

    return allCategories.map((cat) => ({
      ...parseCategory(cat),
      transactionCount: countMap.get(cat.id) ?? 0,
    }));
  }

  getById(id: number): CategoryResponse | null {
    const [row] = this.db.select().from(categories).where(eq(categories.id, id)).all();
    return row ? parseCategory(row) : null;
  }

  update(id: number, input: UpdateCategoryInput): CategoryResponse | null {
    const rows = this.db
      .update(categories)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        updatedAt: sql`(datetime('now'))`,
      })
      .where(eq(categories.id, id))
      .returning()
      .all();

    const row = rows[0];
    return row ? parseCategory(row) : null;
  }

  delete(id: number): boolean {
    const result = this.db.delete(categories).where(eq(categories.id, id)).returning().all();
    return result.length > 0;
  }

  /**
   * Bulk-move transactions matching the given filters to a new category.
   * When dryRun is true, returns the count without modifying data.
   */
  recategorize(input: RecategorizeInput): number {
    const filters: SQL[] = [];

    if (input.sourceCategoryId !== undefined) {
      filters.push(eq(transactions.categoryId, input.sourceCategoryId));
    }
    if (input.merchantPattern !== undefined) {
      filters.push(like(transactions.merchant, `%${input.merchantPattern}%`));
    }
    if (input.descriptionPattern !== undefined) {
      filters.push(like(transactions.description, `%${input.descriptionPattern}%`));
    }
    if (input.dateFrom !== undefined) {
      filters.push(gte(transactions.date, input.dateFrom));
    }
    if (input.dateTo !== undefined) {
      filters.push(lte(transactions.date, input.dateTo));
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    if (input.dryRun) {
      const [row] = this.db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(transactions)
        .where(where)
        .all();
      return row?.count ?? 0;
    }

    return this.db
      .update(transactions)
      .set({
        categoryId: input.targetCategoryId,
        updatedAt: sql`(datetime('now'))`,
      })
      .where(where)
      .returning()
      .all().length;
  }

  /**
   * Merge source category into target:
   * - All transactions reassigned to target
   * - Non-conflicting budgets transferred to target (conflicting ones are dropped)
   * - Source category deleted (cascade-deletes remaining budgets)
   */
  merge(input: MergeCategoriesInput): MergeResult {
    const { sourceCategoryId, targetCategoryId } = input;

    const source = this.getById(sourceCategoryId);
    if (!source) throw new Error(`Source category ${sourceCategoryId} not found`);
    const target = this.getById(targetCategoryId);
    if (!target) throw new Error(`Target category ${targetCategoryId} not found`);

    let transactionsMoved = 0;
    let budgetsTransferred = 0;

    this.db.transaction((tx) => {
      // Move all transactions to target
      transactionsMoved = tx
        .update(transactions)
        .set({
          categoryId: targetCategoryId,
          updatedAt: sql`(datetime('now'))`,
        })
        .where(eq(transactions.categoryId, sourceCategoryId))
        .returning()
        .all().length;

      // Transfer budgets that don't conflict with an existing target budget for the same month
      budgetsTransferred = tx
        .update(budgets)
        .set({ categoryId: targetCategoryId })
        .where(
          and(
            eq(budgets.categoryId, sourceCategoryId),
            sql`${budgets.month} NOT IN (SELECT month FROM budgets WHERE category_id = ${targetCategoryId})`
          )
        )
        .returning()
        .all().length;

      // Delete source category — cascade-deletes any remaining source budgets
      tx.delete(categories).where(eq(categories.id, sourceCategoryId)).run();
    });

    return {
      merged: true,
      sourceCategoryName: source.name,
      targetCategoryName: target.name,
      transactionsMoved,
      budgetsTransferred,
    };
  }
}
