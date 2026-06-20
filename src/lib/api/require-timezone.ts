import { redirect } from "next/navigation";
import { getSettingsService } from "@/lib/api/services";

/**
 * Redirects to /settings if either timezone or base currency is not configured.
 * Returns both — both are required before any page can render meaningfully.
 *
 * Pages should call this at the top of the server component.
 */
export function requireOnboarding(): { timezone: string; baseCurrency: string } {
  const settings = getSettingsService();
  const timezone = settings.getTimezone();
  const baseCurrency = settings.getBaseCurrency();
  if (timezone === null || baseCurrency === null) redirect("/settings");
  return { timezone, baseCurrency };
}

/**
 * @deprecated Use {@link requireOnboarding} instead — base currency is now
 * also part of the onboarding gate. Kept for backward-compat in any callers
 * that only need the timezone string.
 */
export function requireTimezone(): string {
  return requireOnboarding().timezone;
}
