import { z } from "zod";
import { isoToday } from "@/lib/date-ranges";

// ─── Shared Primitives ───────────────────────────────────────────────────────

/** ISO 8601 date string: YYYY-MM-DD */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

/**
 * ISO 4217 currency code (3 uppercase letters), validated against the runtime's
 * known currency list when available. Falls back to a strict format check on
 * older runtimes that don't expose `Intl.supportedValuesOf`.
 */
export const CurrencySchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(
    z
      .string()
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO 4217 code")
      .refine(isKnownCurrency, "Unknown ISO 4217 currency code")
  );

const knownCurrencies = (() => {
  try {
    return new Set(Intl.supportedValuesOf("currency"));
  } catch {
    return null;
  }
})();

function isKnownCurrency(code: string): boolean {
  if (knownCurrencies === null) return true;
  return knownCurrencies.has(code);
}

/** ISO date that must not be in the future (user's configured timezone). */
export const PastOrTodayDateSchema = IsoDateSchema.refine(
  (d) => d <= isoToday(),
  "Date cannot be in the future"
);

/** YYYY-MM month format */
export const YearMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format");

export const TransactionTypeSchema = z.enum(["income", "expense", "transfer"]);

export const FrequencySchema = z.enum(["daily", "weekly", "monthly", "yearly"]);

/** Generic integer ID parameter for MCP tools and API routes */
export const IdSchema = z.object({ id: z.number().int().positive() });

// ─── Pagination ───────────────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export type PaginationParams = z.infer<typeof PaginationSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ─── Error Envelope ───────────────────────────────────────────────────────────

export const ErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: ErrorCodeSchema,
  details: z.unknown().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
