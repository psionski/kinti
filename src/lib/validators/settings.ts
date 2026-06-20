import { z } from "zod";
import { CurrencySchema } from "./common";

/** Validates an IANA timezone identifier (e.g. "Europe/Amsterdam", "UTC"). */
export const TimezoneSchema = z.string().refine(
  (tz) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid IANA timezone identifier" }
);

export const SetTimezoneSchema = z.object({
  timezone: TimezoneSchema.describe(
    "IANA timezone identifier (e.g. 'Europe/Amsterdam', 'America/New_York')"
  ),
});

export type SetTimezoneInput = z.infer<typeof SetTimezoneSchema>;

export const SetBaseCurrencySchema = z.object({
  currency: CurrencySchema.describe(
    "ISO 4217 currency code (e.g. 'EUR', 'USD', 'GBP'). Immutable after first set."
  ),
});

export type SetBaseCurrencyInput = z.infer<typeof SetBaseCurrencySchema>;
