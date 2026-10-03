import type { z } from "zod";
import type { CreateRecurringSchema, UpdateRecurringSchema } from "@/lib/validators/recurring";
import type { RecurringFormData } from "./recurring-form-dialog";

/** The `POST /api/recurring` body for a filled-in form. Blank optional fields are left out. */
export function toCreateRecurringBody(
  data: RecurringFormData
): z.input<typeof CreateRecurringSchema> {
  return {
    type: data.type,
    description: data.description,
    amount: data.amount,
    currency: data.currency,
    frequency: data.frequency,
    startDate: data.startDate,
    merchant: data.merchant || undefined,
    categoryId: data.categoryId ?? undefined,
    endDate: data.endDate || undefined,
    notes: data.notes || undefined,
    dayOfMonth: data.dayOfMonth ?? undefined,
    dayOfWeek: data.dayOfWeek ?? undefined,
  };
}

/**
 * The `PATCH /api/recurring/{id}` body for an edited form. A field the user
 * emptied is sent as `null`, which clears it — leaving it out would keep the
 * old value. The same goes for a day that no longer fits the frequency, so a
 * template switched from monthly to weekly drops its day of month.
 */
export function toUpdateRecurringBody(
  data: RecurringFormData
): z.input<typeof UpdateRecurringSchema> {
  return {
    type: data.type,
    description: data.description,
    amount: data.amount,
    currency: data.currency,
    frequency: data.frequency,
    startDate: data.startDate,
    merchant: data.merchant || null,
    categoryId: data.categoryId,
    endDate: data.endDate || null,
    notes: data.notes || null,
    dayOfMonth: data.dayOfMonth,
    dayOfWeek: data.dayOfWeek,
  };
}
