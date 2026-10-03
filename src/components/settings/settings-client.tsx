"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setBaseCurrencyCache } from "@/lib/format";
import { setUserTimezone } from "@/lib/date-ranges";
import { useSetBaseCurrency, useSetTimezone } from "@/lib/queries/settings";
import { Section } from "./settings-section";
import { TimezonePicker } from "./timezone-picker";
import { CurrencyPicker } from "./currency-picker";
import { CashBalanceSection } from "./cash-balance-section";
import { SavingsSection } from "./savings-section";
import { InvestmentsSection } from "./investments-section";
import { ProvidersSection } from "./providers-section";
import { BackupManager } from "./backup-manager";

// ─── Onboarding steps (after timezone + base currency) ──────────────────────

type OnboardingStep =
  "base-currency" | "cash" | "savings" | "investments" | "providers" | "backups" | "done";
const ONBOARDING_ORDER: OnboardingStep[] = [
  "base-currency",
  "cash",
  "savings",
  "investments",
  "providers",
  "backups",
  "done",
];

function nextStep(current: OnboardingStep): OnboardingStep {
  const idx = ONBOARDING_ORDER.indexOf(current);
  return ONBOARDING_ORDER[Math.min(idx + 1, ONBOARDING_ORDER.length - 1)]!;
}

function stepReached(current: OnboardingStep, target: OnboardingStep): boolean {
  return ONBOARDING_ORDER.indexOf(current) >= ONBOARDING_ORDER.indexOf(target);
}

// ─── Locale-based currency detection ─────────────────────────────────────────

/**
 * Best-effort default base currency from the browser locale.
 * Used as the initial selection when the user has not yet picked one.
 * Falls back to EUR if Intl can't resolve a region.
 */
