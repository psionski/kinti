import {
  integer,
  real,
  sqliteTable,
  text,
  index,
  uniqueIndex,
  check,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── Categories ──────────────────────────────────────────────────────────────

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  parentId: integer("parent_id").references((): AnySQLiteColumn => categories.id, {
    onDelete: "set null",
  }),
  icon: text("icon"),
  color: text("color"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Receipts ─────────────────────────────────────────────────────────────────

export const receipts = sqliteTable("receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  merchant: text("merchant"),
  date: text("date").notNull(),
  total: real("total"),
  imagePath: text("image_path"),
  rawText: text("raw_text"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Recurring Transactions ───────────────────────────────────────────────────

export const recurringTransactions = sqliteTable(
  "recurring_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    amount: real("amount").notNull(),
    currency: text("currency").notNull().default("EUR"), // ISO 4217. Generated transactions inherit this.
    type: text("type").notNull().default("expense"),
    description: text("description").notNull(),
    merchant: text("merchant"),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    frequency: text("frequency").notNull(), // 'daily' | 'weekly' | 'monthly' | 'yearly'
    dayOfMonth: integer("day_of_month"),
    dayOfWeek: integer("day_of_week"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    lastGenerated: text("last_generated"),
    isActive: integer("is_active").notNull().default(1),
    notes: text("notes"),
    tags: text("tags"), // JSON array of strings
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_recurring_active").on(table.isActive),
    index("idx_recurring_frequency").on(table.frequency, table.isActive),
    check("recurring_type_check", sql`${table.type} IN ('income', 'expense')`),
    check(
      "recurring_frequency_check",
      sql`${table.frequency} IN ('daily', 'weekly', 'monthly', 'yearly')`
    ),
  ]
);

// ─── Transactions ─────────────────────────────────────────────────────────────

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    amount: real("amount").notNull(), // native amount: positive for income/expense, signed for transfers (negative = cash out, positive = cash in)
    currency: text("currency").notNull().default("EUR"), // ISO 4217 native currency
    amountBase: real("amount_base").notNull().default(0), // amount converted to the configured base currency at write time (denormalized for fast aggregation)
    type: text("type").notNull().default("expense"), // 'income' | 'expense' | 'transfer'
    description: text("description").notNull(),
    merchant: text("merchant"),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    date: text("date").notNull(), // ISO 8601 YYYY-MM-DD
    receiptId: integer("receipt_id").references(() => receipts.id, {
      onDelete: "set null",
    }),
    recurringId: integer("recurring_id").references(() => recurringTransactions.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    tags: text("tags"), // JSON array of strings
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_transactions_date").on(table.date),
    index("idx_transactions_category").on(table.categoryId),
    index("idx_transactions_date_category").on(table.date, table.categoryId),
    index("idx_transactions_merchant").on(table.merchant),
    index("idx_transactions_amount").on(table.amount),
    index("idx_transactions_type_date").on(table.type, table.date),
    index("idx_transactions_receipt").on(table.receiptId),
    index("idx_transactions_recurring").on(table.recurringId),
    check("transactions_type_check", sql`${table.type} IN ('income', 'expense', 'transfer')`),
  ]
);

// ─── Budgets ──────────────────────────────────────────────────────────────────

export const budgets = sqliteTable(
  "budgets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // YYYY-MM
    amount: real("amount").notNull(),
    deleted: integer("deleted").notNull().default(0), // soft-delete: 1 = deleted
  },
  (table) => [
    index("idx_budgets_month").on(table.month),
    index("idx_budgets_category_month").on(table.categoryId, table.month),
    uniqueIndex("uq_budgets_category_month").on(table.categoryId, table.month),
  ]
);

// ─── Settings ─────────────────────────────────────────────────────────────────

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ─── Market Prices (unified: crypto, stocks, exchange rates) ─────────────────

export const marketPrices = sqliteTable(
  "market_prices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    symbol: text("symbol").notNull(), // ticker/id: 'AAPL', 'bitcoin', 'SPX'
    price: real("price").notNull(),
    currency: text("currency").notNull(), // what currency the price is in
    date: text("date").notNull(), // YYYY-MM-DD
    provider: text("provider").notNull(),
    fetchedAt: text("fetched_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_market_prices_symbol").on(table.symbol, table.date),
    uniqueIndex("uq_market_prices_symbol_currency_date").on(
      table.symbol,
      table.currency,
      table.date
    ),
  ]
);

// ─── Assets ───────────────────────────────────────────────────────────────────

export const assets = sqliteTable(
  "assets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    type: text("type").notNull(), // 'deposit' | 'investment' | 'crypto' | 'other'
    currency: text("currency").notNull().default("EUR"),
    symbolMap: text("symbol_map"), // JSON: {"coingecko":"bitcoin","alpha-vantage":"BTC"}. NULL = manual pricing
    icon: text("icon"),
    color: text("color"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    check("assets_type_check", sql`${table.type} IN ('deposit', 'investment', 'crypto', 'other')`),
  ]
);

// ─── Asset Lots ───────────────────────────────────────────────────────────────

export const assetLots = sqliteTable(
  "asset_lots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    assetId: integer("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    quantity: real("quantity").notNull(), // positive = buy/deposit, negative = sell/withdraw
    pricePerUnit: real("price_per_unit").notNull(), // native, in the asset's currency
    pricePerUnitBase: real("price_per_unit_base").notNull().default(0), // converted to base currency at lot creation; constant for the life of the lot
    date: text("date").notNull(), // ISO 8601 date
    transactionId: integer("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_asset_lots_asset").on(table.assetId),
    index("idx_asset_lots_date").on(table.assetId, table.date),
    index("idx_asset_lots_transaction").on(table.transactionId),
  ]
);

// ─── Asset Prices ─────────────────────────────────────────────────────────────

export const assetPrices = sqliteTable(
  "asset_prices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    assetId: integer("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    pricePerUnit: real("price_per_unit").notNull(),
    recordedAt: text("recorded_at").notNull(), // ISO 8601 datetime
  },
  (table) => [
    index("idx_asset_prices_asset").on(table.assetId),
    index("idx_asset_prices_latest").on(table.assetId, table.recordedAt),
  ]
);

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Receipt = typeof receipts.$inferSelect;
export type NewReceipt = typeof receipts.$inferInsert;
export type RecurringTransaction = typeof recurringTransactions.$inferSelect;
export type NewRecurringTransaction = typeof recurringTransactions.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
export type MarketPrice = typeof marketPrices.$inferSelect;
export type NewMarketPrice = typeof marketPrices.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type AssetLot = typeof assetLots.$inferSelect;
export type NewAssetLot = typeof assetLots.$inferInsert;
export type AssetPrice = typeof assetPrices.$inferSelect;
export type NewAssetPrice = typeof assetPrices.$inferInsert;
