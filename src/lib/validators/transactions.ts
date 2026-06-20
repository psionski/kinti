import { z } from "zod";
import { PaginationSchema, IsoDateSchema, TransactionTypeSchema, CurrencySchema } from "./common";

// ─── Response ────────────────────────────────────────────────────────────────

export const TransactionResponseSchema = z.object({
  id: z.number().int(),
  amount: z.number().describe("Native amount in the transaction's own currency"),
  currency: z.string().describe("ISO 4217 currency of the native amount"),
  amountBase: z
    .number()
    .describe(
      "Amount converted to the configured base currency at the time the transaction was written. " +
        "Use this for aggregations across mixed-currency transactions."
    ),
  type: z.enum(["income", "expense", "transfer"]),
  description: z.string(),
  merchant: z.string().nullable(),
  categoryId: z.number().int().nullable(),
  date: z.string(),
  receiptId: z.number().int().nullable(),
  recurringId: z.number().int().nullable(),
  notes: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TransactionResponse = z.infer<typeof TransactionResponseSchema>;

export const PaginatedTransactionsResponseSchema = z.object({
  data: z.array(TransactionResponseSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  hasMore: z.boolean(),
});

export type PaginatedTransactionsResponse = z.infer<typeof PaginatedTransactionsResponseSchema>;

// ─── Create ───────────────────────────────────────────────────────────────────

export const CreateTransactionSchema = z.object({
  amount: z
    .number()
    .refine((n) => n !== 0, "Amount must not be zero")
    .describe("Native amount (e.g. 12.10). Always positive for income and expense."),
  currency: CurrencySchema.optional().describe(
    "ISO 4217 currency of the amount. Defaults to the configured base currency. " +
      "Foreign currencies are converted to the base currency at write time using the configured FX providers; " +
      "the create fails if no provider can resolve the rate for the transaction date."
  ),
  type: TransactionTypeSchema.default("expense").describe("Defaults to 'expense'"),
  description: z
    .string()
    .min(1, "Description is required")
    .max(500)
    .describe("What was purchased or a summary of the transaction"),
  merchant: z.string().max(255).optional().describe("Where it was purchased"),
  categoryId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Category ID — use list_categories to find valid values"),
  date: IsoDateSchema.optional().describe("YYYY-MM-DD. Defaults to today"),
  receiptId: z.number().int().positive().optional().describe("Link to an uploaded receipt"),
  recurringId: z.number().int().positive().optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
});

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;

// ─── Update ───────────────────────────────────────────────────────────────────

export const UpdateTransactionSchema = z.object({
  amount: z
    .number()
    .refine((n) => n !== 0, "Amount must not be zero")
    .optional(),
  currency: CurrencySchema.optional().describe(
    "ISO 4217 currency. Updating amount or currency triggers a fresh FX lookup to recompute amount_base."
  ),
  type: TransactionTypeSchema.optional(),
  description: z.string().min(1).max(500).optional(),
  merchant: z.string().max(255).nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  date: IsoDateSchema.optional(),
  receiptId: z.number().int().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().max(100)).max(20).nullable().optional(),
});

export type UpdateTransactionInput = z.infer<typeof UpdateTransactionSchema>;

// ─── Batch Create ─────────────────────────────────────────────────────────────

export const CreateTransactionsBatchSchema = z.object({
  transactions: z
    .array(CreateTransactionSchema)
    .min(1, "At least one transaction required")
    .max(100),
  receiptId: z.number().int().positive().optional(),
});

export type CreateTransactionsBatchInput = z.infer<typeof CreateTransactionsBatchSchema>;

// ─── List Filters ─────────────────────────────────────────────────────────────

export const ListTransactionsSchema = PaginationSchema.extend({
  dateFrom: IsoDateSchema.optional().describe("Start of date range (YYYY-MM-DD)"),
  dateTo: IsoDateSchema.optional().describe("End of date range (YYYY-MM-DD)"),
  categoryId: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .describe("Filter by category ID. Pass null for uncategorized only"),
  amountMin: z.number().min(0).optional().describe("Minimum amount"),
  amountMax: z.number().min(0).optional().describe("Maximum amount"),
  merchant: z.string().max(255).optional().describe("Filter by merchant (substring match)"),
  search: z
    .string()
    .max(255)
    .optional()
    .describe("Search across description, merchant, notes, and category name"),
  tags: z.array(z.string().max(100)).optional().describe("Filter by tags"),
  type: TransactionTypeSchema.optional(),
  receiptId: z.number().int().positive().optional(),
  recurringId: z.number().int().positive().optional(),
  sortBy: z.enum(["date", "amount", "merchant", "createdAt"]).default("date"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListTransactionsInput = z.infer<typeof ListTransactionsSchema>;

// ─── Batch Update ─────────────────────────────────────────────────────────────

export const UpdateTransactionsBatchSchema = z.object({
  updates: z
    .array(z.object({ id: z.number().int().positive(), ...UpdateTransactionSchema.shape }))
    .min(1, "At least one update required")
    .max(100),
});

export type UpdateTransactionsBatchInput = z.infer<typeof UpdateTransactionsBatchSchema>;

// ─── Delete Batch ─────────────────────────────────────────────────────────────

export const DeleteTransactionsBatchSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, "At least one ID required").max(200),
});

export type DeleteTransactionsBatchInput = z.infer<typeof DeleteTransactionsBatchSchema>;
