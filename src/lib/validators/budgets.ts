import { z } from "zod";
import { YearMonthSchema } from "./common";
import { BudgetStatusItemSchema } from "./reports";

// ─── Response ────────────────────────────────────────────────────────────────

export const BudgetResponseSchema = z.object({
  id: z.number().int(),
  categoryId: z.number().int(),
  month: z.string(),
  amount: z.number(),
});

export type BudgetResponse = z.infer<typeof BudgetResponseSchema>;

// ─── Set Budget ───────────────────────────────────────────────────────────────

export const SetBudgetSchema = z.object({
  categoryId: z
    .number()
    .int()
    .positive("Category ID is required")
    .describe("Category to set budget for"),
  month: YearMonthSchema.describe("Month in YYYY-MM format"),
  amount: z
    .number()
    .positive("Amount must be positive")
    .describe("Monthly budget amount in EUR (e.g. 500)"),
});

export type SetBudgetInput = z.infer<typeof SetBudgetSchema>;

// ─── Get Budget Status ────────────────────────────────────────────────────────

export const GetBudgetStatusSchema = z.object({
  month: YearMonthSchema.describe("Month in YYYY-MM format"),
});

export type GetBudgetStatusInput = z.infer<typeof GetBudgetStatusSchema>;

// ─── Delete Budget ───────────────────────────────────────────────────────────

export const DeleteBudgetSchema = z.object({
  categoryId: z.number().int().positive("Category ID is required").describe("Category ID"),
  month: YearMonthSchema.describe("Month in YYYY-MM format"),
});

export type DeleteBudgetInput = z.infer<typeof DeleteBudgetSchema>;

// ─── Reset Budgets ────────────────────────────────────────────────────────────

export const ResetBudgetsSchema = z.object({
  month: YearMonthSchema.describe("Month in YYYY-MM format to reset"),
});

export type ResetBudgetsInput = z.infer<typeof ResetBudgetsSchema>;

// ─── Budget Status Response ───────────────────────────────────────────────────

export const BudgetStatusResponseSchema = z.object({
  items: z.array(BudgetStatusItemSchema),
  inheritedFrom: z.string().nullable(),
  currency: z
    .string()
    .describe("ISO 4217 base currency that all budget amounts are denominated in"),
});

export type BudgetStatusResponse = z.infer<typeof BudgetStatusResponseSchema>;

// ─── Budget History ──────────────────────────────────────────────────────────

export const BudgetHistorySchema = z.object({
  months: z.number().int().min(1).max(24).default(6),
});

export type BudgetHistoryInput = z.infer<typeof BudgetHistorySchema>;

export interface BudgetHistoryPoint {
  month: string;
  totalBudget: number;
  totalSpent: number;
  percentUsed: number;
}
