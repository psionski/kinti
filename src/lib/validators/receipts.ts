import { z } from "zod";
import { PaginationSchema, IsoDateSchema } from "./common";

// ─── Response ─────────────────────────────────────────────────────────────────

export const ReceiptResponseSchema = z.object({
  id: z.number().int(),
  merchant: z.string().nullable(),
  date: z.string(),
  total: z.number().nullable(),
  imageUrl: z.url().nullable(), // absolute URL, e.g. http://localhost:4000/api/receipts/{id}/image — null if no image uploaded
  rawText: z.string().nullable(),
  createdAt: z.string(),
});

export type ReceiptResponse = z.infer<typeof ReceiptResponseSchema>;

// ─── Create (metadata only — image file comes via multipart) ──────────────────

export const CreateReceiptSchema = z.object({
  merchant: z.string().max(255).optional(),
  date: IsoDateSchema.optional(),
  total: z.number().min(0).optional(),
  rawText: z.string().max(10000).optional(),
});

export type CreateReceiptInput = z.infer<typeof CreateReceiptSchema>;

// ─── List ─────────────────────────────────────────────────────────────────────

export const ListReceiptsSchema = PaginationSchema.extend({
  dateFrom: IsoDateSchema.optional().describe("Start of date range (YYYY-MM-DD)"),
  dateTo: IsoDateSchema.optional().describe("End of date range (YYYY-MM-DD)"),
  merchant: z.string().max(255).optional().describe("Filter by merchant (substring match)"),
});

export type ListReceiptsInput = z.infer<typeof ListReceiptsSchema>;

// ─── List Unprocessed ─────────────────────────────────────────────────────────

export const ListUnprocessedReceiptsSchema = PaginationSchema;

export type ListUnprocessedReceiptsInput = z.infer<typeof ListUnprocessedReceiptsSchema>;

// ─── Delete Batch ─────────────────────────────────────────────────────────────

export const DeleteReceiptsBatchSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, "At least one ID required").max(200),
});

export type DeleteReceiptsBatchInput = z.infer<typeof DeleteReceiptsBatchSchema>;
