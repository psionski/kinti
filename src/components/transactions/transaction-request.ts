import type { z } from "zod";
import type {
  CreateTransactionSchema,
  UpdateTransactionSchema,
} from "@/lib/validators/transactions";
import type { TransactionFormData } from "./transaction-form";

/** The `POST /api/transactions` body for a filled-in form. Empty optional fields are left out. */
export function toCreateBody(data: TransactionFormData): z.input<typeof CreateTransactionSchema> {
  return {
    amount: data.amount,
    currency: data.currency,
    type: data.type,
    description: data.description,
    date: data.date,
    merchant: data.merchant || undefined,
    categoryId: data.categoryId ?? undefined,
    notes: data.notes || undefined,
    tags: data.tags.length > 0 ? data.tags : undefined,
  };
}

/** The `PATCH /api/transactions/{id}` body for an edited form. Emptied fields are cleared. */
export function toUpdateBody(data: TransactionFormData): z.input<typeof UpdateTransactionSchema> {
  return {
    amount: data.amount,
    currency: data.currency,
    type: data.type,
    description: data.description,
    date: data.date,
    merchant: data.merchant || null,
    categoryId: data.categoryId,
    notes: data.notes || null,
    tags: data.tags.length > 0 ? data.tags : null,
  };
}
