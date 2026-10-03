import { describe, it, expect } from "vitest";
import {
  toCreateRecurringBody,
  toUpdateRecurringBody,
} from "@/components/recurring/recurring-request";
import type { RecurringFormData } from "@/components/recurring/recurring-form-dialog";
import { CreateRecurringSchema, UpdateRecurringSchema } from "@/lib/validators/recurring";

const FILLED: RecurringFormData = {
  type: "expense",
  description: "Rent",
  amount: 900,
  currency: "EUR",
  frequency: "monthly",
  startDate: "2026-01-01",
  merchant: "Landlord",
  categoryId: 3,
  endDate: "2026-12-31",
  notes: "Flat 4",
  dayOfMonth: 1,
  dayOfWeek: null,
};

const BLANK: RecurringFormData = {
  ...FILLED,
  merchant: "",
  categoryId: null,
  endDate: "",
  notes: "",
  dayOfMonth: null,
};

describe("toCreateRecurringBody", () => {
  it("leaves blank optional fields out", () => {
    const body = toCreateRecurringBody(BLANK);

    expect(body).toMatchObject({ merchant: undefined, categoryId: undefined, endDate: undefined });
    expect(body.notes).toBeUndefined();
    expect(body.dayOfMonth).toBeUndefined();
    expect(CreateRecurringSchema.safeParse(body).success).toBe(true);
  });

  it("sends what the form filled in", () => {
    const body = toCreateRecurringBody(FILLED);

    expect(body).toMatchObject({ merchant: "Landlord", categoryId: 3, dayOfMonth: 1 });
    expect(CreateRecurringSchema.safeParse(body).success).toBe(true);
  });
});

describe("toUpdateRecurringBody", () => {
  it("clears the fields the user emptied instead of keeping their old values", () => {
    const body = toUpdateRecurringBody(BLANK);

    expect(body).toMatchObject({
      merchant: null,
      categoryId: null,
      endDate: null,
      notes: null,
      dayOfMonth: null,
    });
    expect(UpdateRecurringSchema.safeParse(body).success).toBe(true);
  });

  it("drops the day of month when a template turns weekly", () => {
    const body = toUpdateRecurringBody({
      ...FILLED,
      frequency: "weekly",
      dayOfMonth: null,
      dayOfWeek: 2,
    });

    expect(body).toMatchObject({ frequency: "weekly", dayOfMonth: null, dayOfWeek: 2 });
  });

  it("drops both days when a template turns daily", () => {
    const body = toUpdateRecurringBody({ ...FILLED, frequency: "daily", dayOfMonth: null });

    expect(body).toMatchObject({ dayOfMonth: null, dayOfWeek: null });
  });
});