function detectLocaleCurrency(): string {
  try {
    const locale = new Intl.Locale(navigator.language);
    // Newer browsers expose `getCurrencies()` on Intl.Locale.
    const withCurrencies = locale as Intl.Locale & { getCurrencies?: () => string[] };
    const currencies = withCurrencies.getCurrencies?.();
    if (currencies && currencies.length > 0) return currencies[0]!;
  } catch {
    // ignore
  }
  return "EUR";
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface SettingsClientProps {
  /** The saved timezone, or `null` before onboarding has set one. */
  initialTimezone: string | null;
  /** The saved base currency, or `null` before onboarding has set one. */
  initialBaseCurrency: string | null;
}

export function SettingsClient({
  initialTimezone,
  initialBaseCurrency,
}: SettingsClientProps): React.ReactElement {
  const router = useRouter();
  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [timezone, setTimezone] = useState(initialTimezone ?? detectedTz);
  const saveTimezone = useSetTimezone();

  const [baseCurrency, setBaseCurrency] = useState<string>(
    initialBaseCurrency ?? detectLocaleCurrency()
  );
  const saveBaseCurrency = useSetBaseCurrency();
  // Locked once persisted (whether from initial load or just saved this session).
  // Drives the picker disabled state, hides the Save button, and gates the
  // cash/savings/investments/providers/backups sections below.
  const baseCurrencyLocked = initialBaseCurrency !== null || saveBaseCurrency.isSuccess;

  // First setup if either timezone or base currency is missing.
  const isFirstSetup = initialTimezone === null || initialBaseCurrency === null;

  // Determine the starting onboarding step based on what's already configured.
  const initialStep: OnboardingStep = !isFirstSetup
    ? "done"
    : initialBaseCurrency === null
      ? "base-currency"
      : "cash";

  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>(initialStep);
  const [timezoneSaved, setTimezoneSaved] = useState(initialTimezone !== null);

  const allRevealed = onboardingStep === "done";
  const lastRevealedRef = useRef<HTMLDivElement>(null);

  /** Reveal the step after `step` — only while `step` is the one being shown. */
  function advanceFrom(step: OnboardingStep): void {
    setOnboardingStep((current) => (current === step ? nextStep(step) : current));
  }

  function scrollToRevealed(): void {
    lastRevealedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    if (isFirstSetup && !allRevealed) {
      lastRevealedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [onboardingStep, timezoneSaved, isFirstSetup, allRevealed]);

  function handleSaveTimezone(): void {
    saveTimezone.mutate(
      { timezone },
      {
        onSuccess: () => {
          if (isFirstSetup) {
            // First setup doesn't reload, so the client's date module still
            // holds the timezone the layout rendered with (UTC when none was
            // saved). The opening lots the next steps record are dated
            // "today" in this one.
            setUserTimezone(timezone);
            setTimezoneSaved(true);
          } else {
            window.location.reload();
          }
        },
      }
    );
  }

  function handleSaveBaseCurrency(): void {
    saveBaseCurrency.mutate(
      { currency: baseCurrency },
      {
        onSuccess: ({ currency }) => {
          // Sync the client format cache so any subsequent formatCurrency() calls
          // pick up the new base currency. The server cache is refreshed on the
          // next request via the root layout. No reload needed: this only happens
          // during first-time onboarding, so there's no rendered data to refresh.
          setBaseCurrencyCache(currency);
          advanceFrom("base-currency");
        },
      }
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        {isFirstSetup && (
          <p className="text-muted-foreground mt-1">
            Welcome to Kinti! Configure your timezone and base currency to get started.
          </p>
        )}
      </div>

      <Section title="Timezone" icon={null}>
        <div className="max-w-md space-y-4">
          <div className="space-y-2">
            <TimezonePicker value={timezone} onChange={setTimezone} />
            <p className="text-muted-foreground text-xs">
              Determines what &quot;today&quot; and &quot;this month&quot; mean throughout the app.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSaveTimezone} disabled={saveTimezone.isPending}>
              {saveTimezone.isPending ? "Saving..." : "Save"}
            </Button>
            {saveTimezone.error && (
              <p className="text-destructive text-sm">{saveTimezone.error.message}</p>
            )}
          </div>
        </div>
      </Section>

      {timezoneSaved && stepReached(onboardingStep, "base-currency") && (
        <div ref={onboardingStep === "base-currency" ? lastRevealedRef : undefined}>
          <Section title="Base currency" icon={null}>
            <div className="max-w-md space-y-4">
              <div className="space-y-2">
                <CurrencyPicker
                  id="base-currency"
                  value={baseCurrency}
                  onChange={setBaseCurrency}
                  disabled={baseCurrencyLocked}
                />
                <p className="text-muted-foreground text-xs">
                  All report totals, budgets, cash balance, and net worth roll up into this
                  currency.{" "}
                  {baseCurrencyLocked ? "" : "Choose carefully — this can't be changed later."}
                </p>
              </div>
              {!baseCurrencyLocked && (
                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleSaveBaseCurrency}
                    disabled={saveBaseCurrency.isPending || !baseCurrency}
                  >
                    {saveBaseCurrency.isPending ? "Saving..." : "Save"}
                  </Button>
                  {saveBaseCurrency.error && (
                    <p className="text-destructive text-sm">{saveBaseCurrency.error.message}</p>
                  )}
                </div>
              )}
            </div>
          </Section>
        </div>
      )}

      {baseCurrencyLocked && (
        <>
          {stepReached(onboardingStep, "cash") && (
            <div ref={onboardingStep === "cash" ? lastRevealedRef : undefined}>
              <CashBalanceSection
                isOnboarding={onboardingStep === "cash"}
                onContinue={() => advanceFrom("cash")}
              />
            </div>
          )}

          {stepReached(onboardingStep, "savings") && (
            <div ref={onboardingStep === "savings" ? lastRevealedRef : undefined}>
              <SavingsSection
                isOnboarding={onboardingStep === "savings"}
                onContinue={() => advanceFrom("savings")}
              />
            </div>
          )}

          {stepReached(onboardingStep, "investments") && (
            <div ref={onboardingStep === "investments" ? lastRevealedRef : undefined}>
              <InvestmentsSection
                isOnboarding={onboardingStep === "investments"}
                onContinue={() => advanceFrom("investments")}
              />
            </div>
          )}

          {stepReached(onboardingStep, "providers") && (
            <div ref={onboardingStep === "providers" ? lastRevealedRef : undefined}>
              <ProvidersSection
                isOnboarding={onboardingStep === "providers"}
                onContentLoaded={onboardingStep === "providers" ? scrollToRevealed : undefined}
                onContinue={() => advanceFrom("providers")}
              />
            </div>
          )}

          {stepReached(onboardingStep, "backups") && (
            <div ref={onboardingStep === "backups" ? lastRevealedRef : undefined}>
              <BackupManager
                isOnboarding={onboardingStep === "backups"}
                onContinue={() => {
                  setOnboardingStep("done");
                  // The root layout rendered before onboarding saved the
                  // timezone and base currency. Refresh it first so its
                  // TimezoneInit/BaseCurrencyInit hand the client the saved
                  // values before the dashboard mounts.
                  router.refresh();
                  router.push("/");
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
